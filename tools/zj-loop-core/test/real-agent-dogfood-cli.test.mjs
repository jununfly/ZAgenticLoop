import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runRealAgentDogfoodCli } from '../dist/real-agent-dogfood-cli.js';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';
import { createInMemoryHumanAuthorityProvider } from '../dist/human-authority.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

async function initGitRepo(repo) {
  await run('git', ['init', '-b', 'master'], { cwd: repo });
  await run('git', ['config', 'user.email', 'test@example.com'], { cwd: repo });
  await run('git', ['config', 'user.name', 'Test'], { cwd: repo });
  await writeFile(path.join(repo, 'README.md'), 'atom\n');
  await run('git', ['add', 'README.md'], { cwd: repo });
  await run('git', ['commit', '-m', 'initial'], { cwd: repo });
}

async function invoke(argv) {
  const stdout = [];
  const stderr = [];
  const exitCode = await runRealAgentDogfoodCli(argv, {
    stdout: (message) => stdout.push(message),
    stderr: (message) => stderr.push(message),
  });
  return { exitCode, stdout: stdout.join(''), stderr: stderr.join('') };
}

test('start persists preparation and returns awaiting-human-approval without running a provider', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-real-agent-cli-'));
  const repo = path.join(root, 'repo');
  const runtime = path.join(root, 'runtime');
  await mkdir(repo);
  await mkdir(runtime);
  await initGitRepo(repo);
  const statePath = path.join(runtime, 'state.db');
  const evidencePath = path.join(runtime, 'evidence');
  try {
    const result = await invoke([
      'start', '--goal', 'verify the atom', '--repo', repo,
      '--provider-id', 'provider-1', '--adapter', 'adapter-1',
      '--executable', '/usr/bin/true', '--network-policy', 'network-denied',
      '--state-store', statePath, '--evidence-store', evidencePath, '--worktree-root', path.join(runtime, 'worktrees'),
    ]);
    assert.equal(result.exitCode, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.status, 'awaiting-human-approval');
    assert.match(output.dogfood_id, /^dogfood-/);
    assert.equal(output.provider_invoked, false);
    assert.equal(output.next_action, 'human-approval');
    const store = createSqliteStateStore({ filename: statePath });
    try {
      const events = await store.readEvents({ network_id: output.network_id, aggregate_type: 'real-agent-dogfood', aggregate_id: output.dogfood_id });
      assert.equal(events.events.length, 3);
      assert.deepEqual(events.events.map((event) => event.payload.to_status), ['draft', 'preflight-ready', 'awaiting-human-approval']);
    } finally {
      await store.close();
    }
    const summary = JSON.parse(await readFile(output.approval_summary_path, 'utf8'));
    assert.equal(summary.goal, 'verify the atom');
    assert.equal(summary.status, 'awaiting-human-approval');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('status is read-only and reports the next human action', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-real-agent-status-'));
  const repo = path.join(root, 'repo');
  const runtime = path.join(root, 'runtime');
  await mkdir(repo);
  await mkdir(runtime);
  await initGitRepo(repo);
  const statePath = path.join(runtime, 'state.db');
  try {
    const started = await invoke(['start', '--goal', 'status atom', '--repo', repo, '--provider-id', 'provider-1', '--adapter', 'adapter-1', '--executable', '/usr/bin/true', '--network-policy', 'network-allowed', '--state-store', statePath, '--evidence-store', path.join(runtime, 'evidence'), '--worktree-root', path.join(runtime, 'worktrees')]);
    const created = JSON.parse(started.stdout);
    const beforeStore = createSqliteStateStore({ filename: statePath });
    const before = await beforeStore.getRevision(created.network_id);
    await beforeStore.close();
    const result = await invoke(['status', '--dogfood-id', created.dogfood_id, '--network-id', created.network_id, '--state-store', statePath]);
    assert.equal(result.exitCode, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.status, 'awaiting-human-approval');
    assert.equal(output.next_action, 'human-approval');
    const store = createSqliteStateStore({ filename: statePath });
    try { assert.equal(await store.getRevision(created.network_id), before); } finally { await store.close(); }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('start rejects StateStore and EvidenceStore paths inside the target repo', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-real-agent-paths-'));
  const repo = path.join(root, 'repo');
  await mkdir(repo);
  await initGitRepo(repo);
  try {
    const result = await invoke(['start', '--goal', 'reject unsafe storage', '--repo', repo, '--provider-id', 'provider-1', '--adapter', 'adapter-1', '--executable', '/usr/bin/true', '--network-policy', 'network-denied', '--state-store', path.join(repo, '.state.db'), '--evidence-store', path.join(repo, '.evidence')]);
    assert.equal(result.exitCode, 1);
    assert.match(result.stderr, /runtime-storage-path-inside-repo/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('resume consumes a persisted signed approval reference and enters running exactly once', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-real-agent-resume-'));
  const repo = path.join(root, 'repo');
  const runtime = path.join(root, 'runtime');
  await mkdir(repo);
  await mkdir(runtime);
  await initGitRepo(repo);
  const statePath = path.join(runtime, 'state.db');
  const evidencePath = path.join(runtime, 'evidence');
  try {
    const started = await invoke(['start', '--goal', 'approve the atom', '--repo', repo, '--provider-id', 'provider-1', '--adapter', 'adapter-1', '--executable', '/usr/bin/true', '--network-policy', 'network-denied', '--state-store', statePath, '--evidence-store', evidencePath, '--worktree-root', path.join(runtime, 'worktrees')]);
    const created = JSON.parse(started.stdout);
    const summary = JSON.parse(await readFile(created.approval_summary_path, 'utf8'));
    const authority = createInMemoryHumanAuthorityProvider({ human_id: 'human-1', protocol_version: 'v2', network_id: created.network_id, device_key_id: 'device-1', device_fingerprint: 'a'.repeat(64) });
    const approval = await authority.signApprovalContext({ action: 'real-agent-dogfood.approve', request_id: created.dogfood_id, request_digest: summary.summary_digest, network_id: created.network_id, device_key_id: 'device-1', device_fingerprint: 'a'.repeat(64), issued_at: new Date().toISOString(), expires_at: new Date(Date.now() + 60_000).toISOString() });
    await writeFile(path.join(evidencePath, 'approval-1.json'), JSON.stringify({ schema: 'zj-loop.real_agent_dogfood_approval_envelope.v1', dogfood_id: created.dogfood_id, execution_id: created.execution_id, attempt: 1, lifecycle_revision: 4, policy_digest: summary.policy_digest, approval_summary_digest: summary.summary_digest, approval, identity: authority.getPublicIdentity() }));
    const result = await invoke(['resume', '--dogfood-id', created.dogfood_id, '--network-id', created.network_id, '--approval-id', 'approval-1', '--state-store', statePath, '--evidence-store', evidencePath]);
    assert.equal(result.exitCode, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).status, 'running');
    assert.equal(JSON.parse(result.stdout).provider_invoked, false);
    assert.match(JSON.parse(result.stdout).worker_lease_id, /^lease-/);
    const repeated = await invoke(['resume', '--dogfood-id', created.dogfood_id, '--network-id', created.network_id, '--approval-id', 'approval-1', '--state-store', statePath, '--evidence-store', evidencePath]);
    assert.equal(repeated.exitCode, 0, repeated.stderr);
    assert.equal(JSON.parse(repeated.stdout).status, 'running');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('resume starts a detached Codex worker with a persisted execution context', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-real-agent-detached-worker-'));
  const repo = path.join(root, 'repo');
  const runtime = path.join(root, 'runtime');
  const executable = path.join(root, 'codex-fixture.sh');
  await mkdir(repo);
  await mkdir(runtime);
  await initGitRepo(repo);
  await writeFile(executable, '#!/bin/sh\ncat >/dev/null\nprintf detached-output\n');
  await chmod(executable, 0o700);
  const statePath = path.join(runtime, 'state.db');
  const evidencePath = path.join(runtime, 'evidence');
  try {
    const started = await invoke(['start', '--goal', 'run detached atom', '--repo', repo, '--provider-id', 'codex', '--adapter', 'codex-agent-provider.v1', '--executable', executable, '--network-policy', 'network-denied', '--state-store', statePath, '--evidence-store', evidencePath, '--worktree-root', path.join(runtime, 'worktrees')]);
    const created = JSON.parse(started.stdout);
    const summary = JSON.parse(await readFile(created.approval_summary_path, 'utf8'));
    const authority = createInMemoryHumanAuthorityProvider({ human_id: 'human-1', protocol_version: 'v2', network_id: created.network_id, device_key_id: 'device-1', device_fingerprint: 'a'.repeat(64) });
    const approval = await authority.signApprovalContext({ action: 'real-agent-dogfood.approve', request_id: created.dogfood_id, request_digest: summary.summary_digest, network_id: created.network_id, device_key_id: 'device-1', device_fingerprint: 'a'.repeat(64), issued_at: new Date().toISOString(), expires_at: new Date(Date.now() + 60_000).toISOString() });
    await writeFile(path.join(evidencePath, 'approval-detached.json'), JSON.stringify({ schema: 'zj-loop.real_agent_dogfood_approval_envelope.v1', dogfood_id: created.dogfood_id, execution_id: created.execution_id, attempt: 1, lifecycle_revision: 4, policy_digest: summary.policy_digest, approval_summary_digest: summary.summary_digest, approval, identity: authority.getPublicIdentity() }));
    const resumed = await invoke(['resume', '--dogfood-id', created.dogfood_id, '--network-id', created.network_id, '--approval-id', 'approval-detached', '--state-store', statePath, '--evidence-store', evidencePath]);
    assert.equal(resumed.exitCode, 0, resumed.stderr);
    const output = JSON.parse(resumed.stdout);
    assert.equal(output.status, 'running');
    assert.equal(output.worker_started, true);
    assert.match(output.worker_context_path, /worker-context\.json$/);
    const store = createSqliteStateStore({ filename: statePath });
    try {
      let latest;
      for (let attempt = 0; attempt < 30; attempt++) {
        const snapshot = await store.readEvents({ network_id: created.network_id, aggregate_type: 'real-agent-dogfood', aggregate_id: created.dogfood_id });
        latest = snapshot.events.at(-1)?.payload?.to_status;
        if (latest === 'outcome-uncertain' || latest === 'blocked') break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      assert.equal(latest, 'outcome-uncertain');
    } finally {
      await store.close();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('resume without a persisted approval remains awaiting-human-approval', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-real-agent-resume-blocked-'));
  const repo = path.join(root, 'repo');
  const runtime = path.join(root, 'runtime');
  await mkdir(repo);
  await mkdir(runtime);
  await initGitRepo(repo);
  const statePath = path.join(runtime, 'state.db');
  try {
    const started = await invoke(['start', '--goal', 'wait for approval', '--repo', repo, '--provider-id', 'provider-1', '--adapter', 'adapter-1', '--executable', '/usr/bin/true', '--network-policy', 'network-denied', '--state-store', statePath, '--evidence-store', path.join(runtime, 'evidence'), '--worktree-root', path.join(runtime, 'worktrees')]);
    const created = JSON.parse(started.stdout);
    const result = await invoke(['resume', '--dogfood-id', created.dogfood_id, '--network-id', created.network_id, '--approval-id', 'missing', '--state-store', statePath, '--evidence-store', path.join(runtime, 'evidence')]);
    assert.equal(result.exitCode, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.status, 'awaiting-human-approval');
    assert.equal(output.reason_code, 'human-approval-required');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
