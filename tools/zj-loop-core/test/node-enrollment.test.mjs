import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import tls from 'node:tls';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  approvePairingRequest,
  buildNodeIdentity,
  buildMutualTlsClientOptions,
  buildMutualTlsServerOptions,
  createPairingRequest,
  createInMemoryEnrollmentRecordStore,
  evaluateCapabilityGrant,
  projectEnrollment,
} from '../dist/node-enrollment.js';

async function certificate(commonName) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-node-'));
  const keyPath = path.join(root, 'private.pem');
  const certPath = path.join(root, 'certificate.pem');
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', keyPath, '-out', certPath,
    '-subj', `/CN=${commonName}`, '-days', '1',
  ], { stdio: 'ignore' });
  return { certificate_pem: await readFile(certPath, 'utf8'), private_key_pem: await readFile(keyPath, 'utf8') };
}

test('Human can approve a bounded pairing request for the same network and node', async () => {
  const material = await certificate('workbuddy');
  const identity = buildNodeIdentity({
    certificate_pem: material.certificate_pem,
    display_name: 'Workbuddy',
    agent_kind: 'workbuddy',
    agent_version: 'test',
  });
  const request = createPairingRequest({
    request_id: 'pair-1',
    network_id: 'network-1',
    identity,
    endpoint: 'loopback://127.0.0.1:43123',
    requested_capabilities: ['event.consume', 'evidence.write'],
    expires_at: '2026-07-29T00:10:00.000Z',
  });
  const approval = approvePairingRequest({
    request,
    human_id: 'human-1',
    approved_at: '2026-07-29T00:05:00.000Z',
    approved_capabilities: ['event.consume'],
  });
  assert.equal(approval.schema, 'zj-loop.pairing_approval.v1');
  assert.equal(approval.request_id, request.request_id);
  assert.equal(approval.network_id, request.network_id);
  assert.equal(approval.node_id, identity.node_id);
  assert.deepEqual(approval.approved_capabilities, ['event.consume']);
});

test('Human approval cannot grant capability outside the pairing request', async () => {
  const material = await certificate('workbuddy');
  const identity = buildNodeIdentity({ certificate_pem: material.certificate_pem, display_name: 'Workbuddy', agent_kind: 'workbuddy', agent_version: 'test' });
  const request = createPairingRequest({
    request_id: 'pair-2',
    network_id: 'network-1',
    identity,
    endpoint: 'loopback://127.0.0.1:43124',
    requested_capabilities: ['event.consume'],
    expires_at: '2026-07-29T00:10:00.000Z',
  });
  assert.throws(() => approvePairingRequest({
    request,
    human_id: 'human-1',
    approved_at: '2026-07-29T00:05:00.000Z',
    approved_capabilities: ['artifact.read'],
}), { message: 'pairing-capability-exceeded' });
});

test('expired pairing requests cannot be approved', async () => {
  const material = await certificate('workbuddy');
  const identity = buildNodeIdentity({ certificate_pem: material.certificate_pem, display_name: 'Workbuddy', agent_kind: 'workbuddy', agent_version: 'test' });
  const request = createPairingRequest({
    request_id: 'pair-3',
    network_id: 'network-1',
    identity,
    endpoint: 'loopback://127.0.0.1:43125',
    requested_capabilities: ['event.consume'],
    expires_at: '2026-07-29T00:10:00.000Z',
  });
  assert.throws(() => approvePairingRequest({
    request,
    human_id: 'human-1',
    approved_at: '2026-07-29T00:10:01.000Z',
    approved_capabilities: ['event.consume'],
}), { message: 'pairing-request-expired' });
});

test('StateStore enrollment adapter makes identical append retries idempotent', async () => {
  const store = createInMemoryEnrollmentRecordStore();
  const record = {
    schema: 'zj-loop.enrollment_record.v1',
    type: 'pairing-requested',
    event_id: 'evt-1',
    node_id: 'node-1',
    network_id: 'network-1',
    occurred_at: '2026-07-29T00:00:00.000Z',
  };
  const first = await store.append(record);
  const retry = await store.append({ ...record });
  assert.equal(first.status, 'recorded');
  assert.equal(retry.status, 'duplicate');
  assert.deepEqual(await store.list('network-1', 'node-1'), [record]);
});

test('StateStore enrollment adapter rejects conflicting reuse of an event id', async () => {
  const store = createInMemoryEnrollmentRecordStore();
  const record = {
    schema: 'zj-loop.enrollment_record.v1',
    type: 'pairing-requested',
    event_id: 'evt-2',
    node_id: 'node-1',
    network_id: 'network-1',
    occurred_at: '2026-07-29T00:00:00.000Z',
  };
  await store.append(record);
  await assert.rejects(() => store.append({ ...record, type: 'revoked' }), { message: 'enrollment-event-conflict' });
  assert.deepEqual(await store.list('network-1', 'node-1'), [record]);
});

