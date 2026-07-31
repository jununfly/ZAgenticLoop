import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createInMemoryHumanSigner } from '../dist/human-signer.js';
import { createProviderOutcome } from '../dist/provider-outcome.js';
import { createProviderOutcomeVerification } from '../dist/provider-outcome-verification.js';
import { createReviewHandoff } from '../dist/review-handoff.js';
import { createHumanAcceptance } from '../dist/human-acceptance.js';
import { recordHumanAcceptance } from '../dist/human-acceptance-fact.js';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';

const digest = (value) => `sha256:${value.repeat(64)}`;
const outcome = createProviderOutcome({ network_id: 'network-1', event_id: 'event-1', plan_id: 'plan-1', plan_revision: 3, execution_id: 'execution-1', task_id: 'task-1', provider_id: 'agent-1', provider_kind: 'fixture', provider_request_id: 'request-1', request_digest: digest('1'), response_digest: digest('2'), resource_scope: ['resource:1'], observed_at: '2026-07-31T08:00:00.000Z', outcome: 'confirmed-success', side_effects_executed: true, evidence: { kind: 'receipt', receipt_id: 'receipt-1', receipt_digest: digest('3') } });
const verification = createProviderOutcomeVerification({ outcome, verifier_id: 'verifier-1', verification_conditions: ['present'], satisfied_conditions: ['present'], failed_conditions: [], evidence_digest: digest('4'), checked_at: '2026-07-31T08:01:00.000Z' });
const resources = [{ resource_id: 'resource:1', last_known_status: 'updated', responsible_party: 'human-1' }];

async function withStore(work) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-human-acceptance-fact-'));
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  try {
    await stateStore.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2026-07-31T08:00:00.000Z' });
    return await work(stateStore);
  } finally {
    await stateStore.close();
    await rm(root, { recursive: true, force: true });
  }
}

async function fixture() {
  const signer = createInMemoryHumanSigner({ human_id: 'human-1' });
  const identity = await signer.getPublicIdentity();
  const handoff = createReviewHandoff({ verification, dependencies_closed: true, remaining_risks: [], external_resource_states: resources, responsible_party: 'human-1', accepted_at: '2026-07-31T08:02:00.000Z' });
  const acceptance = await createHumanAcceptance({ signer, handoff, plan_digest: digest('5'), accepted_at: '2026-07-31T08:03:00.000Z' });
  return { acceptance, handoff, identity };
}

test('Human Acceptance fact appends only after authority and handoff validation', async () => withStore(async (stateStore) => {
  const { acceptance, handoff, identity } = await fixture();
  const result = await recordHumanAcceptance({ stateStore, expected_revision: 1, acceptance, identity, handoff, now: '2026-07-31T08:04:00.000Z' });

  assert.equal(result.schema, 'zj-loop.human_acceptance_recorded.v1');
  assert.equal(result.status, 'recorded');
  assert.equal(result.side_effects_executed, false);
  assert.equal(result.revision, 2);
  const events = await stateStore.readEvents({ network_id: 'network-1', after_revision: 1 });
  assert.equal(events.events.length, 1);
  assert.equal(events.events[0].aggregate_type, 'human-acceptance');
  assert.equal(events.events[0].aggregate_id, acceptance.event_id);
  assert.equal(events.events[0].event_type, 'human-acceptance.accepted');
  assert.deepEqual(events.events[0].payload, { schema: 'zj-loop.human_acceptance_recorded.v1', acceptance });
}));

test('the same Human Acceptance fact is idempotent and does not advance StateStore revision', async () => withStore(async (stateStore) => {
  const { acceptance, handoff, identity } = await fixture();
  const first = await recordHumanAcceptance({ stateStore, expected_revision: 1, acceptance, identity, handoff, now: '2026-07-31T08:04:00.000Z' });
  const retry = await recordHumanAcceptance({ stateStore, expected_revision: 2, acceptance, identity, handoff, now: '2026-07-31T08:05:00.000Z' });

  assert.equal(first.status, 'recorded');
  assert.equal(retry.status, 'duplicate');
  assert.equal(retry.event_id, first.event_id);
  assert.equal(await stateStore.getRevision('network-1'), 2);
}));

