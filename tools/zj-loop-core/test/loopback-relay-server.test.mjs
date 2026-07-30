import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, X509Certificate } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { createLoopbackRelayServer } from '../dist/loopback-relay-server.js';
import { createSqliteCredentialVerifier } from '../dist/sqlite-credential-verifier.js';

async function certificate(commonName = 'localhost') {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-relay-'));
  const keyPath = path.join(root, 'key.pem');
  const certPath = path.join(root, 'cert.pem');
  const san = commonName === 'localhost' ? 'subjectAltName=DNS:localhost,IP:127.0.0.1' : `subjectAltName=DNS:${commonName}`;
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyPath, '-out', certPath, '-subj', `/CN=${commonName}`, '-addext', san, '-days', '1'], { stdio: 'ignore' });
  return { root, key: await readFile(keyPath, 'utf8'), cert: await readFile(certPath, 'utf8') };
}

function request({ address, server, client, body, headers = {} }) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const request = https.request({ hostname: '127.0.0.1', port: address.port, path: '/v1/sessions', method: 'POST', ca: server.cert, cert: client.cert, key: client.key, servername: 'localhost', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload), ...headers } }, (response) => {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { text += chunk; });
      response.on('end', () => resolve({ statusCode: response.statusCode, body: text ? JSON.parse(text) : null }));
    });
    request.on('error', reject);
    request.end(payload);
  });
}

function requestPath({ address, server, client, path: requestPathValue, method = 'GET', body, headers = {} }) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? '' : JSON.stringify(body);
    const request = https.request({ hostname: '127.0.0.1', port: address.port, path: requestPathValue, method, ca: server.cert, cert: client.cert, key: client.key, servername: 'localhost', headers: { ...(body === undefined ? {} : { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) }), ...headers } }, (response) => {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { text += chunk; });
      response.on('end', () => resolve({ statusCode: response.statusCode, body: text ? JSON.parse(text) : null }));
    });
    request.on('error', reject);
    request.end(payload);
  });
}

