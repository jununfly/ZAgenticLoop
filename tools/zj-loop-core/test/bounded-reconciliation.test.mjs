import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createBoundedReconciliationPlan,
  validateBoundedReconciliationPlan,
} from '../dist/bounded-reconciliation.js';

const digest = (letter) => 'sha256:' + letter.repeat(64);

test('bounded reconciliation plan is read-only, budgeted, and bound to the uncertain attempt', () => {
  const plan = createBoundedReconciliationPlan({
    network_id: 'network-1',
    execution_id: 'execution-1',
    attempt: 1,
    outcome_digest: digest('a'),
    reason_code: 'outcome-uncertain',
    max_queries: 3,
    deadline: '2026-08-01T01:00:00.000Z',
    query_scope: ['state facts', 'workspace status'],
    observed_fact_digests: [digest('b')],
  });
  assert.equal(plan.status, 'required');
  assert.equal(plan.side_effects_executed, false);
  assert.ok(plan.forbidden_actions.includes('provider.invoke'));
  assert.equal(validateBoundedReconciliationPlan(plan).status, 'valid');
});

test('bounded reconciliation rejects unbounded or write-capable plans', () => {
  assert.throws(() => createBoundedReconciliationPlan({
    network_id: 'network-1',
    execution_id: 'execution-1',
    attempt: 1,
    outcome_digest: digest('a'),
    reason_code: 'outcome-uncertain',
    max_queries: 0,
    deadline: '2026-08-01T01:00:00.000Z',
    query_scope: ['state facts'],
    observed_fact_digests: [],
  }), { message: 'bounded-reconciliation-input-invalid' });
});
