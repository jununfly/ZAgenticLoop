import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:https';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createTlsTransportAdapter } from '../dist/tls-transport-adapter.js';
import { createTransportEnvelope } from '../dist/transport-contract.js';

const openssl = process.env.OPENSSL_BIN ?? 'openssl';

async function certificate(commonName, san, caCert) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-opn-three-node-'));
  const key = path.join(root, 'key.pem');
  const cert = path.join(root, 'cert.pem');
  execFileSync(openssl, ['ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', key], { stdio: 'ignore' });
  const args = ['req', '-x509', '-new', '-key', key, '-out', cert, '-subj', `/CN=${commonName}`, '-addext', `subjectAltName=${san}`, '-days', '1'];
  if (caCert) args.push('-CA', caCert);
  execFileSync(openssl, args, { stdio: 'ignore' });
  return { root, key: await readFile(key, 'utf8'), cert: await readFile(cert, 'utf8') };
}

async function targetServer(serverMaterial, centerMaterial, nodeId) {
  const received = [];
  const server = createServer({ key: serverMaterial.key, cert: serverMaterial.cert, ca: centerMaterial.cert, requestCert: true, rejectUnauthorized: true, minVersion: 'TLSv1.3' }, async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    response.setHeader('content-type', 'application/json');
    if (request.method === 'POST' && request.url === '/v1/transport/sessions') {
      response.statusCode = 201;
      response.end(JSON.stringify({ status: 'created', session: { session_id: `${nodeId}-session` }, side_effects_executed: false }));
      return;
    }
    if (request.method === 'POST' && request.url === `/v1/transport/sessions/${nodeId}-session/envelopes`) {
      const envelope = JSON.parse(body);
      received.push(envelope);
      response.statusCode = 202;
      response.end(JSON.stringify({ status: 'accepted', message_id: envelope.message_id, envelope_digest: envelope.envelope_digest, side_effects_executed: false }));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ status: 'blocked', reason: 'route-not-found', side_effects_executed: false }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, received, endpoint: `https://127.0.0.1:${server.address().port}` };
}

function envelope(target_node_id) {
  const normalized = target_node_id === 'Agent2' ? `sha256:${'2'.repeat(64)}` : `sha256:${'3'.repeat(64)}`;
  return createTransportEnvelope({ message_id: `message-${target_node_id}`, network_id: 'network-preflight', event_id: 'event-three-node', plan_id: 'plan-three-node', plan_revision: 1, task_id: `task-${target_node_id}`, from_node_id: 'Agent1', target_node_id, notification_kind: 'agent.task', state: 'available', artifact_refs: [{ artifact_id: normalized, content_sha256: normalized, kind: 'artifact' }], created_at: '2026-08-06T00:00:00.000Z', expires_at: '2026-08-06T01:00:00.000Z' });
}

test('three-node cross-device preflight routes bounded mTLS envelopes from DeviceA to DeviceB and DeviceC', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-opn-three-node-root-'));
  const serverMaterial = await certificate('opn-target', 'IP:127.0.0.1');
  const centerMaterial = await certificate('Agent1', 'DNS:Agent1');
  const targetB = await targetServer(serverMaterial, centerMaterial, 'Agent2');
  const targetC = await targetServer(serverMaterial, centerMaterial, 'Agent3');
  try {
    const adapterB = createTlsTransportAdapter({ endpoint: targetB.endpoint, ca: serverMaterial.cert, cert: centerMaterial.cert, key: centerMaterial.key, bearer_token: 'credential-agent1' });
    const adapterC = createTlsTransportAdapter({ endpoint: targetC.endpoint, ca: serverMaterial.cert, cert: centerMaterial.cert, key: centerMaterial.key, bearer_token: 'credential-agent1' });
    const [sessionB, sessionC] = await Promise.all([adapterB.openSession({ network_id: 'network-preflight', node_id: 'Agent1' }), adapterC.openSession({ network_id: 'network-preflight', node_id: 'Agent1' })]);
    const [sentB, sentC] = await Promise.all([adapterB.send({ session_id: sessionB.session_id, envelope: envelope('Agent2') }), adapterC.send({ session_id: sessionC.session_id, envelope: envelope('Agent3') })]);
    assert.equal(sentB.status, 'accepted');
    assert.equal(sentC.status, 'accepted');
    assert.deepEqual(targetB.received.map((value) => value.target_node_id), ['Agent2']);
    assert.deepEqual(targetC.received.map((value) => value.target_node_id), ['Agent3']);
    await Promise.all([adapterB.closeSession({ session_id: sessionB.session_id }).catch(() => {}), adapterC.closeSession({ session_id: sessionC.session_id }).catch(() => {})]);
  } finally {
    await new Promise((resolve) => targetB.server.close(resolve));
    await new Promise((resolve) => targetC.server.close(resolve));
    await rm(serverMaterial.root, { recursive: true, force: true });
    await rm(centerMaterial.root, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  }
});
