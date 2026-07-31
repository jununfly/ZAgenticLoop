import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createProviderOutcome } from '../dist/provider-outcome.js';
import { recordProviderOutcome } from '../dist/provider-outcome-fact.js';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';

const base = { network_id: 'network-1', event_id: 'event-1', plan_id: 'plan-1', plan_revision: 2, execution_id: 'execution-1', task_id: 'task-1', provider_id: 'simulated-provider-1', provider_kind: 'simulated', provider_request_id: 'request-1', request_digest: `sha256:${'1'.repeat(64)}`, response_digest: `sha256:${'2'.repeat(64)}`, resource_scope: ['resource:1'], observed_at: '2026-07-31T01:00:00.000Z', outcome: 'confirmed-success', side_effects_executed: true, evidence: { kind: 'receipt', receipt_id: 'receipt-1', receipt_digest: `sha256:${'3'.repeat(64)}` } };

test('Provider outcome facts are append-only and idempotent without advancing task state', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-provider-outcome-fact-'));
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  try {
    await stateStore.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2026-07-31T00:00:00.000Z' });
    const outcome = createProviderOutcome(base);
    const first = await recordProviderOutcome({ stateStore, expected_revision: 1, outcome, now: '2026-07-31T01:00:01.000Z' });
    assert.equal(first.status, 'recorded');
    assert.equal(first.side_effects_executed, false);
    const retry = await recordProviderOutcome({ stateStore, expected_revision: 2, outcome, now: '2026-07-31T01:00:02.000Z' });
    assert.equal(retry.status, 'duplicate');
    const events = await stateStore.readEvents({ network_id: 'network-1', after_revision: 1 });
    assert.equal(events.events.length, 1);
    assert.equal(events.events[0].event_type, 'provider.outcome.recorded');
    assert.equal((events.events[0].payload).outcome.outcome, 'confirmed-success');
  } finally { await stateStore.close(); await rm(root, { recursive: true, force: true }); }
});

test('Provider outcome facts reject a different result for the same request scope', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-provider-outcome-conflict-'));
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  try {
    await stateStore.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2026-07-31T00:00:00.000Z' });
    const first = createProviderOutcome(base);
    const second = createProviderOutcome({ ...base, outcome: 'outcome-uncertain', side_effects_executed: false, response_digest: `sha256:${'4'.repeat(64)}`, evidence: { kind: 'uncertainty', reason: 'timeout', last_known_fact_digest: `sha256:${'5'.repeat(64)}`, frozen_resource_scope: ['resource:1'], allowed_queries: ['provider.read'], forbidden_actions: ['provider.write'], reconciliation_budget: { max_queries: 2, deadline: '2026-07-31T01:05:00.000Z', query_scope: ['resource:1'], max_cost: 1 } } });
    assert.equal((await recordProviderOutcome({ stateStore, expected_revision: 1, outcome: first, now: '2026-07-31T01:00:01.000Z' })).status, 'recorded');
    const conflict = await recordProviderOutcome({ stateStore, expected_revision: 2, outcome: second, now: '2026-07-31T01:00:02.000Z' });
    assert.equal(conflict.status, 'conflict');
    assert.equal(conflict.side_effects_executed, false);
  } finally { await stateStore.close(); await rm(root, { recursive: true, force: true }); }
});
