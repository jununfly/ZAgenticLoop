import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createProviderOutcome } from '../dist/provider-outcome.js';
import { createProviderOutcomeVerification, validateProviderOutcomeVerification } from '../dist/provider-outcome-verification.js';

const outcome = createProviderOutcome({ network_id: 'network-1', event_id: 'event-1', plan_id: 'plan-1', plan_revision: 1, execution_id: 'execution-1', task_id: 'task-1', provider_id: 'provider-1', provider_kind: 'simulated', provider_request_id: 'request-1', request_digest: `sha256:${'1'.repeat(64)}`, response_digest: `sha256:${'2'.repeat(64)}`, resource_scope: ['resource:1'], observed_at: '2026-07-31T04:00:00.000Z', outcome: 'confirmed-success', side_effects_executed: true, evidence: { kind: 'receipt', receipt_id: 'receipt-1', receipt_digest: `sha256:${'3'.repeat(64)}` } });

test('independent verifier produces passed or failed verification bound to ProviderOutcome', () => {
  const passed = createProviderOutcomeVerification({ outcome, verifier_id: 'verifier-1', verification_conditions: ['artifact-present', 'schema-valid'], satisfied_conditions: ['artifact-present', 'schema-valid'], failed_conditions: [], evidence_digest: `sha256:${'4'.repeat(64)}`, checked_at: '2026-07-31T04:01:00.000Z' });
  assert.equal(passed.status, 'passed');
  assert.equal(validateProviderOutcomeVerification(passed).status, 'valid');
  assert.equal(passed.review_handoff_required, true);
  assert.equal(passed.provider_retry_allowed, false);
  assert.equal(passed.side_effects_executed, false);
  const failed = createProviderOutcomeVerification({ outcome, verifier_id: 'verifier-1', verification_conditions: ['artifact-present', 'schema-valid'], satisfied_conditions: ['artifact-present'], failed_conditions: ['schema-valid'], evidence_digest: `sha256:${'5'.repeat(64)}`, checked_at: '2026-07-31T04:01:00.000Z' });
  assert.equal(failed.status, 'failed');
  assert.equal(validateProviderOutcomeVerification(failed).status, 'valid');
});

test('verification rejects Provider self-verification and non-success outcomes', () => {
  assert.throws(() => createProviderOutcomeVerification({ outcome, verifier_id: 'provider-1', verification_conditions: ['present'], satisfied_conditions: ['present'], failed_conditions: [], evidence_digest: `sha256:${'4'.repeat(64)}`, checked_at: '2026-07-31T04:01:00.000Z' }), { message: 'provider-verification-independent-verifier-required' });
  const uncertain = createProviderOutcome({ ...outcome, outcome: 'outcome-uncertain', side_effects_executed: false, response_digest: `sha256:${'6'.repeat(64)}`, evidence: { kind: 'uncertainty', reason: 'timeout', last_known_fact_digest: `sha256:${'7'.repeat(64)}`, frozen_resource_scope: ['resource:1'], allowed_queries: ['provider.read'], forbidden_actions: ['provider.write'], reconciliation_budget: { max_queries: 2, deadline: '2026-07-31T04:05:00.000Z', query_scope: ['resource:1'], max_cost: 1 } } });
  assert.throws(() => createProviderOutcomeVerification({ outcome: uncertain, verifier_id: 'verifier-1', verification_conditions: ['present'], satisfied_conditions: ['present'], failed_conditions: [], evidence_digest: `sha256:${'4'.repeat(64)}`, checked_at: '2026-07-31T04:01:00.000Z' }), { message: 'provider-verification-outcome-not-success' });
});