test('builds an independent Node Identity from an X.509 certificate', async () => {
  const identity = buildNodeIdentity({
    certificate_pem: (await certificate('workbuddy')).certificate_pem,
    display_name: 'Workbuddy',
    agent_kind: 'workbuddy',
    agent_version: 'test',
  });
  assert.equal(identity.schema, 'zj-loop.node_identity.v1');
  assert.match(identity.node_id, /^[0-9a-f]{64}$/);
  assert.equal(identity.certificate_sha256, identity.node_id);
  assert.equal(identity.display_name, 'Workbuddy');
});

test('projects append-only enrollment and revocation without deleting history', async () => {
  const identity = buildNodeIdentity({
    certificate_pem: (await certificate('codex')).certificate_pem,
    display_name: 'Codex',
    agent_kind: 'codex',
    agent_version: 'test',
  });
  const events = [
    { type: 'identity-generated', event_id: 'evt-1', node_id: identity.node_id, occurred_at: '2026-07-29T00:00:00.000Z' },
    { type: 'pairing-requested', event_id: 'evt-2', node_id: identity.node_id, occurred_at: '2026-07-29T00:00:01.000Z' },
    { type: 'human-approved', event_id: 'evt-3', node_id: identity.node_id, occurred_at: '2026-07-29T00:00:02.000Z' },
    { type: 'capability-ceiling-granted', event_id: 'evt-4', node_id: identity.node_id, occurred_at: '2026-07-29T00:00:03.000Z', capabilities: ['event.consume'] },
    { type: 'revoked', event_id: 'evt-5', node_id: identity.node_id, occurred_at: '2026-07-29T00:00:04.000Z' },
  ];
  const projection = projectEnrollment({ identity, events });
  assert.equal(projection.status, 'revoked');
  assert.deepEqual(projection.capability_ceiling, ['event.consume']);
  assert.equal(projection.events.length, 5);
});

test('capability grants require approval, non-revocation, and ceiling intersection', async () => {
  const identity = buildNodeIdentity({
    certificate_pem: (await certificate('codex')).certificate_pem,
    display_name: 'Codex',
    agent_kind: 'codex',
    agent_version: 'test',
  });
  const base = projectEnrollment({
    identity,
    events: [
      { type: 'human-approved', event_id: 'evt-1', node_id: identity.node_id, occurred_at: '2026-07-29T00:00:00.000Z' },
      { type: 'capability-ceiling-granted', event_id: 'evt-2', node_id: identity.node_id, occurred_at: '2026-07-29T00:00:01.000Z', capabilities: ['event.consume', 'evidence.write'] },
    ],
  });
  const allowed = evaluateCapabilityGrant(base, { node_id: identity.node_id, event_id: 'event-1', task_id: 'task-1', capabilities: ['event.consume'] });
  assert.equal(allowed.status, 'allowed');
  const overGrant = evaluateCapabilityGrant(base, { node_id: identity.node_id, event_id: 'event-1', task_id: 'task-1', capabilities: ['artifact.read'] });
  assert.equal(overGrant.status, 'blocked');
  assert.equal(overGrant.reason, 'capability-ceiling-exceeded');
});

test('performs a loopback mutual TLS handshake between independent identities', async () => {
  const serverMaterial = await certificate('codex');
  const clientMaterial = await certificate('workbuddy');
  const serverIdentity = buildNodeIdentity({ certificate_pem: serverMaterial.certificate_pem, display_name: 'Codex', agent_kind: 'codex', agent_version: 'test' });
  const clientIdentity = buildNodeIdentity({ certificate_pem: clientMaterial.certificate_pem, display_name: 'Workbuddy', agent_kind: 'workbuddy', agent_version: 'test' });
  const server = tls.createServer(buildMutualTlsServerOptions({ identity: serverIdentity, private_key_pem: serverMaterial.private_key_pem, trusted_certificates_pem: [clientIdentity.certificate_pem] }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const connection = new Promise((resolve, reject) => {
    server.once('secureConnection', (socket) => resolve(socket.getPeerCertificate().subject.CN));
    server.once('tlsClientError', reject);
  });
  const client = tls.connect(buildMutualTlsClientOptions({
    host: '127.0.0.1',
    port: address.port,
    identity: clientIdentity,
    private_key_pem: clientMaterial.private_key_pem,
    trusted_certificates_pem: [serverIdentity.certificate_pem],
    server_name: 'codex',
  }));
  await new Promise((resolve, reject) => { client.once('secureConnect', resolve); client.once('error', reject); });
  assert.equal(await connection, 'workbuddy');
  client.destroy();
  await new Promise((resolve) => server.close(resolve));
});
