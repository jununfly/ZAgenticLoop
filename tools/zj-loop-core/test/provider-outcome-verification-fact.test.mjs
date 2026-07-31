import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createProviderOutcome } from '../dist/provider-outcome.js';
import { createProviderOutcomeVerification } from '../dist/provider-outcome-verification.js';
import { recordProviderOutcomeVerification } from '../dist/provider-outcome-verification-fact.js';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';

const outcome = createProviderOutcome({ network_id: 'network-1', event_id: 'event-1', plan_id: 'plan-1', plan_revision: 1, execution_id: 'execution-1', task_id: 'task-1', provider_id: 'provider-1', provider_kind: 'simulated', provider_request_id: 'request-1', request_digest: `sha256:${'1'.repeat(64)}`, response_digest: `sha256:${'2'.repeat(64)}`, resource_scope: ['resource:1'], observed_at: '2026-07-31T05:00:00.000Z', outcome: 'confirmed-success', side_effects_executed: true, evidence: { kind: 'receipt', receipt_id: 'receipt-1', receipt_digest: `sha256:${'3'.repeat(64)}` } });
const makeVerification = (status = 'passed') => createProviderOutcomeVerification({ outcome, verifier_id: 'verifier-1', verification_conditions: ['present'], satisfied_conditions: status === 'passed' ? ['present'] : [], failed_conditions: status === 'passed' ? [] : ['present'], evidence_digest: `sha256:${status === 'passed' ? '4'.repeat(64) : '5'.repeat(64)}`, checked_at: '2026-07-31T05:01:00.000Z' });

test('Verification facts are append-only, idempotent, and do not complete the task', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-provider-verification-fact-'));
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  try {
    await stateStore.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2026-07-31T00:00:00.000Z' });
    const verification = makeVerification();
    const first = await recordProviderOutcomeVerification({ stateStore, expected_revision: 1, verification, now: '2026-07-31T05:01:01.000Z' });
    assert.equal(first.status, 'recorded');
    assert.equal(first.side_effects_executed, false);
    const retry = await recordProviderOutcomeVerification({ stateStore, expected_revision: 2, verification, now: '2026-07-31T05:01:02.000Z' });
    assert.equal(retry.status, 'duplicate');
    const events = await stateStore.readEvents({ network_id: 'network-1', after_revision: 1 });
    assert.equal(events.events.length, 1);
    assert.equal(events.events[0].event_type, 'verification.passed');
  } finally { await stateStore.close(); await rm(root, { recursive: true, force: true }); }
});

test('A different verification result for the same outcome conflicts', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-provider-verification-conflict-'));
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  try {
    await stateStore.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2026-07-31T00:00:00.000Z' });
    const passed = makeVerification('passed');
    const failed = createProviderOutcomeVerification({ outcome, verifier_id: 'verifier-2', verification_conditions: ['present'], satisfied_conditions: [], failed_conditions: ['present'], evidence_digest: `sha256:${'6'.repeat(64)}`, checked_at: '2026-07-31T05:02:00.000Z' });
    assert.equal((await recordProviderOutcomeVerification({ stateStore, expected_revision: 1, verification: passed, now: '2026-07-31T05:01:01.000Z' })).status, 'recorded');
    const conflict = await recordProviderOutcomeVerification({ stateStore, expected_revision: 2, verification: failed, now: '2026-07-31T05:02:01.000Z' });
    assert.equal(conflict.status, 'conflict');
  } finally { await stateStore.close(); await rm(root, { recursive: true, force: true }); }
});
