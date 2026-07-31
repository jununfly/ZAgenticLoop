import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createInMemoryHumanSigner } from '../dist/human-signer.js';
import { createProviderOutcome } from '../dist/provider-outcome.js';
import { createProviderOutcomeVerification } from '../dist/provider-outcome-verification.js';
import { createReviewHandoff } from '../dist/review-handoff.js';
import { recordReviewHandoff } from '../dist/review-handoff-fact.js';
import { createHumanAcceptance } from '../dist/human-acceptance.js';
import { recordHumanAcceptance } from '../dist/human-acceptance-fact.js';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';
import { createGraphAtomUiFixture, projectGraphAtomUiReadModel } from '../dist/graph-atom-ui-read-model.js';
import { createHumanApprovalUiServer } from '../dist/human-approval-ui.js';

const digest = (value) => `sha256:${value.repeat(64)}`;

function request({ address, path: requestPath, method = 'GET', headers = {}, body }) {
  return new Promise((resolve, reject) => {
    import('node:http').then(({ request: makeRequest }) => {
      const payload = body === undefined ? undefined : JSON.stringify(body);
      const req = makeRequest({ hostname: '127.0.0.1', port: address.port, path: requestPath, method, headers: { ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}), ...headers } }, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => { const text = Buffer.concat(chunks).toString('utf8'); let parsed = text; try { parsed = JSON.parse(text); } catch {} resolve({ status: res.statusCode, headers: res.headers, body: parsed }); });
      });
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    }, reject);
  });
}

test('Human Acceptance completes the real StateStore -> HTTP UI -> signed fact replay path', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-human-acceptance-e2e-'));
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  const signer = createInMemoryHumanSigner({ human_id: 'human-1' });
  const outcome = createProviderOutcome({ network_id: 'network-1', event_id: 'event-1', plan_id: 'plan-1', plan_revision: 3, execution_id: 'execution-1', task_id: 'task-1', provider_id: 'agent-1', provider_kind: 'fixture', provider_request_id: 'request-1', request_digest: digest('1'), response_digest: digest('2'), resource_scope: ['resource:1'], observed_at: '2026-07-31T08:00:00.000Z', outcome: 'confirmed-success', side_effects_executed: true, evidence: { kind: 'receipt', receipt_id: 'receipt-1', receipt_digest: digest('3') } });
  const verification = createProviderOutcomeVerification({ outcome, verifier_id: 'verifier-1', verification_conditions: ['present'], satisfied_conditions: ['present'], failed_conditions: [], evidence_digest: digest('4'), checked_at: '2026-07-31T08:01:00.000Z' });
  const handoff = createReviewHandoff({ verification, dependencies_closed: true, remaining_risks: [], external_resource_states: [{ resource_id: 'resource:1', last_known_status: 'updated', responsible_party: 'human-1' }], responsible_party: 'human-1', accepted_at: '2026-07-31T08:02:00.000Z' });
  const base = projectGraphAtomUiReadModel(createGraphAtomUiFixture('review-ready'));
  const event = { ...base, network_id: outcome.network_id, event: { ...base.event, event_id: outcome.event_id }, plan: { plan_id: outcome.plan_id, plan_revision: outcome.plan_revision, plan_digest: digest('5') }, verification: { ...base.verification, verification_digest: verification.verification_digest }, review_handoff: { ...base.review_handoff, handoff_digest: handoff.handoff_digest } };
  const now = '2026-07-31T12:03:00.000Z';
  await stateStore.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now });
  await stateStore.appendEvent({ network_id: 'network-1', expected_revision: 1, now, event: { event_id: 'graph-event-recorded:event-1', aggregate_type: 'message-event', aggregate_id: 'event-1', event_type: 'message-event.created', occurred_at: now, payload: { event } } });
  const handoffFact = await recordReviewHandoff({ stateStore, expected_revision: 2, handoff, now });
  assert.equal(handoffFact.status, 'recorded');
  const server = createHumanApprovalUiServer({ signer, network_id: 'network-1', bootstrap_token: 'e2e-bootstrap', upstream: { async list() { return { requests: [] }; } }, graph: {
    async list() { return { events: [event] }; },
    async get() { return { event }; },
    async evidence() { return { evidence: [] }; },
    async accept(input) {
      const acceptance = await createHumanAcceptance({ signer: input.signer, handoff, plan_digest: input.plan_digest, accepted_at: input.accepted_at });
      const identity = await input.signer.getPublicIdentity();
      return recordHumanAcceptance({ stateStore, expected_revision: await stateStore.getRevision('network-1'), acceptance, identity, handoff, now: input.accepted_at });
    },
  }, now: () => now });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const bootstrapped = await request({ address: server.address(), path: '/ui/bootstrap?token=e2e-bootstrap' });
    const cookie = bootstrapped.headers['set-cookie'][0].split(';', 1)[0];
    const body = { network_id: event.network_id, plan_id: event.plan.plan_id, plan_revision: event.plan.plan_revision, plan_digest: event.plan.plan_digest, review_handoff_digest: event.review_handoff.handoff_digest, verification_digest: event.verification.verification_digest };
    const first = await request({ address: server.address(), method: 'POST', path: '/ui/events/event-1/accept', headers: { cookie, origin: `http://127.0.0.1:${server.address().port}` }, body });
    const replay = await request({ address: server.address(), method: 'POST', path: '/ui/events/event-1/accept', headers: { cookie, origin: `http://127.0.0.1:${server.address().port}` }, body });
    assert.equal(first.status, 201);
    assert.equal(first.body.status, 'recorded');
    assert.equal(replay.status, 200);
    assert.equal(replay.body.status, 'duplicate');
    const events = await stateStore.readEvents({ network_id: 'network-1' });
    assert.deepEqual(events.events.map((item) => item.event_type), ['network.created', 'message-event.created', 'review-handoff.accepted', 'human-acceptance.accepted']);
    assert.equal(events.snapshot_revision, 4);
    assert.equal(events.events.some((item) => item.event_type === 'event.completed' || item.event_type === 'task.completed'), false);
    assert.equal(events.events.find((item) => item.event_type === 'human-acceptance.accepted').payload.acceptance.decision, 'accepted');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await stateStore.close();
    await rm(root, { recursive: true, force: true });
  }
});
