import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInMemoryHumanSigner } from '../dist/human-signer.js';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';
import { createNativeOpnGraphTargetWorktreeBinding, createNativeOpnGraphTargetWorktreeCleanupEvidenceFromDogfoodCloseout, createNativeOpnGraphTargetWorktreeCleanupReconciliationPlan, createNativeOpnGraphTargetWorktreeManualCleanupEvidence, evaluateNativeOpnGraphTargetWorktreeManualCleanupCloseout, nativeOpnGraphTargetWorktreeBindingDigest, recordNativeOpnGraphTargetWorktreeProjection, validateNativeOpnGraphTargetWorktreeManualCleanupEvidence } from '../dist/native-opn-graph-worktree.js';

const prepared = { status: 'prepared', execution_id: 'execution-1', branch: 'zj-loop/real-agent-dogfood/execution-1', worktree_path: '/tmp/graph-target', base_commit: 'a'.repeat(40) };

test('Graph target worktree binding derives a stable logical identity independently of its absolute path', () => {
  const binding = createNativeOpnGraphTargetWorktreeBinding({ network_id: 'network-1', graph_id: 'graph-1', prepared });
  assert.equal(binding.target_worktree_ref, 'worktree:graph-target:graph-1:execution-1');
  assert.equal(binding.worktree_path, '/tmp/graph-target');
  assert.equal(binding.cleanup_status, 'pending');
  assert.equal(binding.binding_digest, nativeOpnGraphTargetWorktreeBindingDigest(binding));
});

test('Graph target cleanup projects existing Dogfood closeout into bound Evidence', () => {
  const binding = createNativeOpnGraphTargetWorktreeBinding({ network_id: 'network-1', graph_id: 'graph-1', prepared });
  const evidence = createNativeOpnGraphTargetWorktreeCleanupEvidenceFromDogfoodCloseout({ binding, closeout_fact: { event_id: 'dogfood-1:attempt-1:closed', status: 'closed', worktree_path: '/tmp/graph-target', reason: 'cleanup-verified', occurred_at: '2026-08-04T16:00:00.000Z' } });
  assert.deepEqual(evidence, {
    schema: 'zj-loop.native_opn_graph_target_worktree_cleanup.v1',
    network_id: 'network-1', graph_id: 'graph-1', execution_id: 'execution-1', target_worktree_ref: 'worktree:graph-target:graph-1:execution-1', worktree_path: '/tmp/graph-target', status: 'closed', reason: 'cleanup-verified', observed_at: '2026-08-04T16:00:00.000Z', source: 'real-agent-dogfood-closeout', source_event_id: 'dogfood-1:attempt-1:closed', evidence_digest: evidence.evidence_digest, side_effects_executed: false,
  });
});

test('Graph target cleanup rejects a path that is not the bound worktree', () => {
  const binding = createNativeOpnGraphTargetWorktreeBinding({ network_id: 'network-1', graph_id: 'graph-1', prepared });
  assert.throws(() => createNativeOpnGraphTargetWorktreeCleanupEvidenceFromDogfoodCloseout({ binding, closeout_fact: { event_id: 'dogfood-1:attempt-1:uncertain', status: 'outcome-uncertain', worktree_path: '/tmp/other-target', reason: 'cleanup-failed', occurred_at: '2026-08-04T16:00:00.000Z' } }), /native-opn-graph-worktree-cleanup-evidence-invalid/);
});

test('Graph target cleanup reuses bounded reconciliation with only read-only worktree queries', () => {
  const binding = createNativeOpnGraphTargetWorktreeBinding({ network_id: 'network-1', graph_id: 'graph-1', prepared });
  const plan = createNativeOpnGraphTargetWorktreeCleanupReconciliationPlan({ binding, attempt: 2, outcome_digest: `sha256:${'e'.repeat(64)}`, max_queries: 2, deadline: '2026-08-04T16:05:00.000Z', observed_fact_digests: [`sha256:${'f'.repeat(64)}`] });
  assert.equal(plan.schema, 'zj-loop.bounded_reconciliation.v1');
  assert.equal(plan.execution_id, 'execution-1');
  assert.deepEqual(plan.query_scope, ['worktree.registration.read:worktree:graph-target:graph-1:execution-1', 'worktree.status.read:worktree:graph-target:graph-1:execution-1']);
  assert.equal(plan.forbidden_actions.includes('provider.invoke'), true);
  assert.equal(plan.forbidden_actions.includes('resource.write'), true);
});

