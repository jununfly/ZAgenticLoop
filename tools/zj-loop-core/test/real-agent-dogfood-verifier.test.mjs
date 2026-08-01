import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createContentAddressedEvidenceStore } from '../dist/content-addressed-evidence-store.js';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';
import { createRealAgentDogfoodDraft, createRealAgentDogfoodTransition, appendRealAgentDogfoodEvent, projectRealAgentDogfoodLifecycle } from '../dist/real-agent-dogfood-lifecycle.js';
import { verifyRealAgentDogfoodExecution } from '../dist/real-agent-dogfood-verifier.js';
import { createFakeRealAgentDogfoodPostRunProof } from '../dist/real-agent-dogfood-post-run-proof.js';

const digest = (letter) => `sha256:${letter.repeat(64)}`;

async function verificationFixture(root) {
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  const evidenceStore = await createContentAddressedEvidenceStore({ root: path.join(root, 'evidence') });
  await stateStore.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2026-08-01T12:00:00.000Z' });
  const draft = createRealAgentDogfoodDraft({ network_id: 'network-1', dogfood_id: 'dogfood-1', execution_id: 'execution-1', attempt: 1, provider_id: 'codex', adapter_version: 'codex-agent-provider.v1', created_at: '2026-08-01T12:00:00.000Z' });
  const ready = createRealAgentDogfoodTransition({ lifecycle: draft.lifecycle, to: 'preflight-ready', event_id: 'ready', occurred_at: '2026-08-01T12:00:01.000Z', fact_digest: digest('a'), next_action: 'human-approval' });
  const awaiting = createRealAgentDogfoodTransition({ lifecycle: ready.lifecycle, to: 'awaiting-human-approval', event_id: 'awaiting', occurred_at: '2026-08-01T12:00:02.000Z', fact_digest: digest('a'), next_action: 'human-approval' });
  const running = createRealAgentDogfoodTransition({ lifecycle: awaiting.lifecycle, to: 'running', event_id: 'running', occurred_at: '2026-08-01T12:00:03.000Z', approval_digest: digest('b'), next_action: 'provider-execution' });
  const pending = createRealAgentDogfoodTransition({ lifecycle: running.lifecycle, to: 'verification-pending', event_id: 'pending', occurred_at: '2026-08-01T12:00:04.000Z', fact_digest: digest('c'), next_action: 'run-independent-verifier' });
  let revision = 1;
  for (const event of [draft.event, ready.event, awaiting.event, running.event, pending.event]) await appendRealAgentDogfoodEvent({ stateStore, expected_revision: revision++, event });
  return { stateStore, evidenceStore, lifecycle: pending.lifecycle };
}

test('independent verifier fails closed to outcome-uncertain when evidence is incomplete', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-dogfood-verifier-'));
  const { stateStore, evidenceStore, lifecycle } = await verificationFixture(root);
  try {
    const fact = await evidenceStore.put({ content: JSON.stringify({ schema: 'zj-loop.real_agent_dogfood_provider_result.v1', execution_id: 'execution-1', attempt: 1, worker_id: 'worker-1', result: { status: 'completed', success: true }, post_run_observation: { status: 'signed', all_descendants_terminated: true, after_worktree_clean: true, after_network_policy_proved: true, after_credentials_clean: true, side_effects_detected: false } }), kind: 'provider-result-fact' });
    const result = await verifyRealAgentDogfoodExecution({ stateStore, evidenceStore, lifecycle, verifier_id: 'verifier-1', provider_fact_digest: fact.digest, stdout_digest: digest('d'), stderr_digest: digest('e'), expected_revision: await stateStore.getRevision('network-1'), now: '2026-08-01T12:00:05.000Z' });
    assert.equal(result.status, 'outcome-uncertain');
    const events = await stateStore.readEvents({ network_id: 'network-1', aggregate_type: 'real-agent-dogfood', aggregate_id: 'dogfood-1' });
    assert.equal(projectRealAgentDogfoodLifecycle(events.events).status, 'outcome-uncertain');
  } finally { await stateStore.close(); await rm(root, { recursive: true, force: true }); }
});

test('independent verifier advances complete evidence only to review-pending', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-dogfood-verifier-pass-'));
  const { stateStore, evidenceStore, lifecycle } = await verificationFixture(root);
  try {
    const stdout = await evidenceStore.put({ content: 'stdout', kind: 'provider-stdout' });
    const stderr = await evidenceStore.put({ content: 'stderr', kind: 'provider-stderr' });
    const postRunProof = createFakeRealAgentDogfoodPostRunProof({ execution_id: 'execution-1', attempt: 1, worktree_path: '/tmp/worktree', executable_digest: digest('f'), stdout_digest: stdout.digest, stderr_digest: stderr.digest });
    const fact = await evidenceStore.put({ content: JSON.stringify({ schema: 'zj-loop.real_agent_dogfood_provider_result.v1', execution_id: 'execution-1', attempt: 1, worker_id: 'worker-1', worktree_path: '/tmp/worktree', executable_digest: digest('f'), stdout, stderr, result: { status: 'completed', success: true }, post_run_proof: postRunProof }), kind: 'provider-result-fact' });
    const result = await verifyRealAgentDogfoodExecution({ stateStore, evidenceStore, lifecycle, verifier_id: 'verifier-1', provider_fact_digest: fact.digest, stdout_digest: stdout.digest, stderr_digest: stderr.digest, expected_revision: await stateStore.getRevision('network-1'), now: '2026-08-01T12:00:05.000Z' });
    assert.equal(result.status, 'review-pending');
    assert.equal(result.verification_status, 'passed');
    const events = await stateStore.readEvents({ network_id: 'network-1', aggregate_type: 'real-agent-dogfood', aggregate_id: 'dogfood-1' });
    assert.equal(projectRealAgentDogfoodLifecycle(events.events).status, 'review-pending');
  } finally { await stateStore.close(); await rm(root, { recursive: true, force: true }); }
});