test('a different handoff for the same event conflicts without replacing the accepted fact', async () => withStore(async (stateStore) => {
  const { acceptance, handoff, identity } = await fixture();
  await recordHumanAcceptance({ stateStore, expected_revision: 1, acceptance, identity, handoff, now: '2026-07-31T08:04:00.000Z' });
  const secondHandoff = createReviewHandoff({ verification, dependencies_closed: true, remaining_risks: [], external_resource_states: [{ ...resources[0], last_known_status: 'revalidated' }], responsible_party: 'human-1', accepted_at: '2026-07-31T08:05:00.000Z' });
  const secondSigner = createInMemoryHumanSigner({ human_id: 'human-1' });
  const secondIdentity = await secondSigner.getPublicIdentity();
  const secondAcceptance = await createHumanAcceptance({ signer: secondSigner, handoff: secondHandoff, plan_digest: digest('5'), accepted_at: '2026-07-31T08:06:00.000Z' });
  const result = await recordHumanAcceptance({ stateStore, expected_revision: 2, acceptance: secondAcceptance, identity: secondIdentity, handoff: secondHandoff, now: '2026-07-31T08:07:00.000Z' });

  assert.equal(result.status, 'conflict');
  assert.equal(result.reason, 'human-acceptance-event-already-accepted');
  assert.equal(await stateStore.getRevision('network-1'), 2);
}));

test('Human Acceptance fact returns CAS conflict on a stale StateStore revision', async () => withStore(async (stateStore) => {
  const { acceptance, handoff, identity } = await fixture();
  const result = await recordHumanAcceptance({ stateStore, expected_revision: 9, acceptance, identity, handoff, now: '2026-07-31T08:04:00.000Z' });

  assert.equal(result.status, 'conflict');
  assert.equal(result.reason, 'revision-mismatch');
  assert.equal(result.current_revision, 1);
  assert.equal(await stateStore.getRevision('network-1'), 1);
}));

test('blocked Human Acceptance is rejected before StateStore append', async () => withStore(async (stateStore) => {
  const { acceptance, handoff, identity } = await fixture();
  const blocked = { ...acceptance, verification_digest: digest('9') };
  const result = await recordHumanAcceptance({ stateStore, expected_revision: 1, acceptance: blocked, identity, handoff, now: '2026-07-31T08:04:00.000Z' });

  assert.equal(result.status, 'blocked');
  assert.equal(await stateStore.getRevision('network-1'), 1);
}));

test('concurrent different Human Acceptances have one winner and one conflict', async () => withStore(async (stateStore) => {
  const first = await fixture();
  const secondHandoff = createReviewHandoff({ verification, dependencies_closed: true, remaining_risks: [], external_resource_states: [{ ...resources[0], last_known_status: 'revalidated' }], responsible_party: 'human-1', accepted_at: '2026-07-31T08:05:00.000Z' });
  const secondSigner = createInMemoryHumanSigner({ human_id: 'human-1' });
  const secondIdentity = await secondSigner.getPublicIdentity();
  const secondAcceptance = await createHumanAcceptance({ signer: secondSigner, handoff: secondHandoff, plan_digest: digest('5'), accepted_at: '2026-07-31T08:06:00.000Z' });
  const results = await Promise.all([
    recordHumanAcceptance({ stateStore, expected_revision: 1, acceptance: first.acceptance, identity: first.identity, handoff: first.handoff, now: '2026-07-31T08:07:00.000Z' }),
    recordHumanAcceptance({ stateStore, expected_revision: 1, acceptance: secondAcceptance, identity: secondIdentity, handoff: secondHandoff, now: '2026-07-31T08:07:01.000Z' }),
  ]);

  assert.deepEqual(new Set(results.map((result) => result.status)), new Set(['recorded', 'conflict']));
  assert.equal(await stateStore.getRevision('network-1'), 2);
}));
