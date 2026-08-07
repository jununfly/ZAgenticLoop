import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createOpnAgentJoinRequest, submitOpnAgentJoinRequest } from '../dist/opn-agent-join.js';
import { createOpnEndpointServer } from '../dist/opn-endpoint.js';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';

const OPENSSL_BIN = process.env.OPENSSL_BIN ?? (existsSync('/opt/homebrew/opt/openssl@3/bin/openssl') ? '/opt/homebrew/opt/openssl@3/bin/openssl' : 'openssl');

async function certificate(root, name) {
  const keyPath = path.join(root, `${name}.key.pem`);
  const certPath = path.join(root, `${name}.cert.pem`);
  execFileSync(OPENSSL_BIN, ['ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', keyPath]);
  execFileSync(OPENSSL_BIN, ['req', '-x509', '-new', '-key', keyPath, '-out', certPath, '-subj', `/CN=${name}`, '-addext', `subjectAltName=DNS:${name},IP:127.0.0.1`, '-days', '1']);
  return { key: await readFile(keyPath, 'utf8'), cert: await readFile(certPath, 'utf8') };
}

test('Agent join submits a signed pairing request over mTLS', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-opn-agent-join-'));
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  await stateStore.createNetwork({ network_id: 'network-join', owner_id: 'human-owner' });
  const server = await certificate(root, 'server');
  const client = await certificate(root, 'agent');
  const endpoint = await createOpnEndpointServer({ bind: '127.0.0.1', port: 0, network_id: 'network-join', stateStore, tls: { key: server.key, cert: server.cert, ca: client.cert } });
  try {
    const request = createOpnAgentJoinRequest({
      request_id: 'join-request-1',
      network_id: 'network-join',
      display_name: 'Windows Agent',
      agent_kind: 'agent',
      agent_version: 'dev',
      endpoint: 'tailscale://100.97.251.67',
      requested_capabilities: ['event.consume'],
      expires_at: '2099-01-01T00:00:00.000Z',
      certificate_pem: client.cert,
      private_key_pem: client.key,
    });
    const response = await submitOpnAgentJoinRequest({ endpoint: `https://127.0.0.1:${endpoint.address.port}`, server_name: 'server', ca: server.cert, cert: client.cert, key: client.key, request });
    assert.equal(response.statusCode, 201);
    assert.equal(response.body.status, 'created');
    assert.equal(response.body.session.network_id, 'network-join');
    assert.equal(response.body.session.node_id, request.request.node_id);
    assert.equal(typeof response.body.session_token, 'string');
  } finally {
    await endpoint.close();
    await stateStore.close();
    await rm(root, { recursive: true, force: true });
  }
});
