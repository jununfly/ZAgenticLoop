import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash, X509Certificate } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { createInMemoryHumanAuthorityProvider } from '../dist/human-authority.js';
import { createOpnAgentJoinRequest, submitOpnAgentJoinRequest } from '../dist/opn-agent-join.js';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';

const OPENSSL_BIN = process.env.OPENSSL_BIN ?? (existsSync('/opt/homebrew/opt/openssl@3/bin/openssl') ? '/opt/homebrew/opt/openssl@3/bin/openssl' : 'openssl');

async function certificate(root, name) {
  const keyPath = path.join(root, `${name}.key.pem`);
  const certPath = path.join(root, `${name}.cert.pem`);
  execFileSync(OPENSSL_BIN, ['ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', keyPath]);
  execFileSync(OPENSSL_BIN, ['req', '-x509', '-new', '-key', keyPath, '-out', certPath, '-subj', `/CN=${name}`, '-addext', `subjectAltName=DNS:${name},IP:127.0.0.1`, '-days', '1']);
  return { key: await readFile(keyPath), cert: await readFile(certPath) };
}

function ownerList({ port, material, token, networkId = 'network-cli-owner' }) {
  return new Promise((resolve, reject) => {
    const request = https.request({ hostname: '127.0.0.1', port, path: `/v1/owner/pairing-requests?network_id=${encodeURIComponent(networkId)}`, method: 'GET', ca: material.cert, cert: material.cert, key: material.key, rejectUnauthorized: false, headers: { authorization: `Bearer ${token}` } }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({ statusCode: response.statusCode, body: JSON.parse(body) }));
    });
    request.on('error', reject);
    request.end();
  });
}

function ownerApprove({ port, material, token, requestId, requestDigest, body }) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const request = https.request({ hostname: '127.0.0.1', port, path: `/v1/owner/pairing-requests/${encodeURIComponent(requestId)}/approve`, method: 'POST', ca: material.cert, cert: material.cert, key: material.key, rejectUnauthorized: false, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } }, (response) => {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { text += chunk; });
      response.on('end', () => resolve({ statusCode: response.statusCode, body: JSON.parse(text) }));
    });
    request.on('error', reject);
    request.end(payload);
  });
}

function sessionStatus({ port, material, sessionId, token }) {
  return new Promise((resolve, reject) => {
    const request = https.request({ hostname: '127.0.0.1', port, path: `/v1/pairing-requests/${encodeURIComponent(sessionId)}/status`, method: 'GET', ca: material.cert, cert: material.cert, key: material.key, rejectUnauthorized: false, headers: { authorization: `Bearer ${token}` } }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({ statusCode: response.statusCode, body: JSON.parse(body) }));
    });
    request.on('error', reject);
    request.end();
  });
}

function claimCredential({ port, material, requestId, token }) {
  return new Promise((resolve, reject) => {
    const payload = '{}';
    const request = https.request({ hostname: '127.0.0.1', port, path: `/v1/pairing-requests/${encodeURIComponent(requestId)}/credential/claim`, method: 'POST', ca: material.cert, cert: material.cert, key: material.key, rejectUnauthorized: false, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({ statusCode: response.statusCode, body: JSON.parse(body) }));
    });
    request.on('error', reject);
    request.end(payload);
  });
}

test('OPN endpoint CLI exposes owner pairing list through configured development authenticator', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-opn-endpoint-cli-owner-'));
  const statePath = path.join(root, 'state.db');
  const stateStore = createSqliteStateStore({ filename: statePath });
  await stateStore.createNetwork({ network_id: 'network-cli-owner', owner_id: 'human-1' });
  await stateStore.close();
  const material = await certificate(root, 'server');
  const authority = createInMemoryHumanAuthorityProvider({ human_id: 'human-1', protocol_version: 'v2' });
  const identityPath = path.join(root, 'owner-public-key.pem');
  await writeFile(identityPath, authority.getPublicIdentity().public_key_pem);
  const keyPath = path.join(root, 'server.key.pem');
  const certPath = path.join(root, 'server.cert.pem');
  const caPath = path.join(root, 'client-ca.pem');
  await writeFile(keyPath, material.key);
  await Promise.all([writeFile(certPath, material.cert), writeFile(caPath, material.cert)]);
  const child = spawn(process.execPath, ['dist/opn-endpoint-cli.js', '--bind', '127.0.0.1', '--port', '0', '--network-id', 'network-cli-owner', '--state-store', statePath, '--server-key', keyPath, '--server-cert', certPath, '--client-ca', caPath, '--owner-human-id', 'human-1', '--owner-public-key', identityPath, '--owner-token', 'dev-owner-token'], { cwd: process.cwd() });
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
      setTimeout(() => reject(new Error(`endpoint-cli-start-timeout: ${output}`)), 2000);
    });
    let listed;
    try {
      listed = await ownerList({ port: started.port, material, token: 'dev-owner-token', networkId: 'network-cli-owner' });
    } catch (error) {
      throw new Error(`list-after-approve-failed-${error instanceof Error ? error.message : String(error)}: ${output}`);
    }
    assert.equal(listed.statusCode, 200, JSON.stringify(listed.body));
    assert.equal(listed.body.status, 'ok');
    assert.deepEqual(listed.body.requests, []);
  } finally {
    child.kill('SIGTERM');
    await new Promise((resolve) => child.once('exit', resolve));
    await rm(root, { recursive: true, force: true });
  }
});

