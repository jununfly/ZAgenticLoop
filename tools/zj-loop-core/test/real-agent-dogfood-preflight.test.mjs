import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createContentAddressedEvidenceStore } from '../dist/content-addressed-evidence-store.js';
import { createRealAgentDogfoodGraphPlan } from '../dist/real-agent-dogfood-graph-orchestrator.js';
import { preflightRealAgentDogfood } from '../dist/real-agent-dogfood-preflight.js';
import { runRealAgentDogfoodCli } from '../dist/real-agent-dogfood-cli.js';
import { REAL_AGENT_DOGFOOD_FAILURE_MATRIX_DIGEST } from '../dist/real-agent-dogfood-conformance.js';

const run = promisify(execFile);

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-preflight-'));
  const repo = path.join(root, 'repo');
  const evidence = path.join(root, 'evidence');
  const socket = path.join(root, 'runtime.sock');
  await run('mkdir', ['-p', repo]);
  await run('git', ['init', '-b', 'master'], { cwd: repo });
  await run('git', ['config', 'user.email', 'test@example.com'], { cwd: repo });
  await run('git', ['config', 'user.name', 'Test'], { cwd: repo });
  await writeFile(path.join(repo, 'README.md'), 'preflight\n');
  await run('git', ['add', 'README.md'], { cwd: repo });
  await run('git', ['commit', '-m', 'initial'], { cwd: repo });
  const baseline = (await run('git', ['rev-parse', 'HEAD'], { cwd: repo })).stdout.trim();
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(socket, resolve); });
  const plan = createRealAgentDogfoodGraphPlan({ dogfood_id: 'dogfood-preflight', execution_id: 'execution-preflight', attempt: 1, goal: 'preflight', repo_root: path.join(root, 'source'), baseline_commit: baseline, target_worktree: path.join(root, 'target'), source_worktree: path.join(root, 'source'), verifier_worktree: path.join(root, 'verifier'), evidence_store: evidence, allowed_files: ['README.md'], execution_mode: 'write-enabled', network_policy: 'network-allowed' });
  const evidenceStore = await createContentAddressedEvidenceStore({ root: evidence });
  return { root, repo, evidence, socket, plan, evidenceStore, server };
}

test('real dogfood preflight is execution-ready only when every gate is bound', async () => {
  const f = await fixture();
  try {
    const conformance = { schema: 'zj-loop.real_agent_dogfood_conformance_evidence.v1', status: 'passed', plan_digest: f.plan.plan_digest, core_commit: 'b'.repeat(40), test_command: ['npm', 'test'], failure_matrix_digest: REAL_AGENT_DOGFOOD_FAILURE_MATRIX_DIGEST, digest_profile: 'zj-loop.real-agent-dogfood-conformance.v1', exit_code: 0 };
    const evidence = await f.evidenceStore.put({ kind: 'conformance', content: JSON.stringify(conformance) });
    const result = await preflightRealAgentDogfood({ plan: f.plan, repo_root: f.repo, evidence_store: f.evidenceStore, conformance_evidence_digest: evidence.digest, provider_id: 'codex', provider_executable: '/usr/bin/true', provider_runtime_ipc: { socket_path: f.socket, contract_digest: 'sha256:' + '1'.repeat(64) }, human: { human_id: 'human-1', key_tag: 'key-1', helper_path: '/usr/bin/true' }, platform: 'darwin' });
    assert.equal(result.status, 'execution-ready');
    assert.equal(result.side_effects_executed, false);
    assert.equal(result.checks.find((item) => item.id === 'keychain-config').reason, undefined);
    assert.ok(result.preflight_digest.startsWith('sha256:'));
  } finally { await new Promise((resolve) => f.server.close(resolve)); await rm(f.root, { recursive: true, force: true }); }
});

test('real dogfood preflight blocks missing runtime and conformance facts', async () => {
  const f = await fixture();
  try {
    const result = await preflightRealAgentDogfood({ plan: f.plan, repo_root: f.repo, evidence_store: f.evidenceStore, conformance_evidence_digest: 'sha256:' + '2'.repeat(64), provider_id: 'codex', provider_executable: '/usr/bin/true', provider_runtime_ipc: { socket_path: path.join(f.root, 'missing.sock'), contract_digest: 'sha256:' + '1'.repeat(64) }, human: { human_id: 'human-1', key_tag: 'key-1', helper_path: '/usr/bin/true' }, platform: 'darwin' });
    assert.equal(result.status, 'blocked');
    assert.deepEqual(result.checks.filter((item) => item.status === 'blocked').map((item) => item.id), ['provider-runtime-ipc', 'deterministic-conformance-evidence']);
  } finally { await new Promise((resolve) => f.server.close(resolve)); await rm(f.root, { recursive: true, force: true }); }
});

test('real dogfood preflight CLI emits a structured read-only gate result', async () => {
  const f = await fixture();
  try {
    const conformance = { schema: 'zj-loop.real_agent_dogfood_conformance_evidence.v1', status: 'passed', plan_digest: f.plan.plan_digest, core_commit: 'b'.repeat(40), test_command: ['npm', 'test'], failure_matrix_digest: REAL_AGENT_DOGFOOD_FAILURE_MATRIX_DIGEST, digest_profile: 'zj-loop.real-agent-dogfood-conformance.v1', exit_code: 0 };
    const evidence = await f.evidenceStore.put({ kind: 'conformance', content: JSON.stringify(conformance) });
    const planPath = path.join(f.root, 'plan.json');
    await writeFile(planPath, JSON.stringify(f.plan));
    const output = [];
    const exitCode = await runRealAgentDogfoodCli(['preflight', '--graph-plan', planPath, '--repo', f.repo, '--evidence-store', f.evidence, '--conformance-evidence', evidence.digest, '--provider-id', 'codex', '--executable', '/usr/bin/true', '--provider-runtime-ipc', JSON.stringify({ socket_path: f.socket, contract_digest: 'sha256:' + '1'.repeat(64) }), '--human-id', 'human-1', '--key-tag', 'key-1', '--helper-path', '/usr/bin/true'], { stdout: (value) => output.push(value), stderr: () => {} });
    const result = JSON.parse(output.join(''));
    assert.equal(result.side_effects_executed, false);
    assert.ok(['execution-ready', 'blocked'].includes(result.status));
    assert.match(result.preflight_digest, /^sha256:[0-9a-f]{64}$/);
    assert.equal(exitCode, result.status === 'blocked' ? 2 : 0);
  } finally { await new Promise((resolve) => f.server.close(resolve)); await rm(f.root, { recursive: true, force: true }); }
});
