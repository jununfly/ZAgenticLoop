import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDispatchIntent, dispatchIntentDigest, validateDispatchIntent } from '../dist/dispatch-intent.js';
import { getCapabilityRiskDescriptor, orchestrationPlanProfileSha256 } from '../dist/protocol-registry.js';

const input = { intent_id: 'intent-1', network_id: 'network-1', plan_id: 'plan-1', plan_revision: 1, plan_digest: 'sha256:' + 'a'.repeat(64), task_id: 'task-1', node_id: 'codex-node', assigned_node: 'codex', grant_digest: 'sha256:' + 'b'.repeat(64), claim_event_id: 'claim-1', dispatch_event_id: 'dispatch-1', authorized_by: 'human+codex', issued_at: '2026-07-30T00:00:00.000Z', expires_at: '2026-07-30T00:05:00.000Z', session_ttl_ms: 300000, capabilities: ['artifact.write'], resource_scope: ['repo:branch-a'] };

test('DispatchIntent is deterministic, closed, and provider-neutral', () => {
  const intent = createDispatchIntent(input);
  assert.equal(intent.intent_digest, dispatchIntentDigest(intent));
  assert.deepEqual(validateDispatchIntent(intent), { status: 'valid', errors: [], intent_digest: intent.intent_digest });
  assert.throws(() => createDispatchIntent({ ...input, extra: true }), { message: 'dispatch-intent-schema-invalid' });
});

test('DispatchIntent rejects expiry beyond TTL and digest drift', () => {
  const intent = createDispatchIntent(input);
  intent.expires_at = '2026-07-30T02:00:00.000Z';
  intent.intent_digest = dispatchIntentDigest(intent);
  const result = validateDispatchIntent(intent);
  assert.ok(result.errors.some((error) => error.code === 'intent-time-invalid'));
});

test('Capability risk registry is immutable and fail-closed for unknown capabilities', () => {
  assert.equal(getCapabilityRiskDescriptor('artifact.read').risk_level, 'low');
  assert.equal(getCapabilityRiskDescriptor('artifact.write').risk_level, 'review-required');
  assert.equal(getCapabilityRiskDescriptor('credential.issue').risk_level, 'human-approval-required');
  assert.equal(getCapabilityRiskDescriptor('unknown.capability'), undefined);
  assert.match(orchestrationPlanProfileSha256(), /^sha256:[0-9a-f]{64}$/);
});
