import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDispatchIntent } from '../dist/dispatch-intent.js';
import { evaluateDispatchGate } from '../dist/dispatch-gate.js';

const base = { intent_id: 'intent-1', network_id: 'network-1', plan_id: 'plan-1', plan_revision: 1, plan_digest: 'sha256:' + 'a'.repeat(64), task_id: 'task-1', node_id: 'codex-node', assigned_node: 'codex', grant_digest: 'sha256:' + 'b'.repeat(64), claim_event_id: 'claim-1', dispatch_event_id: 'dispatch-1', authorized_by: 'human+codex', issued_at: '2026-07-30T00:00:00.000Z', expires_at: '2026-07-30T00:05:00.000Z', session_ttl_ms: 300000, capabilities: ['artifact.read'], resource_scope: ['repo:branch-a'] };
const common = { claim: { status: 'claimed', plan_digest: base.plan_digest, plan_revision: 1, task_id: 'task-1', node_id: 'codex-node' }, revalidation: { status: 'passed', plan_digest: base.plan_digest, plan_revision: 1 } };

test('dispatch gate allows low-risk intent after claim and revalidation', () => {
  const intent = createDispatchIntent(base);
  const result = evaluateDispatchGate({ intent, ...common });
  assert.equal(result.status, 'dispatch-ready');
  assert.equal(result.side_effects_executed, false);
});

test('dispatch gate requires review for artifact.write and approval for credential.issue', () => {
  const reviewIntent = createDispatchIntent({ ...base, capabilities: ['artifact.write'] });
  assert.equal(evaluateDispatchGate({ intent: reviewIntent, ...common }).errors[0].code, 'verification-required');
  const approvalIntent = createDispatchIntent({ ...base, capabilities: ['credential.issue'] });
  assert.equal(evaluateDispatchGate({ intent: approvalIntent, ...common }).errors[0].code, 'human-approval-required');
  const accepted = evaluateDispatchGate({ intent: reviewIntent, ...common, verification: { status: 'verified', plan_digest: base.plan_digest, plan_revision: 1, review_handoff_status: 'accepted' } });
  assert.equal(accepted.status, 'dispatch-ready');
});