test('Relay creates a bounded session after mTLS and credential authorization', async () => {
  const serverMaterial = await certificate();
  const clientMaterial = await certificate('workbuddy');
  const server = createLoopbackRelayServer({
    tls: { ...serverMaterial, ca: clientMaterial.cert },
    sessionVerifier: { verify: (input) => { assert.equal(input.token, 'session-token'); assert.equal(input.network_id, 'network-1'); assert.equal(input.protocol_version, 'relay.v1'); return { status: 'allowed', credential_id: 'credential-1', expires_at: '2026-07-29T03:10:00.000Z' }; } },
    now: () => '2026-07-29T03:00:00.000Z',
    session_ttl_ms: 15 * 60 * 1000,
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const response = await request({ address: server.address(), server: serverMaterial, client: clientMaterial, body: { network_id: 'network-1', protocol_version: 'relay.v1' }, headers: { authorization: 'Bearer session-token' } });
  assert.equal(response.statusCode, 201);
  assert.equal(response.body.schema, 'zj-loop.relay_http.v1');
  assert.equal(response.body.status, 'created');
  assert.equal(response.body.session.network_id, 'network-1');
  assert.equal(response.body.session.credential_id, 'credential-1');
  assert.equal(response.body.session.expires_at, '2026-07-29T03:10:00.000Z');
  await new Promise((resolve) => server.close(resolve));
  await rm(serverMaterial.root, { recursive: true, force: true });
  await rm(clientMaterial.root, { recursive: true, force: true });
});

test('Relay creates a dispatch-bound session once and rejects a conflicting retry', async () => {
  const serverMaterial = await certificate();
  const clientMaterial = await certificate('workbuddy');
  const intentDigest = `sha256:${'a'.repeat(64)}`;
  let verifierCalls = 0;
  const server = createLoopbackRelayServer({
    tls: { ...serverMaterial, ca: clientMaterial.cert },
    sessionVerifier: { verify: () => { verifierCalls += 1; return { status: 'allowed', credential_id: 'credential-1', expires_at: '2026-07-29T03:10:00.000Z' }; } },
    now: () => '2026-07-29T03:00:00.000Z',
    session_ttl_ms: 15 * 60 * 1000,
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const body = { dispatch_event_id: 'dispatch-event-1', intent_digest: intentDigest, network_id: 'network-1', protocol_version: 'relay.v1', session_request_id: 'session-request-1' };
  const created = await request({ address, server: serverMaterial, client: clientMaterial, body, headers: { authorization: 'Bearer session-token' } });
  const duplicate = await request({ address, server: serverMaterial, client: clientMaterial, body, headers: { authorization: 'Bearer session-token' } });
  const conflict = await request({ address, server: serverMaterial, client: clientMaterial, body: { ...body, intent_digest: `sha256:${'b'.repeat(64)}` }, headers: { authorization: 'Bearer session-token' } });
  assert.equal(created.statusCode, 201);
  assert.equal(created.body.status, 'created');
  assert.equal(created.body.session.session_request_id, 'session-request-1');
  assert.equal(created.body.session.dispatch_event_id, 'dispatch-event-1');
  assert.equal(created.body.session.intent_digest, intentDigest);
  assert.equal(duplicate.statusCode, 200);
  assert.equal(duplicate.body.status, 'duplicate');
  assert.deepEqual(duplicate.body.session, created.body.session);
  assert.equal(conflict.statusCode, 409);
  assert.deepEqual(conflict.body, { schema: 'zj-loop.relay_http.v1', status: 'blocked', reason: 'session-request-conflict', side_effects_executed: false });
  assert.equal(verifierCalls, 3);
  await new Promise((resolve) => server.close(resolve));
  await rm(serverMaterial.root, { recursive: true, force: true });
  await rm(clientMaterial.root, { recursive: true, force: true });
});

test('Relay creates a session from the real SQLite credential verifier', async () => {
  const serverMaterial = await certificate();
  const clientMaterial = await certificate('workbuddy');
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-relay-credential-'));
  const credentialStore = createSqliteCredentialVerifier({ filename: path.join(root, 'credentials.db'), now: () => '2026-07-29T03:00:00.000Z' });
  const nodeId = createHash('sha256').update(new X509Certificate(clientMaterial.cert).raw).digest('hex');
  const issued = await credentialStore.issueCredential({ credential: { schema: 'zj-loop.scoped_credential.v1', credential_id: 'credential-1', issuer: 'state-store', network_id: 'network-1', node_id: nodeId, event_id: 'event-1', task_id: 'task-1', capabilities: ['event.consume'], issued_at: '2026-07-29T02:00:00.000Z', expires_at: '2026-07-29T04:00:00.000Z' } });
  const server = createLoopbackRelayServer({ tls: { ...serverMaterial, ca: clientMaterial.cert }, sessionVerifier: credentialStore, now: () => '2026-07-29T03:00:00.000Z', session_ttl_ms: 15 * 60 * 1000 });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const response = await request({ address: server.address(), server: serverMaterial, client: clientMaterial, body: { network_id: 'network-1', protocol_version: 'relay.v1' }, headers: { authorization: `Bearer ${issued.token}` } });

  assert.equal(response.statusCode, 201, JSON.stringify(response.body));
  assert.equal(response.body.session.credential_id, 'credential-1');
  assert.equal(response.body.session.node_id, nodeId);
  await new Promise((resolve) => server.close(resolve));
  await credentialStore.close();
  await rm(serverMaterial.root, { recursive: true, force: true });
  await rm(clientMaterial.root, { recursive: true, force: true });
  await rm(root, { recursive: true, force: true });
});

test('Relay healthz is unauthenticated and contains no network or credential state', async () => {
  const serverMaterial = await certificate();
  const server = createLoopbackRelayServer({ tls: serverMaterial, sessionVerifier: null, now: () => '2026-07-29T03:00:00.000Z', session_ttl_ms: 15 * 60 * 1000 });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const response = await new Promise((resolve, reject) => {
    https.get({ hostname: '127.0.0.1', port: server.address().port, path: '/healthz', ca: serverMaterial.cert, servername: 'localhost' }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { text += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, body: JSON.parse(text) }));
    }).on('error', reject);
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, { schema: 'zj-loop.relay_http.v1', status: 'ok', side_effects_executed: false });
  await new Promise((resolve) => server.close(resolve));
  await rm(serverMaterial.root, { recursive: true, force: true });
});

test('Relay blocks a rejected session credential before creating a session', async () => {
  const serverMaterial = await certificate();
  const clientMaterial = await certificate('codex');
  let verifierCalls = 0;
  const server = createLoopbackRelayServer({
    tls: { ...serverMaterial, ca: clientMaterial.cert },
    sessionVerifier: { verify: () => { verifierCalls += 1; return { status: 'blocked', reason: 'credential-revoked' }; } },
    now: () => '2026-07-29T03:00:00.000Z',
    session_ttl_ms: 15 * 60 * 1000,
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const response = await request({ address: server.address(), server: serverMaterial, client: clientMaterial, body: { network_id: 'network-1', protocol_version: 'relay.v1' }, headers: { authorization: 'Bearer revoked-token' } });
  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.body, { schema: 'zj-loop.relay_http.v1', status: 'blocked', reason: 'credential-revoked', side_effects_executed: false });
  assert.equal(verifierCalls, 1);
  await new Promise((resolve) => server.close(resolve));
  await rm(serverMaterial.root, { recursive: true, force: true });
  await rm(clientMaterial.root, { recursive: true, force: true });
});

test('Relay rejects an unsupported protocol before credential verification', async () => {
  const serverMaterial = await certificate();
  const clientMaterial = await certificate('workbuddy');
  let verifierCalls = 0;
  const server = createLoopbackRelayServer({
    tls: { ...serverMaterial, ca: clientMaterial.cert },
    sessionVerifier: { verify: () => { verifierCalls += 1; return { status: 'allowed', credential_id: 'credential-1', expires_at: '2026-07-29T03:10:00.000Z' }; } },
    now: () => '2026-07-29T03:00:00.000Z',
    session_ttl_ms: 15 * 60 * 1000,
    supported_protocol_version: 'relay.v1',
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const response = await request({ address: server.address(), server: serverMaterial, client: clientMaterial, body: { network_id: 'network-1', protocol_version: 'relay.v2' }, headers: { authorization: 'Bearer token' } });
  assert.equal(response.statusCode, 426);
  assert.deepEqual(response.body, { schema: 'zj-loop.relay_http.v1', status: 'blocked', reason: 'protocol-version-unsupported', side_effects_executed: false });
  assert.equal(verifierCalls, 0);
  await new Promise((resolve) => server.close(resolve));
  await rm(serverMaterial.root, { recursive: true, force: true });
  await rm(clientMaterial.root, { recursive: true, force: true });
});

test('Relay exposes non-sensitive status for the authenticated session owner', async () => {
  const serverMaterial = await certificate();
  const clientMaterial = await certificate('workbuddy');
  const server = createLoopbackRelayServer({
    tls: { ...serverMaterial, ca: clientMaterial.cert },
    sessionVerifier: { verify: () => ({ status: 'allowed', credential_id: 'credential-1', expires_at: '2026-07-29T03:10:00.000Z' }) },
    now: () => '2026-07-29T03:00:00.000Z',
    session_ttl_ms: 15 * 60 * 1000,
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const created = await request({ address, server: serverMaterial, client: clientMaterial, body: { network_id: 'network-1', protocol_version: 'relay.v1' }, headers: { authorization: 'Bearer session-token' } });
  const status = await requestPath({ address, server: serverMaterial, client: clientMaterial, path: `/v1/sessions/${created.body.session.session_id}/status`, headers: { authorization: 'Bearer session-token' } });
  assert.equal(status.statusCode, 200);
  assert.equal(status.body.schema, 'zj-loop.relay_http.v1');
  assert.equal(status.body.status, 'ok');
  assert.deepEqual(status.body.session, { session_id: created.body.session.session_id, network_id: 'network-1', node_id: created.body.session.node_id, protocol_version: 'relay.v1', status: 'active' });
  assert.equal('credential_id' in status.body.session, false);
  assert.equal('token' in status.body.session, false);
  await new Promise((resolve) => server.close(resolve));
  await rm(serverMaterial.root, { recursive: true, force: true });
  await rm(clientMaterial.root, { recursive: true, force: true });
});

test('Relay closes an authenticated session without changing business state', async () => {
  const serverMaterial = await certificate();
  const clientMaterial = await certificate('codex');
  const server = createLoopbackRelayServer({
    tls: { ...serverMaterial, ca: clientMaterial.cert },
    sessionVerifier: { verify: () => ({ status: 'allowed', credential_id: 'credential-1', expires_at: '2026-07-29T03:10:00.000Z' }) },
    now: () => '2026-07-29T03:00:00.000Z',
    session_ttl_ms: 15 * 60 * 1000,
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const created = await request({ address, server: serverMaterial, client: clientMaterial, body: { network_id: 'network-1', protocol_version: 'relay.v1' }, headers: { authorization: 'Bearer session-token' } });
  const closed = await requestPath({ address, server: serverMaterial, client: clientMaterial, path: `/v1/sessions/${created.body.session.session_id}`, method: 'DELETE', headers: { authorization: 'Bearer session-token' } });
  assert.equal(closed.statusCode, 204);
  assert.equal(closed.body, null);
  const status = await requestPath({ address, server: serverMaterial, client: clientMaterial, path: `/v1/sessions/${created.body.session.session_id}/status`, headers: { authorization: 'Bearer session-token' } });
  assert.equal(status.statusCode, 200);
  assert.equal(status.body.session.status, 'closed');
  await new Promise((resolve) => server.close(resolve));
  await rm(serverMaterial.root, { recursive: true, force: true });
  await rm(clientMaterial.root, { recursive: true, force: true });
});

test('Relay long-poll returns an empty result when no authorized delivery is available', async () => {
  const serverMaterial = await certificate();
  const clientMaterial = await certificate('workbuddy');
  let resolverInput;
  const server = createLoopbackRelayServer({
    tls: { ...serverMaterial, ca: clientMaterial.cert },
    sessionVerifier: { verify: () => ({ status: 'allowed', credential_id: 'credential-1', expires_at: '2026-07-29T03:10:00.000Z' }) },
    deliveryResolver: { findNext: (input) => { resolverInput = input; return null; } },
    now: () => '2026-07-29T03:00:00.000Z',
    session_ttl_ms: 15 * 60 * 1000,
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const created = await request({ address, server: serverMaterial, client: clientMaterial, body: { network_id: 'network-1', protocol_version: 'relay.v1' }, headers: { authorization: 'Bearer session-token' } });
  const response = await requestPath({ address, server: serverMaterial, client: clientMaterial, path: `/v1/sessions/${created.body.session.session_id}/deliveries?after_revision=7`, headers: { authorization: 'Bearer session-token' } });
  assert.equal(response.statusCode, 204);
  assert.equal(response.body, null);
  assert.deepEqual(resolverInput, { network_id: 'network-1', node_id: created.body.session.node_id, after_revision: 7 });
  await new Promise((resolve) => server.close(resolve));
  await rm(serverMaterial.root, { recursive: true, force: true });
  await rm(clientMaterial.root, { recursive: true, force: true });
});

test('Relay long-poll returns the resolver delivery envelope without business payload', async () => {
  const serverMaterial = await certificate();
  const clientMaterial = await certificate('workbuddy');
  const delivery = { delivery_id: 'delivery-1', attempt_id: 'attempt-1', network_id: 'network-1', event_id: 'event-1', task_id: 'task-1', target_node_id: 'node-1', revision: 8, envelope_sha256: 'hash-1', artifact_refs: [] };
  const server = createLoopbackRelayServer({
    tls: { ...serverMaterial, ca: clientMaterial.cert },
    sessionVerifier: { verify: () => ({ status: 'allowed', credential_id: 'credential-1', expires_at: '2026-07-29T03:10:00.000Z' }) },
    deliveryResolver: { findNext: () => delivery },
    now: () => '2026-07-29T03:00:00.000Z',
    session_ttl_ms: 15 * 60 * 1000,
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const created = await request({ address, server: serverMaterial, client: clientMaterial, body: { network_id: 'network-1', protocol_version: 'relay.v1' }, headers: { authorization: 'Bearer session-token' } });
  const response = await requestPath({ address, server: serverMaterial, client: clientMaterial, path: `/v1/sessions/${created.body.session.session_id}/deliveries?after_revision=7`, headers: { authorization: 'Bearer session-token' } });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.schema, 'zj-loop.relay_http.v1');
  assert.equal(response.body.status, 'delivery-available');
  assert.deepEqual(response.body.delivery, delivery);
  assert.equal('payload' in response.body.delivery, false);
  await new Promise((resolve) => server.close(resolve));
  await rm(serverMaterial.root, { recursive: true, force: true });
  await rm(clientMaterial.root, { recursive: true, force: true });
});

test('Relay acknowledges a delivery through the injected transport handler', async () => {
  const serverMaterial = await certificate();
  const clientMaterial = await certificate('workbuddy');
  let ackInput;
  const server = createLoopbackRelayServer({
    tls: { ...serverMaterial, ca: clientMaterial.cert },
    sessionVerifier: { verify: () => ({ status: 'allowed', credential_id: 'credential-1', expires_at: '2026-07-29T03:10:00.000Z' }) },
    deliveryAcknowledger: { acknowledge: (input) => { ackInput = input; return { status: 'acknowledged', delivery_id: input.delivery_id, attempt_id: input.attempt_id }; } },
    now: () => '2026-07-29T03:00:00.000Z',
    session_ttl_ms: 15 * 60 * 1000,
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const created = await request({ address, server: serverMaterial, client: clientMaterial, body: { network_id: 'network-1', protocol_version: 'relay.v1' }, headers: { authorization: 'Bearer session-token' } });
  const response = await requestPath({ address, server: serverMaterial, client: clientMaterial, path: `/v1/sessions/${created.body.session.session_id}/deliveries/delivery-1/ack`, method: 'POST', body: { attempt_id: 'attempt-1' }, headers: { authorization: 'Bearer session-token' } });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, { schema: 'zj-loop.relay_http.v1', status: 'delivery-acknowledged', delivery: { status: 'acknowledged', delivery_id: 'delivery-1', attempt_id: 'attempt-1' }, side_effects_executed: true });
  assert.deepEqual(ackInput, { network_id: 'network-1', node_id: created.body.session.node_id, delivery_id: 'delivery-1', attempt_id: 'attempt-1' });
  await new Promise((resolve) => server.close(resolve));
  await rm(serverMaterial.root, { recursive: true, force: true });
  await rm(clientMaterial.root, { recursive: true, force: true });
});

test('Relay maps an expired delivery lease to a transport recovery response', async () => {
  const serverMaterial = await certificate();
  const clientMaterial = await certificate('workbuddy');
  let handlerCalls = 0;
  const server = createLoopbackRelayServer({
    tls: { ...serverMaterial, ca: clientMaterial.cert },
    sessionVerifier: { verify: () => ({ status: 'allowed', credential_id: 'credential-1', expires_at: '2026-07-29T03:10:00.000Z' }) },
    deliveryAcknowledger: { acknowledge: () => { handlerCalls += 1; throw new Error('delivery-lease-expired'); } },
    now: () => '2026-07-29T03:00:00.000Z',
    session_ttl_ms: 15 * 60 * 1000,
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const created = await request({ address, server: serverMaterial, client: clientMaterial, body: { network_id: 'network-1', protocol_version: 'relay.v1' }, headers: { authorization: 'Bearer session-token' } });
  const response = await requestPath({ address, server: serverMaterial, client: clientMaterial, path: `/v1/sessions/${created.body.session.session_id}/deliveries/delivery-1/ack`, method: 'POST', body: { attempt_id: 'attempt-1' }, headers: { authorization: 'Bearer session-token' } });
  assert.equal(response.statusCode, 410);
  assert.deepEqual(response.body, { schema: 'zj-loop.relay_http.v1', status: 'blocked', reason: 'delivery-lease-expired', side_effects_executed: false });
  assert.equal(handlerCalls, 1);
  await new Promise((resolve) => server.close(resolve));
  await rm(serverMaterial.root, { recursive: true, force: true });
  await rm(clientMaterial.root, { recursive: true, force: true });
});

test('Relay readyz reports dependency readiness without exposing canonical state', async () => {
  const serverMaterial = await certificate();
  const server = createLoopbackRelayServer({
    tls: serverMaterial,
    sessionVerifier: null,
    readinessCheck: { check: () => ({ status: 'not-ready', reason: 'state-store-unavailable' }) },
    now: () => '2026-07-29T03:00:00.000Z',
    session_ttl_ms: 15 * 60 * 1000,
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const response = await new Promise((resolve, reject) => {
    https.get({ hostname: '127.0.0.1', port: server.address().port, path: '/readyz', ca: serverMaterial.cert, servername: 'localhost' }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { text += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, body: JSON.parse(text) }));
    }).on('error', reject);
  });
  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.body, { schema: 'zj-loop.relay_http.v1', status: 'not-ready', reason: 'state-store-unavailable', side_effects_executed: false });
  assert.equal('network_id' in response.body, false);
  assert.equal('revision' in response.body, false);
  await new Promise((resolve) => server.close(resolve));
  await rm(serverMaterial.root, { recursive: true, force: true });
});
