import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, X509Certificate } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createOpnTransportHttpService } from '../dist/opn-transport-http-server.js';
import { createPairingHttpServer } from '../dist/pairing-http-server.js';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';
import { createTlsTransportAdapter } from '../dist/tls-transport-adapter.js';
import { createTransportEnvelope } from '../dist/transport-contract.js';

const openssl = process.env.OPENSSL_BIN ?? 'openssl';
const digest = (digit) => `sha256:${digit.repeat(64)}`;

async function certificate(root, name, san) {
  const key = path.join(root, `${name}.key.pem`);
  const cert = path.join(root, `${name}.cert.pem`);
  execFileSync(openssl, ['ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', key]);
  execFileSync(openssl, ['req', '-x509', '-new', '-key', key, '-out', cert, '-subj', `/CN=${name}`, ...(san ? ['-addext', `subjectAltName=${san}`] : []), '-days', '1']);
  return { key: await readFile(key, 'utf8'), cert: await readFile(cert, 'utf8') };
}

test('real mTLS TransportAdapter send/receive/ack is backed by StateStore facts', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-opn-transport-http-'));
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  await stateStore.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2026-08-07T12:00:00.000Z' });
  const serverMaterial = await certificate(root, 'server', 'DNS:localhost,IP:127.0.0.1');
  const senderMaterial = await certificate(root, 'sender');
  const receiverMaterial = await certificate(root, 'receiver');
  const senderNodeId = createHash('sha256').update(new X509Certificate(senderMaterial.cert).raw).digest('hex');
  const receiverNodeId = createHash('sha256').update(new X509Certificate(receiverMaterial.cert).raw).digest('hex');
  const transport = createOpnTransportHttpService({
    network_id: 'network-1',
    stateStore,
    credentialVerifier: { verify: async () => ({ status: 'allowed', credential_id: 'credential-1', expires_at: '2026-08-07T13:00:00.000Z' }) },
    now: () => '2026-08-07T12:01:00.000Z',
  });
  const server = createPairingHttpServer({ tls: { key: serverMaterial.key, cert: serverMaterial.cert, ca: `${senderMaterial.cert}${receiverMaterial.cert}` }, recordStore: { append: async () => ({ status: 'recorded', record: {} }), list: async () => [], appendIfPending: async () => ({ status: 'recorded', record: {} }) }, transport });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const sender = createTlsTransportAdapter({ endpoint: `https://localhost:${server.address().port}`, ca: serverMaterial.cert, cert: senderMaterial.cert, key: senderMaterial.key, bearer_token: 'credential-1' });
    const receiver = createTlsTransportAdapter({ endpoint: `https://localhost:${server.address().port}`, ca: serverMaterial.cert, cert: receiverMaterial.cert, key: receiverMaterial.key, bearer_token: 'credential-1' });
    const senderSession = await sender.openSession({ network_id: 'network-1', node_id: senderNodeId });
    const receiverSession = await receiver.openSession({ network_id: 'network-1', node_id: receiverNodeId });
    const targetEnvelope = createTransportEnvelope({ message_id: 'message-1', network_id: 'network-1', event_id: 'event-1', plan_id: 'plan-1', plan_revision: 1, task_id: 'task-1', from_node_id: senderNodeId, target_node_id: receiverNodeId, notification_kind: 'evidence-available', state: 'available', artifact_refs: [{ artifact_id: digest('a'), content_sha256: digest('b'), kind: 'evidence' }], created_at: '2026-08-07T12:01:00.000Z', expires_at: '2026-08-07T12:30:00.000Z' });
    assert.equal((await sender.send({ session_id: senderSession.session_id, envelope: targetEnvelope })).status, 'accepted');
    assert.deepEqual(await receiver.receive({ session_id: receiverSession.session_id }), targetEnvelope);
    assert.equal((await receiver.acknowledge({ session_id: receiverSession.session_id, message_id: targetEnvelope.message_id, envelope_digest: targetEnvelope.envelope_digest })).status, 'accepted');
    assert.equal(await receiver.receive({ session_id: receiverSession.session_id }), null);
    const events = await stateStore.readEvents({ network_id: 'network-1', aggregate_type: 'opn-transport-message', aggregate_id: targetEnvelope.message_id });
    assert.deepEqual(events.events.map((event) => event.event_type), ['opn.transport.message.offered', 'opn.transport.message.acknowledged']);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await stateStore.close();
    await rm(root, { recursive: true, force: true });
  }
});