test('Graph target cleanup projects exhausted reconciliation as unresolved without rewriting the Dogfood fact', () => {
  const binding = createNativeOpnGraphTargetWorktreeBinding({ network_id: 'network-1', graph_id: 'graph-1', prepared });
  const evidence = createNativeOpnGraphTargetWorktreeCleanupEvidenceFromDogfoodCloseout({ binding, reconciliation_exhausted: true, closeout_fact: { event_id: 'dogfood-1:attempt-1:uncertain', status: 'outcome-uncertain', worktree_path: '/tmp/graph-target', reason: 'reconciliation-exhausted', occurred_at: '2026-08-04T16:06:00.000Z' } });
  assert.equal(evidence.status, 'cleanup-unresolved');
  assert.equal(evidence.source_event_id, 'dogfood-1:attempt-1:uncertain');
});

test('Human manual cleanup is separately signed and remains bound to the unresolved target worktree', async () => {
  const binding = createNativeOpnGraphTargetWorktreeBinding({ network_id: 'network-1', graph_id: 'graph-1', prepared });
  const signer = createInMemoryHumanSigner({ human_id: 'human-1' });
  const evidence = await createNativeOpnGraphTargetWorktreeManualCleanupEvidence({ signer, binding, source_event_id: 'dogfood-1:attempt-1:uncertain', worktree_path: '/tmp/graph-target', reason: 'Human removed residual worktree after bounded reconciliation exhausted', cleaned_at: '2026-08-04T16:07:00.000Z' });
  const identity = await signer.getPublicIdentity();
  assert.equal(validateNativeOpnGraphTargetWorktreeManualCleanupEvidence({ evidence, binding, identity }).status, 'valid');
  assert.equal(evidence.observed_absent, true);
  assert.equal(evidence.target_worktree_ref, binding.target_worktree_ref);
  assert.deepEqual(evaluateNativeOpnGraphTargetWorktreeManualCleanupCloseout({ evidence, binding, identity, observed: { worktree_path_exists: false, worktree_registered: false } }), { status: 'closed', side_effects_executed: false });
  assert.deepEqual(evaluateNativeOpnGraphTargetWorktreeManualCleanupCloseout({ evidence, binding, identity, observed: { worktree_path_exists: true, worktree_registered: false } }), { status: 'blocked', side_effects_executed: false, reason: 'worktree-still-present' });
  assert.deepEqual(evaluateNativeOpnGraphTargetWorktreeManualCleanupCloseout({ evidence, binding, identity, observed: { worktree_path_exists: false } }), { status: 'outcome-uncertain', side_effects_executed: false, reason: 'manual-cleanup-observation-uncertain' });
});

test('Graph cleanup projection is append-only and idempotent in StateStore', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-graph-worktree-projection-'));
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  try {
    await stateStore.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2026-08-04T16:08:00.000Z' });
    const binding = createNativeOpnGraphTargetWorktreeBinding({ network_id: 'network-1', graph_id: 'graph-1', prepared });
    const evidence = createNativeOpnGraphTargetWorktreeCleanupEvidenceFromDogfoodCloseout({ binding, closeout_fact: { event_id: 'dogfood-1:attempt-1:closed', status: 'closed', worktree_path: '/tmp/graph-target', reason: 'cleanup-verified', occurred_at: '2026-08-04T16:08:00.000Z' } });
    const first = await recordNativeOpnGraphTargetWorktreeProjection({ stateStore, expected_revision: 1, evidence, now: '2026-08-04T16:08:01.000Z' });
    const duplicate = await recordNativeOpnGraphTargetWorktreeProjection({ stateStore, expected_revision: first.revision, evidence, now: '2026-08-04T16:08:02.000Z' });
    assert.equal(first.status, 'recorded');
    assert.equal(duplicate.status, 'duplicate');
    assert.equal((await stateStore.readEvents({ network_id: 'network-1', aggregate_type: 'native-opn-graph-worktree-cleanup-projection', aggregate_id: 'graph-1:execution-1' })).events.length, 1);
  } finally { await stateStore.close(); await rm(root, { recursive: true, force: true }); }
});
