import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createProviderOutcome } from '../dist/provider-outcome.js';
import { createProviderOutcomeVerification } from '../dist/provider-outcome-verification.js';
import { createReviewHandoff, validateReviewHandoff } from '../dist/review-handoff.js';

const outcome = createProviderOutcome({ network_id: 'network-1', event_id: 'event-1', plan_id: 'plan-1', plan_revision: 1, execution_id: 'execution-1', task_id: 'task-1', provider_id: 'provider-1', provider_kind: 'simulated', provider_request_id: 'request-1', request_digest: `sha256:${'1'.repeat(64)}`, response_digest: `sha256:${'2'.repeat(64)}`, resource_scope: ['resource:1'], observed_at: '2026-07-31T06:00:00.000Z', outcome: 'confirmed-success', side_effects_executed: true, evidence: { kind: 'receipt', receipt_id: 'receipt-1', receipt_digest: `sha256:${'3'.repeat(64)}` } });
const verification = createProviderOutcomeVerification({ outcome, verifier_id: 'verifier-1', verification_conditions: ['present'], satisfied_conditions: ['present'], failed_conditions: [], evidence_digest: `sha256:${'4'.repeat(64)}`, checked_at: '2026-07-31T06:01:00.000Z' });
const resources = [{ resource_id: 'resource:1', last_known_status: 'updated', responsible_party: 'human-1' }];

test('Review Handoff accepts only a closed, risk-free passed verification', () => {
  const handoff = createReviewHandoff({ verification, dependencies_closed: true, remaining_risks: [], external_resource_states: resources, responsible_party: 'human-1', accepted_at: '2026-07-31T06:02:00.000Z' });
  assert.equal(handoff.status, 'accepted');
  assert.equal(validateReviewHandoff(handoff).status, 'valid');
  assert.equal(handoff.event_completed, false);
  assert.equal(handoff.task_completed, false);
  assert.equal(handoff.side_effects_executed, false);
});

test('Review Handoff blocks open dependencies or unresolved risks', () => {
  const open = createReviewHandoff({ verification, dependencies_closed: false, remaining_risks: [], external_resource_states: resources, responsible_party: 'human-1', accepted_at: '2026-07-31T06:02:00.000Z' });
  assert.equal(open.status, 'blocked');
  assert.equal(open.reason, 'dependencies-not-closed');
  const risky = createReviewHandoff({ verification, dependencies_closed: true, remaining_risks: ['resource ownership unclear'], external_resource_states: resources, responsible_party: 'human-1', accepted_at: '2026-07-31T06:02:00.000Z' });
  assert.equal(risky.status, 'blocked');
  assert.equal(risky.reason, 'unresolved-risks');
});
