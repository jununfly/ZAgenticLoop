import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';
import { createOpnArtifactStore } from '../dist/opn-artifact-store.js';
import { createOpnArtifactTransferHttpService, projectOpnArtifactTransfers } from '../dist/opn-artifact-transfer-http-server.js';

function call(port, method, pathname, body, nodeId) {
  return new Promise((resolve, reject) => {
    const payload = body instanceof Uint8Array ? Buffer.from(body) : body === undefined ? undefined : Buffer.from(JSON.stringify(body));
    const req = request({ hostname: '127.0.0.1', port, path: pathname, method, headers: { authorization: 'Bearer dev-token', ...(payload ? { 'content-length': payload.length, ...(body instanceof Uint8Array ? {} : { 'content-type': 'application/json' }) } : {}) } }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.setHeader('x-test-node-id', nodeId);
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

test('artifact transfer registers, verifies, stores, and serves a content-addressed artifact', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-opn-artifact-http-'));
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  await stateStore.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2026-08-07T12:00:00.000Z' });
  const artifactStore = createOpnArtifactStore({ root: path.join(root, 'artifacts'), max_bytes: 1024 });
  const service = createOpnArtifactTransferHttpService({ network_id: 'network-1', stateStore, artifactStore, credentialVerifier: { verify: async () => ({ status: 'allowed', credential_id: 'credential-1', expires_at: '2026-08-07T13:00:00.000Z' }) }, now: () => '2026-08-07T12:01:00.000Z', max_bytes: 1024 });
  const server = createServer((req, res) => service.handle({ request: req, response: res, node_id: req.headers['x-test-node-id'] }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    const bytes = Buffer.from('artifact-from-windows');
    const artifactId = 'sha256:' + (await import('node:crypto')).createHash('sha256').update(bytes).digest('hex');
    const metadata = { schema: 'zj-loop.opn_artifact.v1', artifact_id: artifactId, content_sha256: artifactId, size_bytes: bytes.length, file_name: 'message.txt', media_type: 'text/plain' };
    assert.equal((await call(port, 'POST', '/v1/artifacts', { transfer_id: 'transfer-1', target_node_id: 'mac-1', metadata }, 'windows-1')).status, 202);
    const uploaded = await call(port, 'PUT', `/v1/artifacts/${artifactId}`, bytes, 'windows-1');
    assert.equal(uploaded.status, 201);
    assert.equal(JSON.parse(uploaded.body).status, 'verified');
    const downloaded = await call(port, 'GET', `/v1/artifacts/${artifactId}`, undefined, 'windows-1');
    assert.equal(downloaded.status, 200);
    assert.deepEqual(downloaded.body, bytes);
    const projection = await projectOpnArtifactTransfers({ stateStore, network_id: 'network-1' });
    assert.deepEqual(projection.map((item) => item.status), ['verified']);
    assert.equal((await call(port, 'PUT', `/v1/artifacts/${artifactId}`, Buffer.from('tampered'), 'windows-1')).status, 400);
    assert.equal((await call(port, 'PUT', `/v1/artifacts/${artifactId}`, bytes, 'mac-1')).status, 403);
    assert.equal((await call(port, 'POST', '/v1/artifacts', { metadata: null }, 'windows-1')).status, 400);
  } finally { await new Promise((resolve) => server.close(resolve)); await stateStore.close(); await rm(root, { recursive: true, force: true }); }
});
