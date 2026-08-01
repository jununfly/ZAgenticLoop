import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';
import { createContentAddressedEvidenceStore } from '../dist/content-addressed-evidence-store.js';
import { createRealAgentDogfoodDraft, createRealAgentDogfoodTransition, appendRealAgentDogfoodEvent, projectRealAgentDogfoodLifecycle } from '../dist/real-agent-dogfood-lifecycle.js';
import { executeRealAgentDogfoodWorker } from '../dist/real-agent-dogfood-worker-runner.js';

const d = (letter) => `sha256:${letter.repeat(64)}`;

async function runningFixture(root) {
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  await stateStore.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2026-08-01T12:00:00.000Z' });
  const draft = createRealAgentDogfoodDraft({ network_id: 'network-1', dogfood_id: 'dogfood-1', execution_id: 'execution-1', attempt: 1, provider_id: 'provider-1', adapter_version: 'adapter-1', created_at: '2026-08-01T12:00:00.000Z' });
  const ready = createRealAgentDogfoodTransition({ lifecycle: draft.lifecycle, to: 'preflight-ready', event_id: 'ready', occurred_at: '2026-08-01T12:00:01.000Z', fact_digest: d('a'), next_action: 'human-approval' });
  const awaiting = createRealAgentDogfoodTransition({ lifecycle: ready.lifecycle, to: 'awaiting-human-approval', event_id: 'awaiting', occurred_at: '2026-08-01T12:00:02.000Z', fact_digest: d('a'), next_action: 'human-approval' });
  const running = createRealAgentDogfoodTransition({ lifecycle: awaiting.lifecycle, to: 'running', event_id: 'running', occurred_at: '2026-08-01T12:00:03.000Z', approval_digest: d('b'), next_action: 'provider-execution' });
  let revision = 1;
  for (const event of [draft.event, ready.event, awaiting.event, running.event]) await appendRealAgentDogfoodEvent({ stateStore, expected_revision: revision++, event });
  return { stateStore, lifecycle: running.lifecycle };
}

test('worker persists bounded output evidence and advances only with post-run proof', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-worker-runner-'));
  const evidenceStore = await createContentAddressedEvidenceStore({ root: path.join(root, 'evidence') });
  const { stateStore, lifecycle } = await runningFixture(root);
  let request;
  try {
    const result = await executeRealAgentDogfoodWorker({ stateStore, evidenceStore, lifecycle, worker_id: 'worker-1', lease_id: 'lease-1', worktree_path: '/tmp/worktree', executable: '/usr/bin/codex', goal: 'do the atom', provider: { async run(input) { request = input; return { status: 'completed', success: true, pid: 123, exit_code: 0, signal: null, stdout: 'result', stderr: '' }; } }, post_run_observation: { status: 'signed', all_descendants_terminated: true, after_worktree_clean: true, after_network_policy_proved: true, after_credentials_clean: true, side_effects_detected: false }, expected_revision: 5, now: '2026-08-01T12:00:04.000Z' });
    assert.equal(result.status, 'verification-pending');
    assert.equal(request.cwd, '/tmp/worktree');
    const events = await stateStore.readEvents({ network_id: 'network-1', aggregate_type: 'real-agent-dogfood', aggregate_id: 'dogfood-1' });
    assert.equal(projectRealAgentDogfoodLifecycle(events.events).status, 'verification-pending');
    assert.match(result.stdout_digest, /^sha256:/);
  } finally { await stateStore.close(); await rm(root, { recursive: true, force: true }); }
});

test('worker does not claim verification when post-run proof is missing', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-worker-runner-uncertain-'));
  const evidenceStore = await createContentAddressedEvidenceStore({ root: path.join(root, 'evidence') });
  const { stateStore, lifecycle } = await runningFixture(root);
  try {
    const result = await executeRealAgentDogfoodWorker({ stateStore, evidenceStore, lifecycle, worker_id: 'worker-1', lease_id: 'lease-1', worktree_path: '/tmp/worktree', executable: '/usr/bin/codex', goal: 'do the atom', provider: { async run() { return { status: 'completed', success: true, pid: 123, exit_code: 0, signal: null, stdout: 'result', stderr: '' }; } }, expected_revision: 5, now: '2026-08-01T12:00:04.000Z' });
    assert.equal(result.status, 'outcome-uncertain');
  } finally { await stateStore.close(); await rm(root, { recursive: true, force: true }); }
});
