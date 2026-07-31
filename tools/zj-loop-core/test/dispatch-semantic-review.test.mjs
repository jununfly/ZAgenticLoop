import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDispatchIntent } from '../dist/dispatch-intent.js';
import { createDispatchSemanticReview, validateDispatchSemanticReview } from '../dist/dispatch-semantic-review.js';

const intent = createDispatchIntent({ intent_id: 'intent-semantic', network_id: 'network-1', plan_id: 'plan-1', plan_revision: 1, plan_digest: 'sha256:' + 'a'.repeat(64), task_id: 'task-1', node_id: 'execution-node', assigned_node: 'agent-1', grant_digest: 'sha256:' + 'b'.repeat(64), claim_event_id: 'claim-1', dispatch_event_id: 'dispatch-1', authorized_by: 'human', issued_at: '2026-07-30T00:00:00.000Z', expires_at: '2026-07-30T00:05:00.000Z', session_ttl_ms: 300000, capabilities: ['artifact.write'], resource_scope: ['repo:branch-a'] });
const input = { intent, aggregation: { status: 'persisted', network_id: 'network-1', plan_id: 'plan-1', plan_revision: 1, task_id: 'task-1', aggregation_digest: 'sha256:' + 'c'.repeat(64) }, verification: { status: 'verified', network_id: 'network-1', plan_id: 'plan-1', plan_revision: 1, task_id: 'task-1', verifier_id: 'review-node', execution_node_id: 'execution-node', aggregation_digest: 'sha256:' + 'c'.repeat(64), verification_digest: 'sha256:' + 'd'.repeat(64) }, review_handoff: { status: 'accepted', network_id: 'network-1', plan_id: 'plan-1', plan_revision: 1, task_id: 'task-1', aggregation_digest: 'sha256:' + 'c'.repeat(64), verification_digest: 'sha256:' + 'd'.repeat(64), handoff_digest: 'sha256:' + 'e'.repeat(64) } };

test('semantic review passes only for a closed, independently verified persisted chain', () => {
  const review = createDispatchSemanticReview(input);
  assert.equal(review.status, 'passed');
  assert.deepEqual(review.reasons, []);
  assert.equal(validateDispatchSemanticReview(review).status, 'valid');
});

test('semantic review blocks scope drift and self-verification without side effects', () => {
  const review = createDispatchSemanticReview({ ...input, verification: { ...input.verification, verifier_id: 'execution-node', aggregation_digest: 'sha256:' + 'f'.repeat(64) } });
  assert.equal(review.status, 'blocked');
  assert.ok(review.reasons.includes('verification-not-independent-or-scope-mismatch'));
  assert.equal(review.side_effects_executed, false);
  assert.equal(validateDispatchSemanticReview(review).status, 'valid');
});
