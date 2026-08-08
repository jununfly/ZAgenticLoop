import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';
import { createGraphAtomUiFixture, projectGraphAtomUiReadModel } from '../dist/graph-atom-ui-read-model.js';
import { createStateStoreGraphAtomUiUpstream, recordGraphAtomUiReadModel } from '../dist/state-store-graph-atom-ui-upstream.js';
import { createInMemoryHumanSigner } from '../dist/human-signer.js';
import { createHumanApprovalUiServer } from '../dist/human-approval-ui.js';
import { createProviderOutcome } from '../dist/provider-outcome.js';
import { createProviderOutcomeVerification } from '../dist/provider-outcome-verification.js';
import { createReviewHandoff } from '../dist/review-handoff.js';

function request({ address, path: requestPath, method = 'GET', headers = {}, body }) {
  return new Promise((resolve, reject) => {
    import('node:http').then(({ request: makeRequest }) => {
      const payload = body === undefined ? undefined : JSON.stringify(body);
      const req = makeRequest({ hostname: '127.0.0.1', port: address.port, path: requestPath, method, headers: { ...(payload ? { 'content-length': Buffer.byteLength(payload) } : {}), ...headers } }, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => { const text = Buffer.concat(chunks).toString('utf8'); let body = text; try { body = JSON.parse(text); } catch {} resolve({ status: res.statusCode, headers: res.headers, body }); });
      });
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    }, reject);
  });
}

test('StateStore Graph upstream reads the persisted native Graph UI read model by scope', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-state-store-graph-ui-upstream-'));
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  try {
    const model = projectGraphAtomUiReadModel(createGraphAtomUiFixture('review-ready'));
    await stateStore.createNetwork({ network_id: model.network_id, owner_id: model.center.human_id });
    assert.equal(await recordGraphAtomUiReadModel({ stateStore, model, now: '2026-08-08T00:00:00.000Z' }).then((result) => result.status), 'recorded');

    const upstream = createStateStoreGraphAtomUiUpstream({ stateStore, network_id: model.network_id });
    const listed = await upstream.list();
    assert.deepEqual(listed.events.map((event) => event.event.event_id), [model.event.event_id]);
    assert.equal((await upstream.get({ event_id: model.event.event_id })).event?.read_model_digest, model.read_model_digest);
  } finally {
    await stateStore.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('Human Approval UI reads Graph events from the StateStore upstream without a temporary bridge', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-state-store-graph-ui-server-'));
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  const signer = createInMemoryHumanSigner({ human_id: 'human-1' });
  let server;
  try {
    const model = projectGraphAtomUiReadModel(createGraphAtomUiFixture('review-ready'));
    await stateStore.createNetwork({ network_id: model.network_id, owner_id: model.center.human_id });
    await recordGraphAtomUiReadModel({ stateStore, model, now: '2026-08-08T00:00:00.000Z' });
    server = createHumanApprovalUiServer({ signer, network_id: model.network_id, bootstrap_token: 'native-bootstrap', upstream: { async list() { return { requests: [] }; }, graphAtoms: async () => ({ graphs: [] }) }, graph: createStateStoreGraphAtomUiUpstream({ stateStore, network_id: model.network_id }) });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const bootstrap = await request({ address: server.address(), path: '/ui/bootstrap?token=native-bootstrap' });
    const cookie = bootstrap.headers['set-cookie'][0].split(';', 1)[0];
    const response = await request({ address: server.address(), path: '/ui/events', headers: { cookie } });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.events.map((event) => event.event_id), [model.event.event_id]);
    assert.equal(response.body.events[0].status, 'review-ready');
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await stateStore.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('StateStore Graph upstream records the standard signed Human acceptance fact and is idempotent', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-state-store-graph-ui-accept-'));
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  const signer = createInMemoryHumanSigner({ human_id: 'human-1' });
  let server;
  try {
    const facts = createGraphAtomUiFixture('review-ready');
    const outcome = createProviderOutcome({ network_id: facts.network_id, event_id: facts.event.event_id, plan_id: facts.plan.plan_id, plan_revision: facts.plan.plan_revision, execution_id: 'execution-graph-ui', task_id: 'task-graph-ui', provider_id: 'agent-1', provider_kind: 'fixture', provider_request_id: 'request-graph-ui', request_digest: 'sha256:' + '1'.repeat(64), response_digest: 'sha256:' + '2'.repeat(64), resource_scope: ['resource:graph-ui'], observed_at: '2026-08-07T23:59:00.000Z', outcome: 'confirmed-success', side_effects_executed: true, evidence: { kind: 'receipt', receipt_id: 'receipt-graph-ui', receipt_digest: 'sha256:' + '3'.repeat(64) } });
    const verification = createProviderOutcomeVerification({ outcome, verifier_id: 'verifier-1', verification_conditions: ['present'], satisfied_conditions: ['present'], failed_conditions: [], evidence_digest: 'sha256:' + '4'.repeat(64), checked_at: '2026-08-08T00:00:00.000Z' });
    const handoff = createReviewHandoff({ verification, dependencies_closed: true, remaining_risks: [], external_resource_states: [{ resource_id: 'resource:graph-ui', last_known_status: 'updated', responsible_party: 'human-1' }], responsible_party: 'human-1', accepted_at: '2026-08-08T00:01:00.000Z' });
    facts.verification.verification_digest = verification.verification_digest;
    facts.review_handoff.handoff_digest = handoff.handoff_digest;
    const model = projectGraphAtomUiReadModel(facts);
    await stateStore.createNetwork({ network_id: model.network_id, owner_id: model.center.human_id });
    await recordGraphAtomUiReadModel({ stateStore, model, handoff, now: '2026-08-08T00:02:00.000Z' });
    const upstream = createStateStoreGraphAtomUiUpstream({ stateStore, network_id: model.network_id });
    server = createHumanApprovalUiServer({ signer, network_id: model.network_id, bootstrap_token: 'accept-native-bootstrap', upstream: { async list() { return { requests: [] }; } }, graph: upstream, now: () => '2026-08-08T00:03:00.000Z' });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const bootstrap = await request({ address: server.address(), path: '/ui/bootstrap?token=accept-native-bootstrap' });
    const cookie = bootstrap.headers['set-cookie'][0].split(';', 1)[0];
    const payload = { network_id: model.network_id, plan_id: model.plan.plan_id, plan_revision: model.plan.plan_revision, plan_digest: model.plan.plan_digest, review_handoff_digest: model.review_handoff.handoff_digest, verification_digest: model.verification.verification_digest };
    const first = await request({ address: server.address(), path: `/ui/events/${model.event.event_id}/accept`, headers: { cookie, origin: `http://127.0.0.1:${server.address().port}`, 'content-type': 'application/json' }, method: 'POST', body: payload });
    const replay = await request({ address: server.address(), path: `/ui/events/${model.event.event_id}/accept`, headers: { cookie, origin: `http://127.0.0.1:${server.address().port}`, 'content-type': 'application/json' }, method: 'POST', body: payload });
    assert.equal(first.status, 201);
    assert.equal(replay.status, 200);
    assert.equal(replay.body.status, 'duplicate');
    assert.equal((await stateStore.readEvents({ network_id: model.network_id, aggregate_type: 'human-acceptance' })).events.length, 1);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await stateStore.close();
    await rm(root, { recursive: true, force: true });
  }
});
