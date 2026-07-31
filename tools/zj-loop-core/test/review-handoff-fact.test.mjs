import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createProviderOutcome } from '../dist/provider-outcome.js';
import { createProviderOutcomeVerification } from '../dist/provider-outcome-verification.js';
import { createReviewHandoff } from '../dist/review-handoff.js';
import { recordReviewHandoff } from '../dist/review-handoff-fact.js';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';

const outcome = createProviderOutcome({ network_id: 'network-1', event_id: 'event-1', plan_id: 'plan-1', plan_revision: 1, execution_id: 'execution-1', task_id: 'task-1', provider_id: 'provider-1', provider_kind: 'simulated', provider_request_id: 'request-1', request_digest: `sha256:${'1'.repeat(64)}`, response_digest: `sha256:${'2'.repeat(64)}`, resource_scope: ['resource:1'], observed_at: '2026-07-31T06:00:00.000Z', outcome: 'confirmed-success', side_effects_executed: true, evidence: { kind: 'receipt', receipt_id: 'receipt-1', receipt_digest: `sha256:${'3'.repeat(64)}` } });
const verification = createProviderOutcomeVerification({ outcome, verifier_id: 'verifier-1', verification_conditions: ['present'], satisfied_conditions: ['present'], failed_conditions: [], evidence_digest: `sha256:${'4'.repeat(64)}`, checked_at: '2026-07-31T06:01:00.000Z' });
const resources = [{ resource_id: 'resource:1', last_known_status: 'updated', responsible_party: 'human-1' }];
const handoff = (remaining_risks = [], dependencies_closed = true) => createReviewHandoff({ verification, dependencies_closed, remaining_risks, external_resource_states: resources, responsible_party: 'human-1', accepted_at: '2026-07-31T06:02:00.000Z' });

async function withStore(name, work) {
  const root = await mkdtemp(path.join(os.tmpdir(), `zj-review-handoff-${name}-`));
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  try { await stateStore.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2026-07-31T00:00:00.000Z' }); return await work(stateStore); }
  finally { await stateStore.close(); await rm(root, { recursive: true, force: true }); }
}

test('Review Handoff facts persist accepted and blocked outcomes without completion facts', async () => withStore('lifecycle', async (stateStore) => {
  const accepted = await recordReviewHandoff({ stateStore, expected_revision: 1, handoff: handoff(), now: '2026-07-31T06:03:00.000Z' });
  assert.equal(accepted.status, 'recorded');
  const otherOutcome = createProviderOutcome({ ...outcome, event_id: 'event-2' });
  const otherVerification = createProviderOutcomeVerification({ outcome: otherOutcome, verifier_id: 'verifier-1', verification_conditions: ['present'], satisfied_conditions: ['present'], failed_conditions: [], evidence_digest: `sha256:${'6'.repeat(64)}`, checked_at: '2026-07-31T06:03:30.000Z' });
  const blockedHandoff = createReviewHandoff({ verification: otherVerification, dependencies_closed: true, remaining_risks: ['risk remains'], external_resource_states: resources, responsible_party: 'human-1', accepted_at: '2026-07-31T06:04:00.000Z' });
  const blocked = await recordReviewHandoff({ stateStore, expected_revision: 2, handoff: blockedHandoff, now: '2026-07-31T06:04:00.000Z' });
  assert.equal(blocked.status, 'recorded');
  const events = await stateStore.readEvents({ network_id: 'network-1', after_revision: 1 });
  assert.deepEqual(events.events.map((event) => event.event_type), ['review-handoff.accepted', 'review-handoff.blocked']);
  assert.equal(events.events.some((event) => event.event_type === 'task.completed' || event.event_type === 'event.completed'), false);
}));

test('same Review Handoff retries are duplicate and different Handoffs in one scope conflict', async () => withStore('cas', async (stateStore) => {
  const first = handoff();
  assert.equal((await recordReviewHandoff({ stateStore, expected_revision: 1, handoff: first, now: '2026-07-31T06:03:00.000Z' })).status, 'recorded');
  assert.equal((await recordReviewHandoff({ stateStore, expected_revision: 2, handoff: first, now: '2026-07-31T06:04:00.000Z' })).status, 'duplicate');
  const different = createReviewHandoff({ verification, dependencies_closed: true, remaining_risks: [], external_resource_states: [{ ...resources[0], last_known_status: 'changed' }], responsible_party: 'human-1', accepted_at: '2026-07-31T06:05:00.000Z' });
  const conflict = await recordReviewHandoff({ stateStore, expected_revision: 2, handoff: different, now: '2026-07-31T06:05:01.000Z' });
  assert.equal(conflict.status, 'conflict');
}));

test('concurrent Review Handoff writes converge to one winner', async () => withStore('concurrent', async (stateStore) => {
  const first = handoff();
  const second = createReviewHandoff({ verification, dependencies_closed: true, remaining_risks: [], external_resource_states: resources, responsible_party: 'human-2', accepted_at: '2026-07-31T06:03:01.000Z' });
  const results = await Promise.all([recordReviewHandoff({ stateStore, expected_revision: 1, handoff: first, now: '2026-07-31T06:03:00.000Z' }), recordReviewHandoff({ stateStore, expected_revision: 1, handoff: second, now: '2026-07-31T06:03:01.000Z' })]);
  assert.deepEqual(new Set(results.map((result) => result.status)), new Set(['recorded', 'conflict']));
  assert.equal(await stateStore.getRevision('network-1'), 2);
}));
