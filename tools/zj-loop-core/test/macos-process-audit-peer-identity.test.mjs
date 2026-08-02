import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createMacOSProcessAuditPeerIdentityVerifier } from '../dist/macos-process-audit-peer-identity.js';

const isMacOS = process.platform === 'darwin';

async function compileHelper(root) {
  const source = path.resolve('native/macos-process-audit-peer-identity.swift');
  const binary = path.join(root, 'process-audit-peer-identity');
  execFileSync('swiftc', ['-O', '-framework', 'Security', '-framework', 'CryptoKit', source, '-o', binary], { stdio: 'ignore' });
  return binary;
}

async function helperIdentity(binary, socket) {
  return await new Promise((resolve, reject) => {
    const child = spawn(binary, ['--socket-fd', '3'], { stdio: ['ignore', 'pipe', 'pipe', socket._handle.fd] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code !== 0) return reject(new Error(stderr || `helper-exit-${code}`));
      try { resolve(JSON.parse(stdout.trim())); } catch (error) { reject(error); }
    });
  });
}

async function connectedPair(socketPath) {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(socketPath, resolve); });
  const accepted = new Promise((resolve) => server.once('connection', resolve));
  const client = net.createConnection(socketPath);
  await new Promise((resolve, reject) => { client.once('connect', resolve); client.once('error', reject); });
  return { server, client, socket: await accepted };
}

async function tcpConnectedPair() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  const accepted = new Promise((resolve) => server.once('connection', resolve));
  const client = net.createConnection(address.port, address.address);
  await new Promise((resolve, reject) => { client.once('connect', resolve); client.once('error', reject); });
  return { server, client, socket: await accepted };
}

test('macOS process-audit adapter verifies the real Unix socket peer identity', { skip: !isMacOS }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-process-audit-'));
  const socketPath = path.join(root, 'peer.sock');
  try {
    const binary = await compileHelper(root);
    const pair = await connectedPair(socketPath);
    const socket = pair.socket;
    const expected = await helperIdentity(binary, socket);
    const helperBytes = await readFile(binary);
    const verifier = createMacOSProcessAuditPeerIdentityVerifier({ helper_path: binary, helper_digest: `sha256:${createHash('sha256').update(helperBytes).digest('hex')}` });
    const result = await verifier({ socket, correlation_id: 'fixture', expected_identity_digest: expected.identity_digest });
    assert.equal(result.status, 'verified');
    assert.equal(result.identity.platform, 'darwin');
    assert.equal(result.identity.kind, 'process-audit');
    assert.equal(result.identity.process_id, process.pid);
    pair.client.destroy(); socket.destroy(); await new Promise((resolve) => pair.server.close(resolve));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('macOS process-audit adapter blocks digest drift and malformed helper output', { skip: !isMacOS }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-process-audit-invalid-'));
  const socketPath = path.join(root, 'peer.sock');
  try {
    const realBinary = await compileHelper(root);
    const pair = await connectedPair(socketPath);
    const helperBytes = await readFile(realBinary);
    const helperDigest = `sha256:${createHash('sha256').update(helperBytes).digest('hex')}`;
    const verifier = createMacOSProcessAuditPeerIdentityVerifier({ helper_path: realBinary, helper_digest: helperDigest });
    const drift = await verifier({ socket: pair.socket, correlation_id: 'fixture', expected_identity_digest: `sha256:${'0'.repeat(64)}` });
    assert.deepEqual(drift, { status: 'blocked', reason: 'trusted-runner-peer-identity-mismatch' });
    pair.client.destroy(); pair.socket.destroy(); await new Promise((resolve) => pair.server.close(resolve));

    const malformed = path.join(root, 'malformed');
    execFileSync('cp', ['/bin/echo', malformed]);
    const malformedBytes = await readFile(malformed);
    const malformedVerifier = createMacOSProcessAuditPeerIdentityVerifier({ helper_path: malformed, helper_digest: `sha256:${createHash('sha256').update(malformedBytes).digest('hex')}` });
    const pair2 = await connectedPair(path.join(root, 'peer-2.sock'));
    const result = await malformedVerifier({ socket: pair2.socket, correlation_id: 'fixture', expected_identity_digest: `sha256:${'1'.repeat(64)}` });
    assert.equal(result.status, 'blocked');
    assert.match(result.reason, /macos-process-audit-helper/);
    pair2.client.destroy(); pair2.socket.destroy(); await new Promise((resolve) => pair2.server.close(resolve));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('macOS process-audit adapter blocks when the OS cannot provide a Unix peer PID', { skip: !isMacOS }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-process-audit-no-peer-'));
  try {
    const binary = await compileHelper(root);
    const helperBytes = await readFile(binary);
    const pair = await tcpConnectedPair();
    const verifier = createMacOSProcessAuditPeerIdentityVerifier({ helper_path: binary, helper_digest: `sha256:${createHash('sha256').update(helperBytes).digest('hex')}` });
    const result = await verifier({ socket: pair.socket, correlation_id: 'fixture', expected_identity_digest: `sha256:${'a'.repeat(64)}` });
    assert.deepEqual(result, { status: 'blocked', reason: 'macos-process-audit-peer-pid-unavailable' });
    pair.client.destroy(); pair.socket.destroy(); await new Promise((resolve) => pair.server.close(resolve));
  } finally { await rm(root, { recursive: true, force: true }); }
});
