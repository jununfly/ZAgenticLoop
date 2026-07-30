import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import {
  buildNodeIdentity,
  createPairingRequest,
  createPairingRequestProof,
} from '../dist/node-enrollment.js';
import { createInMemoryPairingRecordStore } from '../dist/pairing-record-store.js';
import { createPairingHttpServer } from '../dist/pairing-http-server.js';
import { createInMemoryHumanAuthorityProvider, verifyHumanApprovalContext } from '../dist/human-authority.js';

const OPENSSL_BIN = process.env.OPENSSL_BIN ?? (existsSync('/opt/homebrew/opt/openssl@3/bin/openssl') ? '/opt/homebrew/opt/openssl@3/bin/openssl' : 'openssl');

const supportsEd25519Certificates = (() => {
  try {
    const root = execFileSync('mktemp', ['-d'], { encoding: 'utf8' }).trim();
    const key = path.join(root, 'key.pem');
    const cert = path.join(root, 'cert.pem');
    execFileSync(OPENSSL_BIN, ['genpkey', '-algorithm', 'Ed25519', '-out', key], { stdio: 'ignore' });
    execFileSync(OPENSSL_BIN, ['req', '-x509', '-new', '-key', key, '-out', cert, '-subj', '/CN=probe', '-days', '1'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

async function certificate(commonName, ed25519 = false) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-pairing-http-'));
  const keyPath = path.join(root, 'key.pem');
  const certPath = path.join(root, 'cert.pem');
  if (ed25519) execFileSync(OPENSSL_BIN, ['genpkey', '-algorithm', 'Ed25519', '-out', keyPath], { stdio: 'ignore' });
  else execFileSync(OPENSSL_BIN, ['genrsa', '-out', keyPath, '2048'], { stdio: 'ignore' });
  execFileSync(OPENSSL_BIN, ['req', '-x509', '-new', '-key', keyPath, '-out', certPath, '-subj', `/CN=${commonName}`, '-days', '1'], { stdio: 'ignore' });
  return { root, key: await readFile(keyPath, 'utf8'), cert: await readFile(certPath, 'utf8') };
}

function request({ address, server, client, path: requestPath, method = 'GET', body, headers = {} }) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? '' : JSON.stringify(body);
    const req = https.request({ hostname: '127.0.0.1', port: address.port, path: requestPath, method, ca: server.cert, cert: client?.cert, key: client?.key, servername: 'localhost', headers: { ...(body === undefined ? {} : { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) }), ...headers } }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { text += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, body: text ? JSON.parse(text) : null }));
    });
    req.on('error', reject);
    req.end(payload);
  });
}

async function fixture(options = {}) {
  const serverMaterial = await certificate('localhost');
  const clientMaterial = await certificate('workbuddy', true);
  const identity = buildNodeIdentity({ certificate_pem: clientMaterial.cert, display_name: 'Workbuddy', agent_kind: 'workbuddy', agent_version: 'test' });
  const requestBody = createPairingRequest({ request_id: 'pair-1', network_id: 'network-1', identity, endpoint: 'loopback://127.0.0.1:43123', requested_capabilities: ['event.consume'], expires_at: '2026-07-29T04:00:00.000Z' });
  const proof = createPairingRequestProof({ request: requestBody, private_key_pem: clientMaterial.key });
  const server = createPairingHttpServer({ tls: { key: serverMaterial.key, cert: serverMaterial.cert, ca: clientMaterial.cert }, recordStore: createInMemoryPairingRecordStore(), now: () => '2026-07-29T03:00:00.000Z', ...options });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, address: server.address(), serverMaterial, clientMaterial, requestBody, proof };
}

async function close(fixtureValue) {
  await new Promise((resolve) => fixtureValue.server.close(resolve));
  await rm(fixtureValue.serverMaterial.root, { recursive: true, force: true });
  await rm(fixtureValue.clientMaterial.root, { recursive: true, force: true });
}

test('Pairing healthz is unauthenticated and readyz reflects injected dependency readiness', async () => {
  const serverMaterial = await certificate('localhost');
  const server = createPairingHttpServer({ tls: serverMaterial, recordStore: createInMemoryPairingRecordStore(), readinessCheck: { check: () => ({ status: 'not-ready', reason: 'state-store-unavailable' }) } });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const health = await request({ address, server: serverMaterial, path: '/healthz' });
  const ready = await request({ address, server: serverMaterial, path: '/readyz' });
  assert.equal(health.statusCode, 200);
  assert.deepEqual(health.body, { schema: 'zj-loop.pairing_http.v1', status: 'ok', side_effects_executed: false });
  assert.equal(ready.statusCode, 503);
  assert.deepEqual(ready.body, { schema: 'zj-loop.pairing_http.v1', status: 'not-ready', reason: 'state-store-unavailable', side_effects_executed: false });
  await new Promise((resolve) => server.close(resolve));
  await rm(serverMaterial.root, { recursive: true, force: true });
});

