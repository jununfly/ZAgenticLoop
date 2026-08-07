import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInMemoryHumanSigner } from '../dist/human-signer.js';
import { verifyHumanApprovalContext } from '../dist/human-authority.js';
import { createHumanApprovalUiServer } from '../dist/human-approval-ui.js';

function request({ address, path, method = 'GET', body, headers = {} }) {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const protocol = address.protocol ?? 'http:';
    const client = protocol === 'https:' ? import('node:https') : import('node:http');
    client.then(({ request: makeRequest }) => {
      const req = makeRequest({ hostname: address.address ?? '127.0.0.1', port: address.port, path, method, headers: { ...(payload === undefined ? {} : { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) }), ...headers } }, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let parsed = text;
          try { parsed = JSON.parse(text); } catch {}
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        });
      });
      req.on('error', reject);
      if (payload !== undefined) req.write(payload);
      req.end();
    }, reject);
  });
}

test('Human approval UI exchanges a one-time bootstrap token for a session and lists the configured network', async () => {
  const signer = createInMemoryHumanSigner({ human_id: 'human-1' });
  const server = createHumanApprovalUiServer({
    signer,
    network_id: 'network-1',
    bootstrap_token: 'bootstrap-1',
    upstream: {
      async connection() { return { schema: 'zj-loop.opn_connection_read_model.v1', network_id: 'network-1', status: 'connected', peers: [], side_effects_executed: false }; },
      async list() {
        return { requests: [{ request_id: 'request-1', status: 'pending', request_digest: 'a'.repeat(64), node_id: 'node-1', display_name: 'Workbuddy', agent_kind: 'workbuddy', endpoint: 'https://workbuddy.local', requested_capabilities: ['event.consume'], expires_at: '2026-07-30T01:00:00.000Z' }] };
      },
    },
    now: () => '2026-07-30T00:00:00.000Z',
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    const bootstrapped = await request({ address, path: '/ui/bootstrap?token=bootstrap-1' });
    assert.equal(bootstrapped.status, 302);
    assert.match(bootstrapped.headers['set-cookie'][0], /^zj_loop_ui_session=/);
    assert.equal(bootstrapped.headers.location, '/');
    const cookie = bootstrapped.headers['set-cookie'][0].split(';', 1)[0];
    const session = await request({ address, path: '/ui/session', headers: { cookie } });
    assert.equal(session.status, 200);
    assert.deepEqual(session.body.human, { human_id: 'human-1', algorithm: 'ECDSA-P256', public_key_fingerprint: (await signer.getPublicIdentity()).public_key_fingerprint });
    const listed = await request({ address, path: '/ui/pairing-requests', headers: { cookie } });
    assert.equal(listed.status, 200);
    assert.equal(listed.body.network_id, 'network-1');
    assert.equal(listed.body.requests[0].request_id, 'request-1');
    const connection = await request({ address, path: '/ui/connection', headers: { cookie } });
    assert.equal(connection.status, 200);
    assert.equal(connection.body.status, 'connected');
    const opnPage = await request({ address, path: '/ui/opn' });
    assert.equal(opnPage.status, 200);
    assert.match(opnPage.body, /设备协作状态/);
    const replay = await request({ address, path: '/ui/bootstrap?token=bootstrap-1' });
    assert.equal(replay.status, 403);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('Human approval UI signs and forwards one approval only after same-origin and digest checks', async () => {
  const signer = createInMemoryHumanSigner({ human_id: 'human-1' });
  const request = { request_id: 'request-1', status: 'pending', request_digest: 'a'.repeat(64), node_id: 'node-1', endpoint: 'https://workbuddy.local', requested_capabilities: ['event.consume', 'evidence.read'], expires_at: '2026-07-30T01:00:00.000Z' };
  const approvals = [];
  const server = createHumanApprovalUiServer({
    signer,
    network_id: 'network-1',
    human_device: { device_key_id: 'device-key-1', device_fingerprint: 'd'.repeat(64) },
    bootstrap_token: 'bootstrap-2',
    upstream: {
      async list() { return { requests: [request] }; },
      async approve(input) { approvals.push(input); return { status: 'recorded', lifecycle: { type: 'human-approved' } }; },
    },
    now: () => '2026-07-30T00:00:00.000Z',
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    const bootstrapped = await requestHttp({ address, path: '/ui/bootstrap?token=bootstrap-2' });
    const cookie = bootstrapped.headers['set-cookie'][0].split(';', 1)[0];
    const origin = `http://127.0.0.1:${address.port}`;
    const approved = await requestHttp({ address, path: '/ui/pairing-requests/request-1/approve', method: 'POST', headers: { cookie, origin }, body: { request_digest: request.request_digest, approved_capabilities: ['event.consume'] } });
    assert.equal(approved.status, 201);
    assert.equal(approvals.length, 1);
    const identity = await signer.getPublicIdentity();
    assert.equal(verifyHumanApprovalContext({ identity: { ...identity, schema: 'zj-loop.human_authority.v2' }, context: approvals[0].context, now: '2026-07-30T00:01:00.000Z', require_v2: true }), true);
    assert.equal(approvals[0].context.network_id, 'network-1');
    assert.equal(approvals[0].context.device_key_id, 'device-key-1');
    assert.equal(approvals[0].context.device_fingerprint, 'd'.repeat(64));
    assert.deepEqual(approvals[0].approved_capabilities, ['event.consume']);
    const badOrigin = await requestHttp({ address, path: '/ui/pairing-requests/request-1/approve', method: 'POST', headers: { cookie, origin: 'https://evil.example' }, body: { request_digest: request.request_digest, approved_capabilities: ['event.consume'] } });
    assert.equal(badOrigin.status, 403);
    const stale = await requestHttp({ address, path: '/ui/pairing-requests/request-1/approve', method: 'POST', headers: { cookie, origin }, body: { request_digest: 'b'.repeat(64), approved_capabilities: ['event.consume'] } });
    assert.equal(stale.status, 409);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('Human approval UI serves a usable static shell and records structured rejection', async () => {
  const signer = createInMemoryHumanSigner({ human_id: 'human-1' });
  const rejected = [];
  const server = createHumanApprovalUiServer({
    signer,
    network_id: 'network-1',
    bootstrap_token: 'bootstrap-3',
    upstream: {
      async list() { return { requests: [{ request_id: 'request-1', status: 'pending', request_digest: 'a'.repeat(64), node_id: 'node-1', requested_capabilities: ['event.consume'], expires_at: '2026-07-30T01:00:00.000Z' }] }; },
      async reject(input) { rejected.push(input); return { status: 'recorded' }; },
    },
    now: () => '2026-07-30T00:00:00.000Z',
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    const page = await requestHttp({ address, path: '/' });
    assert.equal(page.status, 200);
    assert.match(page.body, /Human Approval/);
    assert.match(page.body, /human-approval-ui\.js/);
    const bootstrapped = await requestHttp({ address, path: '/ui/bootstrap?token=bootstrap-3' });
    const cookie = bootstrapped.headers['set-cookie'][0].split(';', 1)[0];
    const assets = await requestHttp({ address, path: '/assets/human-approval-ui.js' });
    assert.equal(assets.status, 200);
    assert.match(assets.headers['content-type'], /javascript/);
    const origin = `http://127.0.0.1:${address.port}`;
    const response = await requestHttp({ address, path: '/ui/pairing-requests/request-1/reject', method: 'POST', headers: { cookie, origin }, body: { request_digest: 'a'.repeat(64), reason: 'endpoint-unexpected' } });
    assert.equal(response.status, 201);
    assert.equal(rejected[0].reason, 'endpoint-unexpected');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

async function requestHttp(options) {
  return request(options);
}
