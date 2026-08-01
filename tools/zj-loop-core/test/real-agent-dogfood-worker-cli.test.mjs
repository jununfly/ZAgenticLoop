import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runRealAgentDogfoodWorkerCli } from '../dist/real-agent-dogfood-worker-cli.js';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';
import { createContentAddressedEvidenceStore } from '../dist/content-addressed-evidence-store.js';
import { createRealAgentDogfoodDraft, createRealAgentDogfoodTransition, appendRealAgentDogfoodEvent, projectRealAgentDogfoodLifecycle } from '../dist/real-agent-dogfood-lifecycle.js';
import { acquireRealAgentDogfoodWorkerLease } from '../dist/real-agent-dogfood-worker.js';
import { createRealAgentDogfoodExecutionBinding } from '../dist/real-agent-dogfood-binding.js';
import { createFakeRealAgentDogfoodPostRunProof } from '../dist/real-agent-dogfood-post-run-proof.js';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile, chmod } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('worker blocks an unregistered provider without starting a process or falling back', async () => {
  const stdout = [];
  const stderr = [];
  const exitCode = await runRealAgentDogfoodWorkerCli(['worker', '--provider-id', 'unknown-provider'], {
    stdout: (message) => stdout.push(message),
    stderr: (message) => stderr.push(message),
  });
  assert.equal(exitCode, 2);
  assert.deepEqual(JSON.parse(stdout.join('')), { schema: 'zj-loop.real_agent_dogfood_worker_cli.v1', status: 'blocked', reason_code: 'provider-not-registered', next_action: 'register-supported-provider' });
  assert.equal(stderr.join(''), '');
});

test('worker recognizes codex but blocks until a persisted execution context is supplied', async () => {
  const stdout = [];
  const stderr = [];
  const exitCode = await runRealAgentDogfoodWorkerCli(['worker', '--provider-id', 'codex'], {
    stdout(message) { stdout.push(message); },
    stderr(message) { stderr.push(message); },
  });

  assert.equal(exitCode, 2);
  assert.deepEqual(JSON.parse(stdout[0]), {
    schema: 'zj-loop.real_agent_dogfood_worker_cli.v1',
    status: 'blocked',
    reason_code: 'execution-context-required',
    next_action: 'supply-running-execution-context',
  });
  assert.deepEqual(stderr, []);
});

test('worker context invokes the registered provider through the real local process adapter', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-worker-cli-'));
  const statePath = path.join(root, 'state.db');
  const evidencePath = path.join(root, 'evidence');
  const worktree = path.join(root, 'worktree');
  const executable = path.join(root, 'provider.sh');
  await mkdir(worktree);
  await writeFile(executable, '#!/bin/sh\ncat >/dev/null\nprintf worker-output\n');
  await chmod(executable, 0o700);
  const store = createSqliteStateStore({ filename: statePath });
  try {
    await store.createNetwork({ network_id: 'network-cli', owner_id: 'human-1', now: '2026-08-01T12:00:00.000Z' });
    const draft = createRealAgentDogfoodDraft({ network_id: 'network-cli', dogfood_id: 'dogfood-cli', execution_id: 'execution-cli', attempt: 1, provider_id: 'codex', adapter_version: 'codex-agent-provider.v1', created_at: '2026-08-01T12:00:00.000Z' });
    const ready = createRealAgentDogfoodTransition({ lifecycle: draft.lifecycle, to: 'preflight-ready', event_id: 'ready-cli', occurred_at: '2026-08-01T12:00:01.000Z', fact_digest: 'sha256:' + 'a'.repeat(64), next_action: 'human-approval' });
    const awaiting = createRealAgentDogfoodTransition({ lifecycle: ready.lifecycle, to: 'awaiting-human-approval', event_id: 'awaiting-cli', occurred_at: '2026-08-01T12:00:02.000Z', fact_digest: 'sha256:' + 'a'.repeat(64), next_action: 'human-approval' });
    let revision = 1;
    for (const event of [draft.event, ready.event, awaiting.event]) await appendRealAgentDogfoodEvent({ stateStore: store, expected_revision: revision++, event });
    const lease = await acquireRealAgentDogfoodWorkerLease({ stateStore: store, network_id: 'network-cli', execution_id: 'execution-cli', worker_id: 'worker-cli', now: new Date().toISOString(), ttl_ms: 600_000 });
    assert.equal(lease.status, 'acquired');
    const running = createRealAgentDogfoodTransition({ lifecycle: awaiting.lifecycle, to: 'running', event_id: 'running-cli', occurred_at: '2026-08-01T12:00:04.000Z', approval_digest: 'sha256:' + 'b'.repeat(64), next_action: 'provider-execution' });
    await appendRealAgentDogfoodEvent({ stateStore: store, expected_revision: lease.revision, event: running.event });
    const binding = await createRealAgentDogfoodExecutionBinding({ executable, args: ['exec', '--json', '--ephemeral', '--sandbox', 'read-only', '--ask-for-approval', 'never', '--cd', worktree], cwd: worktree, worktree_path: worktree, lease_id: lease.lease_id });
    const textDigest = (value) => `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
    const postRunProof = createFakeRealAgentDogfoodPostRunProof({ execution_id: 'execution-cli', attempt: 1, worktree_path: worktree, executable_digest: binding.executable_digest, stdout_digest: textDigest('worker-output'), stderr_digest: textDigest('') });
    const contextPath = path.join(root, 'worker-context.json');
    await writeFile(contextPath, JSON.stringify({ schema: 'zj-loop.real_agent_dogfood_worker_context.v1', provider_id: 'codex', state_store: statePath, evidence_store: evidencePath, network_id: 'network-cli', dogfood_id: 'dogfood-cli', execution_id: 'execution-cli', worker_id: 'worker-cli', lease_id: lease.lease_id, binding, worktree_path: worktree, executable, goal: 'run the atom', expected_revision: lease.revision + 1, post_run_proof: postRunProof }));
    const stdout = [];
    const stderr = [];
    const exitCode = await runRealAgentDogfoodWorkerCli(['worker', '--provider-id', 'codex', '--context', contextPath], { stdout: (message) => stdout.push(message), stderr: (message) => stderr.push(message) });
    assert.deepEqual(stderr, []);
    assert.equal(exitCode, 0);
    const result = JSON.parse(stdout[0]);
    assert.equal(result.status, 'verification-pending');
    assert.equal(result.verifier_started, true);
    assert.match(result.stdout_digest, /^sha256:/);
    let finalStatus;
    for (let attempt = 0; attempt < 30; attempt++) {
      const snapshot = await store.readEvents({ network_id: 'network-cli', aggregate_type: 'real-agent-dogfood', aggregate_id: 'dogfood-cli' });
      finalStatus = projectRealAgentDogfoodLifecycle(snapshot.events).status;
      if (finalStatus === 'review-pending' || finalStatus === 'outcome-uncertain' || finalStatus === 'blocked') break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.equal(finalStatus, 'review-pending');
    const evidence = await createContentAddressedEvidenceStore({ root: evidencePath });
    assert.equal((await evidence.read({ digest: result.stdout_digest, actor: 'test' })).toString(), 'worker-output');
  } finally {
    await store.close();
    await rm(root, { recursive: true, force: true });
  }
});