test('Pairing rejects business requests without a client certificate', async () => {
  const serverMaterial = await certificate('localhost');
  const server = createPairingHttpServer({ tls: serverMaterial, recordStore: createInMemoryPairingRecordStore() });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const response = await request({ address: server.address(), server: serverMaterial, path: '/v1/pairing-requests', method: 'POST', body: { request: {}, proof: {} } });
  assert.equal(response.statusCode, 401);
  assert.equal(response.body.reason, 'client-certificate-required');
  await new Promise((resolve) => server.close(resolve));
  await rm(serverMaterial.root, { recursive: true, force: true });
});

test('Pairing creates a request-scoped session after mTLS and proof-of-possession validation', { skip: !supportsEd25519Certificates }, async () => {
  const value = await fixture();
  const created = await request({ address: value.address, server: value.serverMaterial, client: value.clientMaterial, path: '/v1/pairing-requests', method: 'POST', body: { request: value.requestBody, proof: value.proof } });
  assert.equal(created.statusCode, 201);
  assert.equal(created.body.schema, 'zj-loop.pairing_http.v1');
  assert.equal(created.body.status, 'created');
  assert.equal(created.body.session.network_id, 'network-1');
  assert.equal(created.body.session.node_id, value.requestBody.node_id);
  assert.equal(created.body.session.status, 'pending');
  assert.match(created.body.session_token, /^[-_A-Za-z0-9]+$/);
  const status = await request({ address: value.address, server: value.serverMaterial, client: value.clientMaterial, path: `/v1/pairing-requests/${created.body.session.session_id}/status`, headers: { authorization: `Bearer ${created.body.session_token}` } });
  assert.equal(status.statusCode, 200);
  assert.equal(status.body.session.status, 'pending');
  assert.equal('session_token' in status.body, false);
  await close(value);
});

test('Pairing request retries return the same session and do not append another record', { skip: !supportsEd25519Certificates }, async () => {
  const value = await fixture();
  const first = await request({ address: value.address, server: value.serverMaterial, client: value.clientMaterial, path: '/v1/pairing-requests', method: 'POST', body: { request: value.requestBody, proof: value.proof } });
  const second = await request({ address: value.address, server: value.serverMaterial, client: value.clientMaterial, path: '/v1/pairing-requests', method: 'POST', body: { request: value.requestBody, proof: value.proof } });
  assert.equal(second.statusCode, 200);
  assert.equal(second.body.status, 'existing');
  assert.equal(second.body.session.session_id, first.body.session.session_id);
  assert.equal(second.body.session_token, first.body.session_token);
  assert.equal(second.body.side_effects_executed, false);
  await close(value);
});

test('Pairing blocks altered proof and expired requests before writing records', { skip: !supportsEd25519Certificates }, async () => {
  const value = await fixture();
  const altered = { ...value.proof, request_digest: '0'.repeat(64) };
  const badProof = await request({ address: value.address, server: value.serverMaterial, client: value.clientMaterial, path: '/v1/pairing-requests', method: 'POST', body: { request: value.requestBody, proof: altered } });
  assert.equal(badProof.statusCode, 400);
  assert.equal(badProof.body.reason, 'pairing-proof-invalid');
  const expiredRequest = { ...value.requestBody, request_id: 'pair-expired', expires_at: '2026-07-29T02:59:00.000Z' };
  const expiredProof = createPairingRequestProof({ request: expiredRequest, private_key_pem: value.clientMaterial.key });
  const expired = await request({ address: value.address, server: value.serverMaterial, client: value.clientMaterial, path: '/v1/pairing-requests', method: 'POST', body: { request: expiredRequest, proof: expiredProof } });
  assert.equal(expired.statusCode, 410);
  assert.equal(expired.body.reason, 'pairing-request-expired');
  await close(value);
});

