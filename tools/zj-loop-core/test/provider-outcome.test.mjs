import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createProviderOutcome, validateProviderOutcome, validateProviderOutcomeBinding } from '../dist/provider-outcome.js';

const common = { network_id: 'network-1', event_id: 'event-1', plan_id: 'plan-1', plan_revision: 2, execution_id: 'execution-1', task_id: 'task-1', provider_id: 'simulated-provider-1', provider_kind: 'simulated', provider_request_id: 'request-1', request_digest: `sha256:${'1'.repeat(64)}`, response_digest: `sha256:${'2'.repeat(64)}`, resource_scope: ['resource:1'], observed_at: '2026-07-31T01:00:00.000Z' };

function outcome(kind, evidence, side_effects_executed = true) { return createProviderOutcome({ ...common, outcome: kind, side_effects_executed, evidence }); }

test('ProviderOutcome accepts and canonically digests all four result classes', () => {
  const outcomes = [
    outcome('confirmed-success', { kind: 'receipt', receipt_id: 'receipt-1', receipt_digest: `sha256:${'3'.repeat(64)}` }),
    outcome('confirmed-failure-no-side-effect', { kind: 'no-side-effect-proof', proof_id: 'proof-1', proof_digest: `sha256:${'4'.repeat(64)}` }, false),
    outcome('partial-success', { kind: 'partial-observation', completed_resource_scope: ['resource:1'], incomplete_resource_scope: ['resource:2'], observation_digest: `sha256:${'5'.repeat(64)}` }),
    outcome('outcome-uncertain', { kind: 'uncertainty', reason: 'provider-timeout', last_known_fact_digest: `sha256:${'6'.repeat(64)}`, frozen_resource_scope: ['resource:1'], allowed_queries: ['provider.read'], forbidden_actions: ['provider.write', 'retry-with-new-request-id'], reconciliation_budget: { max_queries: 3, deadline: '2026-07-31T01:05:00.000Z', query_scope: ['resource:1'], max_cost: 1 } }, false),
  ];
  for (const item of outcomes) { assert.equal(validateProviderOutcome(item).status, 'valid'); assert.match(item.outcome_digest, /^sha256:[0-9a-f]{64}$/); }
});

test('ProviderOutcome rejects evidence that contradicts the classified result', () => {
  assert.throws(() => outcome('confirmed-failure-no-side-effect', { kind: 'no-side-effect-proof', proof_id: 'proof-1', proof_digest: `sha256:${'4'.repeat(64)}` }, true), { message: 'provider-outcome-schema-invalid' });
  assert.throws(() => outcome('partial-success', { kind: 'partial-observation', completed_resource_scope: ['resource:1'], incomplete_resource_scope: [], observation_digest: `sha256:${'5'.repeat(64)}` }), { message: 'provider-outcome-schema-invalid' });
  assert.throws(() => outcome('outcome-uncertain', { kind: 'uncertainty', reason: 'timeout', last_known_fact_digest: 'not-a-digest', frozen_resource_scope: ['resource:1'], allowed_queries: ['provider.read'], forbidden_actions: ['provider.write'], reconciliation_budget: { max_queries: 0, deadline: '2026-07-31T01:05:00.000Z', query_scope: ['resource:1'], max_cost: 1 } }, false), { message: 'provider-outcome-schema-invalid' });
});

test('ProviderOutcome binding validation blocks cross-scope evidence', () => {
  const item = outcome('confirmed-success', { kind: 'receipt', receipt_id: 'receipt-1', receipt_digest: `sha256:${'3'.repeat(64)}` });
  const expected = { ...common };
  assert.equal(validateProviderOutcomeBinding({ outcome: item, expected }).status, 'valid');
  const mismatch = validateProviderOutcomeBinding({ outcome: item, expected: { ...expected, execution_id: 'execution-other' } });
  assert.equal(mismatch.status, 'blocked');
  assert.ok(mismatch.errors.includes('binding-execution_id-mismatch'));
});