test('OPN endpoint CLI records Human approval for a real pairing request', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-opn-endpoint-cli-approve-'));
  const statePath = path.join(root, 'state.db');
  const stateStore = createSqliteStateStore({ filename: statePath });
  await stateStore.createNetwork({ network_id: 'network-cli-approve', owner_id: 'human-1' });
  await stateStore.close();
  const material = await certificate(root, 'server');
  const peerFingerprint = createHash('sha256').update(new X509Certificate(material.cert).raw).digest('hex');
  const authority = createInMemoryHumanAuthorityProvider({ human_id: 'human-1', protocol_version: 'v2', network_id: 'network-cli-approve', device_key_id: 'mac-device-1', device_fingerprint: peerFingerprint });
  const identityPath = path.join(root, 'owner-public-key.pem');
  await writeFile(identityPath, authority.getPublicIdentity().public_key_pem);
  const keyPath = path.join(root, 'server.key.pem');
  const certPath = path.join(root, 'server.cert.pem');
  const caPath = path.join(root, 'client-ca.pem');
  await writeFile(keyPath, material.key);
  await Promise.all([writeFile(certPath, material.cert), writeFile(caPath, material.cert)]);
  const child = spawn(process.execPath, ['dist/opn-endpoint-cli.js', '--bind', '127.0.0.1', '--port', '0', '--network-id', 'network-cli-approve', '--state-store', statePath, '--server-key', keyPath, '--server-cert', certPath, '--client-ca', caPath, '--owner-human-id', 'human-1', '--owner-public-key', identityPath, '--owner-token', 'dev-owner-token'], { cwd: process.cwd() });
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
      setTimeout(() => reject(new Error(`endpoint-cli-start-timeout: ${output}`)), 2000);
    });
    const request = createOpnAgentJoinRequest({ request_id: 'pair-cli-approve', network_id: 'network-cli-approve', display_name: 'Windows Agent', agent_kind: 'agent', agent_version: 'dev', endpoint: 'tailscale://100.97.251.67', requested_capabilities: ['event.consume'], expires_at: new Date(Date.now() + 60_000).toISOString(), certificate_pem: material.cert.toString(), private_key_pem: material.key.toString() });
    let joined;
    try {
      joined = await submitOpnAgentJoinRequest({ endpoint: `https://127.0.0.1:${started.port}`, server_name: 'server', ca: material.cert, cert: material.cert, key: material.key, request });
    } catch (error) {
      throw new Error(`join-failed-${error instanceof Error ? error.message : String(error)}: ${output}`);
    }
    assert.equal(joined.statusCode, 201);
    const context = await authority.signApprovalContext({ action: 'pairing.approve', request_id: request.request.request_id, request_digest: joined.body.session.request_digest, network_id: 'network-cli-approve', device_key_id: 'mac-device-1', device_fingerprint: peerFingerprint, approved_capabilities: ['event.consume'], issued_at: new Date().toISOString(), expires_at: new Date(Date.now() + 60_000).toISOString() });
    let approved;
    try {
      approved = await ownerApprove({ port: started.port, material, token: 'dev-owner-token', requestId: request.request.request_id, requestDigest: joined.body.session.request_digest, body: { network_id: 'network-cli-approve', request_digest: joined.body.session.request_digest, approved_capabilities: ['event.consume'], context } });
    } catch (error) {
      throw new Error(`approve-failed-${error instanceof Error ? error.message : String(error)}: ${output}`);
    }
    assert.equal(approved.statusCode, 201, JSON.stringify(approved.body));
    assert.equal(approved.body.lifecycle.type, 'human-approved');
    assert.match(approved.body.credential_id, /^credential_[a-f0-9]{32}$/);
    const retryApproval = await ownerApprove({ port: started.port, material, token: 'dev-owner-token', requestId: request.request.request_id, requestDigest: joined.body.session.request_digest, body: { network_id: 'network-cli-approve', request_digest: joined.body.session.request_digest, approved_capabilities: ['event.consume'], context } });
    assert.equal(retryApproval.statusCode, 200, JSON.stringify(retryApproval.body));
    assert.equal(retryApproval.body.credential_id, approved.body.credential_id);
    const status = await sessionStatus({ port: started.port, material, sessionId: joined.body.session.session_id, token: joined.body.session_token });
    assert.equal(status.statusCode, 200, JSON.stringify(status.body));
    assert.equal(status.body.session.status, 'approved');
    assert.equal(status.body.enrollment.status, 'approved');
    assert.deepEqual(status.body.enrollment.capability_ceiling, ['event.consume']);
    const credential = await claimCredential({ port: started.port, material, requestId: request.request.request_id, token: joined.body.session_token });
    assert.equal(credential.statusCode, 200, JSON.stringify(credential.body));
    assert.equal(credential.body.credential_id, approved.body.credential_id);
    assert.match(credential.body.token, /^[-_A-Za-z0-9]+$/);
    let listed;
    try {
      listed = await ownerList({ port: started.port, material, token: 'dev-owner-token', networkId: 'network-cli-approve' });
    } catch (error) {
      throw new Error(`list-after-approve-failed-${error instanceof Error ? error.message : String(error)}: ${output}`);
    }
    assert.equal(listed.body.requests[0].status, 'approved');
  } finally {
    child.kill('SIGTERM');
    await new Promise((resolve) => child.once('exit', resolve));
    await rm(root, { recursive: true, force: true });
  }
});
