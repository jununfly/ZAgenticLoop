import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { createLoopbackRelayServer } from '../dist/loopback-relay-server.js';

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
      response.on('end', () => resolve({ statusCode: response.statusCode, body: JSON.parse(text) }));
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
