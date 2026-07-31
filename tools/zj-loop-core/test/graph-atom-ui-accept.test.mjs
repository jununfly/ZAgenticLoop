import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInMemoryHumanSigner } from '../dist/human-signer.js';
import { createGraphAtomUiFixture, projectGraphAtomUiReadModel } from '../dist/graph-atom-ui-read-model.js';
import { createHumanApprovalUiServer } from '../dist/human-approval-ui.js';

function request({ address, path, method = 'GET', headers = {}, body }) {
  return new Promise((resolve, reject) => {
    import('node:http').then(({ request: makeRequest }) => {
      const payload = body === undefined ? undefined : JSON.stringify(body);
      const req = makeRequest({ hostname: '127.0.0.1', port: address.port, path, method, headers: { ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}), ...headers } }, (res) => {
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

test('Graph Review accepts only the current review-ready event through a Human session', async () => {
  const signer = createInMemoryHumanSigner({ human_id: 'human-1' });
  const event = projectGraphAtomUiReadModel(createGraphAtomUiFixture('review-ready'));
  let accepted;
  const server = createHumanApprovalUiServer({ signer, network_id: event.network_id, bootstrap_token: 'accept-bootstrap', upstream: { async list() { return { requests: [] }; } }, graph: {
    async list() { return { events: [event] }; },
    async get() { return { event }; },
    async evidence() { return { evidence: [] }; },
    async accept(input) { accepted = input; return { status: 'recorded', event_id: event.event.event_id, acceptance: { canonical_payload_digest: 'sha256:' + 'a'.repeat(64) }, side_effects_executed: false }; },
  }, now: () => '2026-07-31T12:01:00.000Z' });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const bootstrapped = await request({ address: server.address(), path: '/ui/bootstrap?token=accept-bootstrap' });
    const cookie = bootstrapped.headers['set-cookie'][0].split(';', 1)[0];
    const response = await request({ address: server.address(), method: 'POST', path: `/ui/events/${event.event.event_id}/accept`, headers: { cookie, origin: `http://127.0.0.1:${server.address().port}` }, body: { network_id: event.network_id, plan_id: event.plan.plan_id, plan_revision: event.plan.plan_revision, plan_digest: event.plan.plan_digest, review_handoff_digest: event.review_handoff.handoff_digest, verification_digest: event.verification.verification_digest } });
    assert.equal(response.status, 201);
    assert.equal(response.body.status, 'recorded');
    assert.equal(accepted.event_id, event.event.event_id);
    assert.equal(accepted.signer, signer);
    assert.equal(accepted.plan_digest, event.plan.plan_digest);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('Graph Review blocks acceptance for a non-review-ready event before upstream write', async () => {
  const signer = createInMemoryHumanSigner({ human_id: 'human-1' });
  const event = projectGraphAtomUiReadModel(createGraphAtomUiFixture('blocked'));
  let acceptCalls = 0;
  const server = createHumanApprovalUiServer({ signer, network_id: event.network_id, bootstrap_token: 'blocked-bootstrap', upstream: { async list() { return { requests: [] }; } }, graph: {
    async list() { return { events: [event] }; },
    async get() { return { event }; },
    async evidence() { return { evidence: [] }; },
    async accept() { acceptCalls += 1; return { status: 'recorded' }; },
  }, now: () => '2026-07-31T12:01:00.000Z' });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const bootstrapped = await request({ address: server.address(), path: '/ui/bootstrap?token=blocked-bootstrap' });
    const cookie = bootstrapped.headers['set-cookie'][0].split(';', 1)[0];
    const response = await request({ address: server.address(), method: 'POST', path: `/ui/events/${event.event.event_id}/accept`, headers: { cookie, origin: `http://127.0.0.1:${server.address().port}` }, body: { network_id: event.network_id, plan_id: event.plan.plan_id, plan_revision: event.plan.plan_revision, plan_digest: event.plan.plan_digest, review_handoff_digest: event.review_handoff.handoff_digest, verification_digest: event.verification.verification_digest } });
    assert.equal(response.status, 409);
    assert.equal(response.body.reason, 'graph-event-not-review-ready');
    assert.equal(acceptCalls, 0);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('Graph Review acceptance API fails closed for session, Origin, event, and scope boundaries', async () => {
  const signer = createInMemoryHumanSigner({ human_id: 'human-1' });
  const event = projectGraphAtomUiReadModel(createGraphAtomUiFixture('review-ready'));
  let acceptCalls = 0;
  const server = createHumanApprovalUiServer({ signer, network_id: event.network_id, bootstrap_token: 'matrix-bootstrap', upstream: { async list() { return { requests: [] }; } }, graph: {
    async list() { return { events: [event] }; },
    async get({ event_id }) { return { event: event_id === event.event.event_id ? event : null }; },
    async evidence() { return { evidence: [] }; },
    async accept() { acceptCalls += 1; return { status: 'recorded' }; },
  }, now: () => '2026-07-31T12:01:00.000Z' });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    const payload = { network_id: event.network_id, plan_id: event.plan.plan_id, plan_revision: event.plan.plan_revision, plan_digest: event.plan.plan_digest, review_handoff_digest: event.review_handoff.handoff_digest, verification_digest: event.verification.verification_digest };
    const unauthenticated = await request({ address, method: 'POST', path: `/ui/events/${event.event.event_id}/accept`, body: payload });
    assert.equal(unauthenticated.status, 401);
    const bootstrapped = await request({ address, path: '/ui/bootstrap?token=matrix-bootstrap' });
    const cookie = bootstrapped.headers['set-cookie'][0].split(';', 1)[0];
    const wrongOrigin = await request({ address, method: 'POST', path: `/ui/events/${event.event.event_id}/accept`, headers: { cookie, origin: 'http://evil.example' }, body: payload });
    assert.equal(wrongOrigin.status, 403);
    const missingEvent = await request({ address, method: 'POST', path: '/ui/events/missing/accept', headers: { cookie, origin: `http://127.0.0.1:${address.port}` }, body: payload });
    assert.equal(missingEvent.status, 404);
    const scopeConflict = await request({ address, method: 'POST', path: `/ui/events/${event.event.event_id}/accept`, headers: { cookie, origin: `http://127.0.0.1:${address.port}` }, body: { ...payload, plan_digest: 'sha256:' + 'f'.repeat(64) } });
    assert.equal(scopeConflict.status, 409);
    assert.equal(scopeConflict.body.reason, 'graph-acceptance-scope-conflict');
    assert.equal(acceptCalls, 0);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
