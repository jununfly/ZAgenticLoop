import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSimulatedProvider } from '../dist/simulated-provider.js';
import { validateProviderOutcome } from '../dist/provider-outcome.js';

const base = { network_id: 'network-1', event_id: 'event-1', plan_id: 'plan-1', plan_revision: 1, execution_id: 'execution-1', task_id: 'task-1', provider_request_id: 'request-1', request_digest: `sha256:${'1'.repeat(64)}`, resource_scope: ['resource:1'], observed_at: '2026-07-31T02:00:00.000Z' };

test('SimulatedProvider emits the four ProviderOutcome classes without real calls', async () => {
  const provider = createSimulatedProvider({ provider_id: 'sim-provider-1', namespace: 'fixture-1' });
  const scenarios = [
    { outcome: 'confirmed-success', virtual_side_effects: ['resource:1'] },
    { outcome: 'confirmed-failure-no-side-effect', failure_reason: 'fixture-failure' },
    { outcome: 'partial-success', completed_resource_scope: ['resource:1'], incomplete_resource_scope: ['resource:2'] },
    { outcome: 'outcome-uncertain', reason: 'fixture-timeout', deadline: '2026-07-31T02:05:00.000Z' },
  ];
  for (const [index, scenario] of scenarios.entries()) {
    const result = await provider.execute({ ...base, task_id: `task-${index}`, provider_request_id: `request-${index}`, scenario });
    assert.equal(result.status, 'recorded');
    assert.equal(result.provider_kind, 'simulated');
    assert.equal(result.real_provider_calls, 0);
    assert.equal(result.side_effects_executed, false);
    assert.equal(validateProviderOutcome(result.outcome).status, 'valid');
  }
});

test('SimulatedProvider reuses a request result and blocks conflicting retries', async () => {
  const provider = createSimulatedProvider({ provider_id: 'sim-provider-1', namespace: 'fixture-2' });
  const request = { ...base, scenario: { outcome: 'confirmed-success', virtual_side_effects: ['resource:1'] } };
  const first = await provider.execute(request);
  const retry = await provider.execute(request);
  assert.equal(first.status, 'recorded');
  assert.equal(retry.status, 'duplicate');
  assert.equal(retry.outcome.outcome_digest, first.outcome.outcome_digest);
  const conflict = await provider.execute({ ...request, request_digest: `sha256:${'9'.repeat(64)}` });
  assert.equal(conflict.status, 'blocked');
  assert.equal(conflict.reason, 'provider-request-conflict');
  provider.reset();
  const afterReset = await provider.execute(request);
  assert.equal(afterReset.status, 'recorded');
});
