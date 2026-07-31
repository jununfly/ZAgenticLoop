import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:https';
import { test } from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createTlsTransportAdapter } from '../dist/tls-transport-adapter.js';
import { createTransportEnvelope } from '../dist/transport-contract.js';

const openssl = process.env.OPENSSL_BIN ?? 'openssl';

async function certificate(commonName, san) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-tls-transport-'));
  const key = path.join(root, 'key.pem');
  const cert = path.join(root, 'cert.pem');
  execFileSync(openssl, ['ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', key], { stdio: 'ignore' });
  execFileSync(openssl, ['req', '-x509', '-new', '-key', key, '-out', cert, '-subj', `/CN=${commonName}`, '-addext', `subjectAltName=${san}`, '-days', '1'], { stdio: 'ignore' });
  return { root, key: await readFile(key, 'utf8'), cert: await readFile(cert, 'utf8') };
}

function envelope() {
  const digest = `sha256:${'a'.repeat(64)}`;
  return createTransportEnvelope({
    message_id: 'message-1', network_id: 'network-1', event_id: 'event-1', plan_id: 'plan-1', plan_revision: 1,
    task_id: 'task-1', from_node_id: 'node-1', target_node_id: 'node-2', notification_kind: 'evidence-available',
    state: 'available', artifact_refs: [{ artifact_id: digest, content_sha256: digest, kind: 'evidence' }],
    created_at: '2026-08-01T12:00:00.000Z', expires_at: '2026-08-01T12:05:00.000Z',
  });
}

test('TLS transport adapter completes a P-256 mTLS and bounded envelope lifecycle', async () => {
  const serverMaterial = await certificate('localhost', 'DNS:localhost,IP:127.0.0.1');
  const clientMaterial = await certificate('node-1', 'DNS:node-1');
  const received = envelope();
  const requests = [];
  const server = createServer({ key: serverMaterial.key, cert: serverMaterial.cert, ca: clientMaterial.cert, requestCert: true, rejectUnauthorized: true, minVersion: 'TLSv1.3' }, async (request, response) => {
    requests.push(`${request.method} ${request.url}`);
    let body = '';
    for await (const chunk of request) body += chunk;
    response.setHeader('content-type', 'application/json');
    if (request.url === '/v1/transport/sessions' && request.method === 'POST') {
      response.statusCode = 201;
      response.end(JSON.stringify({ status: 'created', session: { session_id: 'session-1' }, side_effects_executed: false }));
    } else if (request.url === '/v1/transport/sessions/session-1/envelopes' && request.method === 'POST') {
      const posted = JSON.parse(body);
      response.statusCode = 202;
      response.end(JSON.stringify({ status: 'accepted', message_id: posted.message_id, envelope_digest: posted.envelope_digest, side_effects_executed: false }));
    } else if (request.url === '/v1/transport/sessions/session-1/envelopes' && request.method === 'GET') {
      response.statusCode = 200;
      response.end(JSON.stringify(received));
    } else if (request.url === '/v1/transport/sessions/session-1/ack' && request.method === 'POST') {
      const ack = JSON.parse(body);
      response.statusCode = 200;
      response.end(JSON.stringify({ status: 'accepted', message_id: ack.message_id, envelope_digest: ack.envelope_digest, side_effects_executed: false }));
    } else if (request.url === '/v1/transport/sessions/session-1' && request.method === 'DELETE') {
      response.statusCode = 204;
      response.end();
    } else {
      response.statusCode = 404;
      response.end(JSON.stringify({ status: 'blocked', reason: 'route-not-found', side_effects_executed: false }));
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const adapter = createTlsTransportAdapter({ endpoint: `https://localhost:${server.address().port}`, ca: serverMaterial.cert, cert: clientMaterial.cert, key: clientMaterial.key, bearer_token: 'credential-1' });
  const session = await adapter.openSession({ network_id: 'network-1', node_id: 'node-1' });
  const sent = await adapter.send({ session_id: session.session_id, envelope: received });
  assert.deepEqual(sent, { status: 'accepted', message_id: received.message_id, envelope_digest: received.envelope_digest, side_effects_executed: false });
  assert.deepEqual(await adapter.receive({ session_id: session.session_id }), received);
  assert.equal((await adapter.acknowledge({ session_id: session.session_id, message_id: received.message_id, envelope_digest: received.envelope_digest })).status, 'accepted');
  await adapter.closeSession({ session_id: session.session_id });
  assert.deepEqual(requests, ['POST /v1/transport/sessions', 'POST /v1/transport/sessions/session-1/envelopes', 'GET /v1/transport/sessions/session-1/envelopes', 'POST /v1/transport/sessions/session-1/ack', 'DELETE /v1/transport/sessions/session-1']);
  await new Promise((resolve) => server.close(resolve));
  await rm(serverMaterial.root, { recursive: true, force: true });
  await rm(clientMaterial.root, { recursive: true, force: true });
});

test('TLS transport adapter rejects invalid envelope before network I/O', async () => {
  const adapter = createTlsTransportAdapter({ endpoint: 'https://127.0.0.1:1', ca: 'ca', cert: 'cert', key: 'key', bearer_token: 'credential-1' });
  await assert.rejects(adapter.send({ session_id: 'session-1', envelope: { payload: 'forbidden' } }), { message: 'transport-envelope-field-invalid' });
  assert.throws(() => createTlsTransportAdapter({ endpoint: 'http://127.0.0.1:1', ca: 'ca', cert: 'cert', key: 'key', bearer_token: 'credential-1' }), { message: 'transport-endpoint-https-required' });
});
