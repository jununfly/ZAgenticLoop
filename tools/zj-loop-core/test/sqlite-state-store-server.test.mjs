import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { createStateStoreServer } from '../dist/sqlite-state-store-server.js';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';

async function serverCertificate(commonName = 'localhost') {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-state-server-'));
  const keyPath = path.join(root, 'private.pem');
  const certPath = path.join(root, 'certificate.pem');
  const san = commonName === 'localhost' ? 'subjectAltName=DNS:localhost,IP:127.0.0.1' : `subjectAltName=DNS:${commonName}`;
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyPath, '-out', certPath, '-subj', `/CN=${commonName}`, '-addext', san, '-days', '1'], { stdio: 'ignore' });
  return { root, key: await readFile(keyPath, 'utf8'), cert: await readFile(certPath, 'utf8') };
}

test('StateStore service exposes a pinned TLS health response without side effects', async () => {
  const material = await serverCertificate();
  const server = createStateStoreServer({ tls: material, store: null, credentialVerifier: null });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const response = await new Promise((resolve, reject) => {
    https.get({ hostname: '127.0.0.1', port: address.port, path: '/healthz', ca: material.cert, servername: 'localhost' }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, body: JSON.parse(body) }));
    }).on('error', reject);
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, { schema: 'zj-loop.state_store_http.v1', status: 'ok', side_effects_executed: false });
  await new Promise((resolve) => server.close(resolve));
  await rm(material.root, { recursive: true, force: true });
});

test('StateStore service rejects business routes without a client certificate', async () => {
  const material = await serverCertificate();
  const server = createStateStoreServer({ tls: material, store: null, credentialVerifier: null });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const response = await new Promise((resolve, reject) => {
    https.get({ hostname: '127.0.0.1', port: address.port, path: '/v1/networks/network-1/revision', ca: material.cert, servername: 'localhost' }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, body: JSON.parse(body) }));
    }).on('error', reject);
  });
  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.body, { schema: 'zj-loop.state_store_http.v1', status: 'blocked', reason: 'client-certificate-required', side_effects_executed: false });
  await new Promise((resolve) => server.close(resolve));
  await rm(material.root, { recursive: true, force: true });
});

test('StateStore service requires a bearer credential after mTLS authentication', async () => {
  const serverMaterial = await serverCertificate();
  const clientMaterial = await serverCertificate('workbuddy');
  const server = createStateStoreServer({ tls: { ...serverMaterial, ca: clientMaterial.cert }, store: null, credentialVerifier: null });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const response = await new Promise((resolve, reject) => {
    https.get({ hostname: '127.0.0.1', port: address.port, path: '/v1/networks/network-1/revision', ca: serverMaterial.cert, cert: clientMaterial.cert, key: clientMaterial.key, servername: 'localhost' }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, body: JSON.parse(body) }));
    }).on('error', reject);
  });
  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.body, { schema: 'zj-loop.state_store_http.v1', status: 'blocked', reason: 'credential-required', side_effects_executed: false });
  await new Promise((resolve) => server.close(resolve));
  await rm(serverMaterial.root, { recursive: true, force: true });
  await rm(clientMaterial.root, { recursive: true, force: true });
});

test('StateStore service delegates bearer validation and blocks an invalid credential', async () => {
  const serverMaterial = await serverCertificate();
  const clientMaterial = await serverCertificate('workbuddy');
  let observedNodeId = null;
  const server = createStateStoreServer({
    tls: { ...serverMaterial, ca: clientMaterial.cert },
    store: null,
    credentialVerifier: {
      verify: async (input) => {
        observedNodeId = input.node_id;
        assert.equal(input.token, 'bad-token');
        assert.equal(input.network_id, 'network-1');
        return { status: 'blocked', reason: 'credential-invalid' };
      },
    },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const response = await new Promise((resolve, reject) => {
    https.get({ hostname: '127.0.0.1', port: address.port, path: '/v1/networks/network-1/revision', ca: serverMaterial.cert, cert: clientMaterial.cert, key: clientMaterial.key, servername: 'localhost', headers: { authorization: 'Bearer bad-token' } }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, body: JSON.parse(body) }));
    }).on('error', reject);
  });
  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.body, { schema: 'zj-loop.state_store_http.v1', status: 'blocked', reason: 'credential-invalid', side_effects_executed: false });
  assert.match(observedNodeId, /^[0-9a-f]{64}$/);
  await new Promise((resolve) => server.close(resolve));
  await rm(serverMaterial.root, { recursive: true, force: true });
  await rm(clientMaterial.root, { recursive: true, force: true });
});

