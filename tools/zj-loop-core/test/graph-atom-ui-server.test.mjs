import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInMemoryHumanSigner } from '../dist/human-signer.js';
import { createGraphAtomUiFixture, projectGraphAtomUiReadModel } from '../dist/graph-atom-ui-read-model.js';
import { createHumanApprovalUiServer } from '../dist/human-approval-ui.js';

function request({ address, path, headers = {} }) {
  return new Promise((resolve, reject) => {
    import('node:http').then(({ request: makeRequest }) => {
      const req = makeRequest({ hostname: '127.0.0.1', port: address.port, path, headers }, (res) => { const chunks = []; res.on('data', (chunk) => chunks.push(chunk)); res.on('end', () => { const text = Buffer.concat(chunks).toString('utf8'); let body = text; try { body = JSON.parse(text); } catch {} resolve({ status: res.statusCode, headers: res.headers, body }); }); });
      req.on('error', reject); req.end();
    }, reject);
  });
}

test('Graph Atom UI server serves scoped event summaries, detail, and evidence references through the Human session', async () => {
  const signer = createInMemoryHumanSigner({ human_id: 'human-1' });
  const event = projectGraphAtomUiReadModel(createGraphAtomUiFixture('review-ready'));
  const server = createHumanApprovalUiServer({ signer, network_id: event.network_id, bootstrap_token: 'graph-bootstrap', upstream: { async list() { return { requests: [] }; } }, graph: { async list() { return { events: [event] }; }, async get() { return { event }; }, async evidence() { return { evidence: [{ kind: 'execution-output', artifact_id: 'artifact-agent-1', digest: event.nodes[0].evidence[0].digest }] }; } }, now: () => '2026-07-31T12:01:00.000Z' });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const unauthenticated = await request({ address: server.address(), path: '/ui/events' });
    assert.equal(unauthenticated.status, 401);
    const bootstrapped = await request({ address: server.address(), path: '/ui/bootstrap?token=graph-bootstrap' });
    const cookie = bootstrapped.headers['set-cookie'][0].split(';', 1)[0];
    const listed = await request({ address: server.address(), path: '/ui/events', headers: { cookie } });
    assert.equal(listed.status, 200);
    assert.equal(listed.body.events[0].event_id, event.event.event_id);
    assert.equal(listed.body.events[0].status, 'review-ready');
    const detail = await request({ address: server.address(), path: `/ui/events/${event.event.event_id}`, headers: { cookie } });
    assert.equal(detail.status, 200);
    assert.equal(detail.body.event.plan.plan_digest, event.plan.plan_digest);
    assert.equal(detail.body.event.nodes.length, 2);
    const evidence = await request({ address: server.address(), path: `/ui/events/${event.event.event_id}/evidence`, headers: { cookie } });
    assert.equal(evidence.status, 200);
    assert.deepEqual(evidence.body.evidence, [{ kind: 'execution-output', artifact_id: 'artifact-agent-1', digest: event.nodes[0].evidence[0].digest }]);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
