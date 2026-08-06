import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { createOpnEndpointServer } from '../dist/opn-endpoint.js';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';

const OPENSSL_BIN = process.env.OPENSSL_BIN ?? (existsSync('/opt/homebrew/opt/openssl@3/bin/openssl') ? '/opt/homebrew/opt/openssl@3/bin/openssl' : 'openssl');

async function certificate(root, name) {
  const keyPath = path.join(root, `${name}.key.pem`);
  const certPath = path.join(root, `${name}.cert.pem`);
  execFileSync(OPENSSL_BIN, ['ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', keyPath]);
  execFileSync(OPENSSL_BIN, ['req', '-x509', '-new', '-key', keyPath, '-out', certPath, '-subj', `/CN=${name}`, '-days', '1']);
  return { key: await readFile(keyPath), cert: await readFile(certPath) };
}

function healthz(address, serverCert) {
  return new Promise((resolve, reject) => {
    const request = https.request({ hostname: '127.0.0.1', port: address.port, path: '/healthz', ca: serverCert, rejectUnauthorized: false }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({ statusCode: response.statusCode, body: JSON.parse(body) }));
    });
    request.on('error', reject);
    request.end();
  });
}

test('OPN endpoint starts on a configured address and exposes healthz', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-opn-endpoint-'));
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  await stateStore.createNetwork({ network_id: 'network-endpoint', owner_id: 'human-owner' });
  const material = await certificate(root, 'server');
  const endpoint = await createOpnEndpointServer({
    bind: '127.0.0.1',
    port: 0,
    network_id: 'network-endpoint',
    stateStore,
    tls: { ...material, ca: material.cert },
  });

  try {
    assert.equal(endpoint.address.address, '127.0.0.1');
    const response = await healthz(endpoint.address, material.cert);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, {
      schema: 'zj-loop.pairing_http.v1',
      status: 'ok',
      side_effects_executed: false,
    });
  } finally {
    await endpoint.close();
    await stateStore.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('OPN endpoint CLI starts a real endpoint and reports its port', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-opn-endpoint-cli-'));
  const statePath = path.join(root, 'state.db');
  const stateStore = createSqliteStateStore({ filename: statePath });
  await stateStore.createNetwork({ network_id: 'network-cli-endpoint', owner_id: 'human-owner' });
  await stateStore.close();
  const material = await certificate(root, 'server');
  const keyPath = path.join(root, 'server.key.pem');
  const certPath = path.join(root, 'server.cert.pem');
  const caPath = path.join(root, 'client-ca.pem');
  await writeFile(keyPath, material.key);
  await Promise.all([writeFile(certPath, material.cert), writeFile(caPath, material.cert)]);
  const child = spawn(process.execPath, ['dist/opn-endpoint-cli.js', '--bind', '127.0.0.1', '--port', '0', '--network-id', 'network-cli-endpoint', '--state-store', statePath, '--server-key', keyPath, '--server-cert', certPath, '--client-ca', caPath], { cwd: path.join(process.cwd()) });
  let output = '';
  try {
    const started = await new Promise((resolve, reject) => {
      const onData = (chunk) => {
        output += chunk.toString();
        const line = output.split('\n').find((candidate) => candidate.trim());
        if (!line) return;
        try { resolve(JSON.parse(line)); } catch { /* wait for complete line */ }
      };
      child.stdout.on('data', onData);
      child.stderr.on('data', (chunk) => { output += chunk.toString(); });
      child.once('error', reject);
      child.once('exit', (code) => reject(new Error(`endpoint-cli-exited-${code}: ${output}`)));
    });
    assert.equal(started.status, 'listening');
    assert.equal(started.network_id, 'network-cli-endpoint');
    assert.equal(typeof started.port, 'number');
    const response = await healthz({ port: started.port }, material.cert);
    assert.equal(response.statusCode, 200);
  } finally {
    child.kill('SIGTERM');
    await new Promise((resolve) => child.once('exit', resolve));
    await rm(root, { recursive: true, force: true });
  }
});
