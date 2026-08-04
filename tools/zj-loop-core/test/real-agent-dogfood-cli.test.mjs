import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runRealAgentDogfoodCli } from '../dist/real-agent-dogfood-cli.js';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';
import { createInMemoryHumanAuthorityProvider } from '../dist/human-authority.js';
import { createInMemoryHumanSigner } from '../dist/human-signer.js';
import { createHumanAuthoritySetInitializationFromStore, recordHumanAuthoritySetInitialization } from '../dist/human-authority-set-store.js';
import { createAdmissionBoundExecution } from '../dist/trusted-runner-admission-binding.js';
import { createTrustedRunnerRegistryMutation, trustedRunnerCapabilitiesDigest } from '../dist/trusted-runner-registry.js';
import { admitTrustedRunnerExecution, recordTrustedRunnerRegistryMutation, readTrustedRunnerRegistry } from '../dist/trusted-runner-registry-store.js';
import { providerAuthRefDigest } from '../dist/provider-auth-runtime.js';
import { createRealAgentDogfoodGraphPlan } from '../dist/real-agent-dogfood-graph-orchestrator.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

function providerAuthRef(network_id, execution_id, attempt, provider_id = 'codex') {
  const unsigned = { schema: 'zj-loop.provider_auth_ref.v1', auth_ref_id: `auth-${execution_id}`, network_id, node_id: 'node-1', provider_runtime_id: 'provider-runtime-1', provider_id, execution_id, attempt, issuer: 'provider-runtime-1', audience: 'model-api', scope: ['model:invoke'], issued_at: '2026-08-01T00:00:00.000Z', expires_at: '2026-08-02T00:00:00.000Z', status: 'active' };
  return { ...unsigned, ref_digest: providerAuthRefDigest(unsigned) };
}
const runtimeBinding = { runtime_identity_fingerprint: 'sha256:' + '6'.repeat(64), runtime_manifest_digest: 'sha256:' + '7'.repeat(64), provider_capabilities_digest: 'sha256:' + '8'.repeat(64) };

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
    assert.equal(summary.execution_mode, 'read-only');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('start persists an explicitly approved write-enabled execution mode in the approval summary', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-real-agent-write-mode-'));
  const repo = path.join(root, 'repo');
  const runtime = path.join(root, 'runtime');
  await mkdir(repo);
  await mkdir(runtime);
  await initGitRepo(repo);
  try {
    const result = await invoke([
      'start', '--goal', 'write the approved test atom', '--repo', repo,
      '--provider-id', 'codex', '--adapter', 'codex-agent-provider.v1',
      '--executable', '/usr/bin/true', '--network-policy', 'network-allowed',
      '--execution-mode', 'write-enabled', '--allowed-file', 'tools/zj-loop-core/test/native-opn-tracer.test.mjs', '--state-store', path.join(runtime, 'state.db'),
      '--evidence-store', path.join(runtime, 'evidence'), '--worktree-root', path.join(runtime, 'worktrees'),
    ]);
    assert.equal(result.exitCode, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    const summary = JSON.parse(await readFile(output.approval_summary_path, 'utf8'));
    assert.equal(summary.execution_mode, 'write-enabled');
    assert.deepEqual(summary.allowed_files, ['tools/zj-loop-core/test/native-opn-tracer.test.mjs']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('Graph mode start reuses the exact prepared target and source worktrees', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-real-agent-graph-cli-'));
  const repo = path.join(root, 'repo');
  const runtime = path.join(root, 'runtime');
  const target = path.join(root, 'target');
  const source = path.join(root, 'source');
  const verifier = path.join(root, 'verifier');
  const evidence = path.join(root, 'evidence');
  const planPath = path.join(root, 'graph-plan.json');
  await mkdir(repo); await mkdir(runtime); await mkdir(verifier);
  await initGitRepo(repo);
  const baseline = (await run('git', ['rev-parse', 'HEAD'], { cwd: repo })).stdout.trim();
  await run('git', ['worktree', 'add', '-b', 'dogfood-target', target, baseline], { cwd: repo });
  await run('git', ['worktree', 'add', '-b', 'dogfood-source', source, baseline], { cwd: repo });
  const plan = createRealAgentDogfoodGraphPlan({ dogfood_id: 'dogfood-plan', execution_id: 'execution-plan', attempt: 1, goal: 'add the responsibility boundary test', repo_root: source, baseline_commit: baseline, target_worktree: target, source_worktree: source, verifier_worktree: verifier, evidence_store: evidence, allowed_files: ['tools/zj-loop-core/test/native-opn-tracer.test.mjs'], execution_mode: 'write-enabled', network_policy: 'network-allowed' });
  await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`);
  try {
    const result = await invoke(['start', '--goal', plan.goal, '--repo', source, '--provider-id', 'codex', '--adapter', 'codex-agent-provider.v1', '--executable', '/usr/bin/true', '--network-policy', 'network-allowed', '--execution-mode', 'write-enabled', '--allowed-file', plan.allowed_files[0], '--graph-plan', planPath, '--state-store', path.join(runtime, 'state.db'), '--evidence-store', evidence]);
    assert.equal(result.exitCode, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.status, 'awaiting-human-approval');
    assert.equal(output.dogfood_id, plan.dogfood_id);
    assert.equal(output.execution_id, plan.execution_id);
    const summary = JSON.parse(await readFile(output.approval_summary_path, 'utf8'));
    assert.equal(summary.graph_plan.plan_digest, plan.plan_digest);
    assert.equal(summary.worktree_path, source);
    assert.equal(summary.base_commit, baseline);
  } finally {
    await run('git', ['worktree', 'remove', '--force', source], { cwd: repo }).catch(() => {});
    await run('git', ['worktree', 'remove', '--force', target], { cwd: repo }).catch(() => {});
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
    const registrySigner = createInMemoryHumanSigner({ human_id: 'human-local' });
    const registryStore = createSqliteStateStore({ filename: statePath });
    const authorityInitialization = await createHumanAuthoritySetInitializationFromStore({ stateStore: registryStore, signer: registrySigner, network_id: created.network_id, mutation_id: 'authority-init', expected_revision: await registryStore.getRevision(created.network_id), reason: 'initialize trusted runner admission fixture', occurred_at: '2026-08-02T12:00:00.000Z' });
    assert.equal(authorityInitialization.status, 'ready');
    assert.equal((await recordHumanAuthoritySetInitialization({ stateStore: registryStore, initialization: authorityInitialization.initialization })).status, 'recorded');
    const registryMutation = await createTrustedRunnerRegistryMutation({ signer: registrySigner, network_id: created.network_id, mutation_id: 'runner-register', action: 'register', runner_id: 'runner-detached', new_public_key_fingerprint: 'b'.repeat(64), capabilities: ['process-boundary', 'output-bounds'], reason: 'register fixture runner', occurred_at: '2026-08-02T12:00:01.000Z', expected_revision: await registryStore.getRevision(created.network_id) });
    const registryRecorded = await recordTrustedRunnerRegistryMutation({ stateStore: registryStore, mutation: registryMutation, expected_revision: await registryStore.getRevision(created.network_id) });
    assert.equal(registryRecorded.status, 'recorded');
    const registry = await readTrustedRunnerRegistry({ stateStore: registryStore, network_id: created.network_id });
    await registryStore.close();
    const capabilities = ['process-boundary', 'output-bounds'];
    const admission = admitTrustedRunnerExecution({ snapshot: registry.snapshot, runner_id: 'runner-detached', required_capabilities: ['process-boundary'] });
    assert.equal(admission.status, 'admitted');
    const admissionContextPath = path.join(evidencePath, 'admission-bound-execution.json');
    const admissionBoundExecution = createAdmissionBoundExecution({
      preflight: { network_id: created.network_id, plan_id: 'plan-detached', plan_revision: 1, task_id: created.dogfood_id, execution_id: created.execution_id, attempt: 1, provider_id: 'codex', adapter_version: 'codex-agent-provider.v1', executable: summary.executable, executable_digest: 'sha256:' + 'a'.repeat(64), args: ['exec', '--json', '--ephemeral', '--sandbox', 'read-only', '--ask-for-approval', 'never', '--cd', summary.worktree_path], argv_digest: 'sha256:' + 'b'.repeat(64), cwd: summary.worktree_path, cwd_digest: 'sha256:' + 'c'.repeat(64), env_allowlist: [], env_policy_digest: 'sha256:' + 'd'.repeat(64), sandbox_policy_digest: 'sha256:' + 'e'.repeat(64), network_policy: { mode: 'network-denied', policy_digest: 'sha256:' + 'f'.repeat(64) }, timeout_ms: 30_000, termination_grace_ms: 1_000, max_stdout_bytes: 1024 * 1024, max_stderr_bytes: 1024 * 1024, orchestration_preflight_digest: 'sha256:' + '1'.repeat(64), issued_at: '2026-08-01T12:00:00.000Z', expires_at: '2026-08-01T13:00:00.000Z' },
      execution: { helper: { helper_id: 'helper-detached', helper_version: '1', protocol_version: 'zj-loop.trusted_runner_protocol.v1', executable_digest: 'sha256:' + '2'.repeat(64) } },
      admission: { ...admission, binding: { ...admission.binding, provider_auth_ref: providerAuthRef(created.network_id, created.execution_id, 1) } },
      runtime_binding: runtimeBinding,
    });
    await writeFile(admissionContextPath, JSON.stringify(admissionBoundExecution));
    const bound = await invoke(['bind-admission', '--dogfood-id', created.dogfood_id, '--network-id', created.network_id, '--admission-context', admissionContextPath, '--state-store', statePath, '--evidence-store', evidencePath]);
    assert.equal(bound.exitCode, 0, bound.stderr);
    const boundSummary = JSON.parse(await readFile(created.approval_summary_path, 'utf8'));
    const approval = await authority.signApprovalContext({ action: 'real-agent-dogfood.approve', request_id: created.dogfood_id, request_digest: boundSummary.summary_digest, network_id: created.network_id, device_key_id: 'device-1', device_fingerprint: 'a'.repeat(64), issued_at: new Date().toISOString(), expires_at: new Date(Date.now() + 60_000).toISOString() });
    await writeFile(path.join(evidencePath, 'approval-detached.json'), JSON.stringify({ schema: 'zj-loop.real_agent_dogfood_approval_envelope.v1', dogfood_id: created.dogfood_id, execution_id: created.execution_id, attempt: 1, lifecycle_revision: 4, policy_digest: boundSummary.policy_digest, approval_summary_digest: boundSummary.summary_digest, admission_digest: boundSummary.admission_digest, provider_auth_ref: boundSummary.provider_auth_ref, runtime_binding: boundSummary.runtime_binding, approval, identity: authority.getPublicIdentity() }));
    const resumed = await invoke(['resume', '--dogfood-id', created.dogfood_id, '--network-id', created.network_id, '--approval-id', 'approval-detached', '--admission-context', admissionContextPath, '--state-store', statePath, '--evidence-store', evidencePath]);
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