test('StateStore service returns a network revision after authenticated read authorization', async () => {
  const serverMaterial = await serverCertificate();
  const clientMaterial = await serverCertificate('workbuddy');
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-state-service-'));
  const store = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  await store.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2026-07-29T01:00:00.000Z' });
  const server = createStateStoreServer({
    tls: { ...serverMaterial, ca: clientMaterial.cert },
    store,
    credentialVerifier: { verify: () => ({ status: 'allowed' }) },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const response = await new Promise((resolve, reject) => {
    https.get({ hostname: '127.0.0.1', port: address.port, path: '/v1/networks/network-1/revision', ca: serverMaterial.cert, cert: clientMaterial.cert, key: clientMaterial.key, servername: 'localhost', headers: { authorization: 'Bearer valid-token' } }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, body: JSON.parse(body) }));
    }).on('error', reject);
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, { schema: 'zj-loop.state_store_http.v1', status: 'ok', network_id: 'network-1', revision: 1, side_effects_executed: false });
  await new Promise((resolve) => server.close(resolve));
  await store.close();
  await rm(root, { recursive: true, force: true });
  await rm(serverMaterial.root, { recursive: true, force: true });
  await rm(clientMaterial.root, { recursive: true, force: true });
});

test('StateStore network creation requires Human authority instead of an Agent credential', async () => {
  const serverMaterial = await serverCertificate();
  const clientMaterial = await serverCertificate('codex');
  const server = createStateStoreServer({ tls: { ...serverMaterial, ca: clientMaterial.cert }, store: null, credentialVerifier: null, humanAuthorityVerifier: null });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const response = await new Promise((resolve, reject) => {
    const request = https.request({ hostname: '127.0.0.1', port: address.port, path: '/v1/networks', method: 'POST', ca: serverMaterial.cert, cert: clientMaterial.cert, key: clientMaterial.key, servername: 'localhost', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength('{"network_id":"network-1"}') } }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, body: JSON.parse(body) }));
    });
    request.on('error', reject);
    request.end('{"network_id":"network-1"}');
  });
  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.body, { schema: 'zj-loop.state_store_http.v1', status: 'blocked', reason: 'human-context-required', side_effects_executed: false });
  await new Promise((resolve) => server.close(resolve));
  await rm(serverMaterial.root, { recursive: true, force: true });
  await rm(clientMaterial.root, { recursive: true, force: true });
});

test('StateStore creates a network from verified Human context without trusting body owner fields', async () => {
  const serverMaterial = await serverCertificate();
  const clientMaterial = await serverCertificate('codex');
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-state-service-'));
  const store = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  let observedBody;
  const server = createStateStoreServer({
    tls: { ...serverMaterial, ca: clientMaterial.cert },
    store,
    credentialVerifier: null,
    humanAuthorityVerifier: { verify: (input) => { observedBody = input.request_body; return { status: 'allowed', human_id: 'human-1' }; } },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const payload = JSON.stringify({ network_id: 'network-1' });
  const response = await new Promise((resolve, reject) => {
    const request = https.request({ hostname: '127.0.0.1', port: address.port, path: '/v1/networks', method: 'POST', ca: serverMaterial.cert, cert: clientMaterial.cert, key: clientMaterial.key, servername: 'localhost', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload), 'x-zj-loop-human-approval': 'human-context-1' } }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, body: JSON.parse(body) }));
    });
    request.on('error', reject);
    request.end(payload);
  });
  assert.equal(response.statusCode, 201);
  assert.deepEqual(response.body, { schema: 'zj-loop.state_store_http.v1', status: 'ok', network_id: 'network-1', owner_id: 'human-1', revision: 1, side_effects_executed: true });
  assert.deepEqual(observedBody, { network_id: 'network-1' });
  assert.equal(await store.getRevision('network-1'), 1);
  await new Promise((resolve) => server.close(resolve));
  await store.close();
  await rm(root, { recursive: true, force: true });
  await rm(serverMaterial.root, { recursive: true, force: true });
  await rm(clientMaterial.root, { recursive: true, force: true });
});
