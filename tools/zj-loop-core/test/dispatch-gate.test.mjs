import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDispatchIntent } from '../dist/dispatch-intent.js';
import { evaluateDispatchGate } from '../dist/dispatch-gate.js';
import { createDispatchSemanticReview } from '../dist/dispatch-semantic-review.js';

const base = { intent_id: 'intent-1', network_id: 'network-1', plan_id: 'plan-1', plan_revision: 1, plan_digest: 'sha256:' + 'a'.repeat(64), task_id: 'task-1', node_id: 'codex-node', assigned_node: 'codex', grant_digest: 'sha256:' + 'b'.repeat(64), claim_event_id: 'claim-1', dispatch_event_id: 'dispatch-1', authorized_by: 'human+codex', issued_at: '2026-07-30T00:00:00.000Z', expires_at: '2026-07-30T00:05:00.000Z', session_ttl_ms: 300000, capabilities: ['artifact.read'], resource_scope: ['repo:branch-a'] };
const common = { now: '2026-07-30T00:01:00.000Z', claim: { status: 'claimed', network_id: base.network_id, plan_digest: base.plan_digest, plan_revision: 1, grant_digest: base.grant_digest, task_id: 'task-1', node_id: 'codex-node' }, revalidation: { status: 'passed', network_id: base.network_id, plan_id: base.plan_id, task_id: base.task_id, node_id: base.node_id, plan_digest: base.plan_digest, plan_revision: 1, grant_digest: base.grant_digest } };

test('dispatch gate allows low-risk intent after claim and revalidation', () => {
  const intent = createDispatchIntent(base);
  const result = evaluateDispatchGate({ intent, ...common });
  assert.equal(result.status, 'dispatch-ready');
  assert.equal(result.side_effects_executed, false);
});

test('dispatch gate requires review for artifact.write and approval for credential.issue', () => {
  const reviewIntent = createDispatchIntent({ ...base, capabilities: ['artifact.write'] });
  assert.ok(evaluateDispatchGate({ intent: reviewIntent, ...common }).errors.some((error) => error.code === 'verification-required'));
  const approvalIntent = createDispatchIntent({ ...base, capabilities: ['credential.issue'] });
  assert.equal(evaluateDispatchGate({ intent: approvalIntent, ...common }).errors[0].code, 'human-approval-required');
  const verification = { status: 'verified', network_id: base.network_id, plan_id: base.plan_id, task_id: base.task_id, verifier_id: 'independent-verifier', execution_node_id: base.node_id, plan_digest: base.plan_digest, plan_revision: 1, aggregation_digest: 'sha256:' + 'c'.repeat(64), verification_digest: 'sha256:' + 'd'.repeat(64), review_handoff_status: 'accepted', review_handoff_digest: 'sha256:' + 'e'.repeat(64) };
  const semantic_review = createDispatchSemanticReview({ intent: reviewIntent, aggregation: { status: 'persisted', network_id: base.network_id, plan_id: base.plan_id, plan_revision: 1, task_id: base.task_id, aggregation_digest: verification.aggregation_digest }, verification, review_handoff: { status: 'accepted', network_id: base.network_id, plan_id: base.plan_id, plan_revision: 1, task_id: base.task_id, aggregation_digest: verification.aggregation_digest, verification_digest: verification.verification_digest, handoff_digest: verification.review_handoff_digest } });
  const accepted = evaluateDispatchGate({ intent: reviewIntent, ...common, verification, semantic_review });
  assert.equal(accepted.status, 'dispatch-ready');
});

test('dispatch gate fails closed for stale, cross-scope, or non-independent review inputs', () => {
  const intent = createDispatchIntent({ ...base, capabilities: ['artifact.write'] });
  assert.ok(evaluateDispatchGate({ intent, ...common, now: '2026-07-30T00:06:00.000Z' }).errors.some((error) => error.code === 'dispatch-intent-expired'));
  assert.ok(evaluateDispatchGate({ intent, ...common, claim: { ...common.claim, network_id: 'other-network' } }).errors.some((error) => error.code === 'claim-binding-invalid'));
  const sameNode = evaluateDispatchGate({ intent, ...common, verification: { status: 'verified', network_id: base.network_id, plan_id: base.plan_id, task_id: base.task_id, verifier_id: base.node_id, plan_digest: base.plan_digest, plan_revision: 1, aggregation_digest: 'sha256:' + 'c'.repeat(64), verification_digest: 'sha256:' + 'd'.repeat(64), review_handoff_status: 'accepted', review_handoff_digest: 'sha256:' + 'e'.repeat(64) } });
  assert.ok(sameNode.errors.some((error) => error.code === 'verification-not-independent'));
  const missingHandoff = evaluateDispatchGate({ intent, ...common, verification: { status: 'verified', network_id: base.network_id, plan_id: base.plan_id, task_id: base.task_id, verifier_id: 'independent-verifier', plan_digest: base.plan_digest, plan_revision: 1, aggregation_digest: 'sha256:' + 'c'.repeat(64), verification_digest: 'sha256:' + 'd'.repeat(64), review_handoff_status: 'accepted' } });
  assert.ok(missingHandoff.errors.some((error) => error.code === 'verification-required'));
});