test('Pairing session is bound to the client node and token', { skip: !supportsEd25519Certificates }, async () => {
  const value = await fixture();
  const created = await request({ address: value.address, server: value.serverMaterial, client: value.clientMaterial, path: '/v1/pairing-requests', method: 'POST', body: { request: value.requestBody, proof: value.proof } });
  const wrongToken = await request({ address: value.address, server: value.serverMaterial, client: value.clientMaterial, path: `/v1/pairing-requests/${created.body.session.session_id}/status`, headers: { authorization: 'Bearer wrong' } });
  assert.equal(wrongToken.statusCode, 401);
  assert.equal(wrongToken.body.reason, 'pairing-session-invalid');
  await close(value);
});

test('Pairing credential claim derives network and node from the authenticated session', { skip: !supportsEd25519Certificates }, async () => {
  let observed;
  let claimCount = 0;
  const value = await fixture({ credentialClaim: { claim: async (input) => { observed = input; claimCount += 1; return claimCount === 1 ? { status: 'claimed', credential_id: 'credential-1', claimed_at: '2026-07-29T03:01:00.000Z', token: 'opaque-token-value' } : { status: 'duplicate', credential_id: 'credential-1', claimed_at: '2026-07-29T03:01:00.000Z' }; } } });
  const created = await request({ address: value.address, server: value.serverMaterial, client: value.clientMaterial, path: '/v1/pairing-requests', method: 'POST', body: { request: value.requestBody, proof: value.proof } });
  const claimed = await request({ address: value.address, server: value.serverMaterial, client: value.clientMaterial, path: `/v1/pairing-requests/${value.requestBody.request_id}/credential/claim`, method: 'POST', body: {}, headers: { authorization: `Bearer ${created.body.session_token}` } });
  assert.equal(claimed.statusCode, 200);
  assert.equal(claimed.body.token, 'opaque-token-value');
  assert.deepEqual(observed, { request_id: value.requestBody.request_id, session_id: created.body.session.session_id, network_id: 'network-1', node_id: value.requestBody.node_id });
  const retry = await request({ address: value.address, server: value.serverMaterial, client: value.clientMaterial, path: `/v1/pairing-requests/${value.requestBody.request_id}/credential/claim`, method: 'POST', body: {}, headers: { authorization: `Bearer ${created.body.session_token}` } });
  assert.equal('token' in retry.body, false);
  await close(value);
});

test('Owner approval binds signed capabilities and is CAS-protected', async () => {
  const serverMaterial = await certificate('localhost');
  const store = createInMemoryPairingRecordStore();
  const record = { type: 'pairing-requested', event_id: 'pairing-requested:owner-pair-1', occurred_at: '2026-07-29T03:00:00.000Z', network_id: 'network-1', request_digest: 'a'.repeat(64), request: { request_id: 'owner-pair-1', network_id: 'network-1', node_id: 'node-1', endpoint: 'loopback://127.0.0.1:1', requested_capabilities: ['event.consume', 'evidence.write'], expires_at: '2026-07-29T04:00:00.000Z', identity: { certificate_sha256: 'b'.repeat(64) } } };
  await store.append(record);
  const authority = createInMemoryHumanAuthorityProvider({ human_id: 'human-1' });
  const server = createPairingHttpServer({ tls: serverMaterial, recordStore: store, now: () => '2026-07-29T03:10:00.000Z', ownerAuthenticator: { authenticate: ({ action, context }) => context && verifyHumanApprovalContext({ identity: authority.getPublicIdentity(), context, now: '2026-07-29T03:10:00.000Z' }) && context.action === action ? { status: 'allowed', human_id: 'human-1' } : { status: 'blocked', reason: 'owner-not-authorized' } } });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const context = await authority.signApprovalContext({ action: 'pairing.approve', request_id: 'owner-pair-1', request_digest: 'a'.repeat(64), approved_capabilities: ['event.consume'], issued_at: '2026-07-29T03:10:00.000Z', expires_at: '2026-07-29T03:20:00.000Z' });
  const body = { network_id: 'network-1', request_digest: 'a'.repeat(64), approved_capabilities: ['event.consume'], context };
  const first = await request({ address: server.address(), server: serverMaterial, path: '/v1/owner/pairing-requests/owner-pair-1/approve', method: 'POST', body });
  assert.equal(first.statusCode, 201, JSON.stringify(first.body));
  assert.equal(first.body.lifecycle.type, 'human-approved');
  const second = await request({ address: server.address(), server: serverMaterial, path: '/v1/owner/pairing-requests/owner-pair-1/approve', method: 'POST', body });
  assert.equal(second.statusCode, 200);
  assert.equal(second.body.status, 'existing');
  await new Promise((resolve) => server.close(resolve));
  await rm(serverMaterial.root, { recursive: true, force: true });
});
