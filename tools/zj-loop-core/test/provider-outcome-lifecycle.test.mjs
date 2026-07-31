import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createProviderOutcome } from '../dist/provider-outcome.js';
import { mapProviderOutcomeLifecycle } from '../dist/provider-outcome-lifecycle.js';

const common = { network_id: 'network-1', event_id: 'event-1', plan_id: 'plan-1', plan_revision: 2, execution_id: 'execution-1', task_id: 'task-1', provider_id: 'provider-1', provider_kind: 'simulated', provider_request_id: 'request-1', request_digest: `sha256:${'1'.repeat(64)}`, response_digest: `sha256:${'2'.repeat(64)}`, resource_scope: ['resource:1'], observed_at: '2026-07-31T03:00:00.000Z' };
const make = (outcome, evidence, side_effects_executed = true) => createProviderOutcome({ ...common, outcome, evidence, side_effects_executed });

test('Provider outcomes map to lifecycle gates without completing tasks or side effects', () => {
  const cases = [
    [make('confirmed-success', { kind: 'receipt', receipt_id: 'receipt-1', receipt_digest: `sha256:${'3'.repeat(64)}` }), 'verification-required', false, 'independent-verification'],
    [make('confirmed-failure-no-side-effect', { kind: 'no-side-effect-proof', proof_id: 'proof-1', proof_digest: `sha256:${'4'.repeat(64)}` }, false), 'recovery-required', false, 'create-recovery-decision'],
    [make('partial-success', { kind: 'partial-observation', completed_resource_scope: ['resource:1'], incomplete_resource_scope: ['resource:2'], observation_digest: `sha256:${'5'.repeat(64)}` }), 'needs-human-grill', true, 'submit-human-grill'],
    [make('outcome-uncertain', { kind: 'uncertainty', reason: 'timeout', last_known_fact_digest: `sha256:${'6'.repeat(64)}`, frozen_resource_scope: ['resource:1'], allowed_queries: ['provider.read'], forbidden_actions: ['provider.write'], reconciliation_budget: { max_queries: 2, deadline: '2026-07-31T03:05:00.000Z', query_scope: ['resource:1'], max_cost: 1 } }, false), 'blocked', true, 'bounded-reconciliation-or-human-grill'],
  ];
  for (const [outcome, status, frozen, action] of cases) {
    const result = mapProviderOutcomeLifecycle(outcome);
    assert.equal(result.status, status);
    assert.equal(result.resources_frozen, frozen);
    assert.equal(result.next_action, action);
    assert.equal(result.task_completed, false);
    assert.equal(result.side_effects_executed, false);
  }
});

test('invalid ProviderOutcome cannot advance lifecycle', () => {
  const outcome = make('confirmed-success', { kind: 'receipt', receipt_id: 'receipt-1', receipt_digest: `sha256:${'3'.repeat(64)}` });
  outcome.outcome_digest = `sha256:${'f'.repeat(64)}`;
  const result = mapProviderOutcomeLifecycle(outcome);
  assert.equal(result.status, 'blocked-input');
  assert.equal(result.task_completed, false);
  assert.equal(result.resources_frozen, true);
});
