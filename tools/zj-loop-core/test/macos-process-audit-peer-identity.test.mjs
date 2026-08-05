import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { bootstrapIdentityDigest } from '../dist/bootstrap-protocol.js';
import { createMacOSProcessAuditBootstrapPeerIdentityVerifier, createMacOSProcessAuditIdentityFacts, createMacOSProcessAuditPeerIdentityVerifier } from '../dist/macos-process-audit-peer-identity.js';
import { createProviderAuthIpcFrame } from '../dist/provider-auth-ipc-protocol.js';
import { connectUnixProviderAuthIpc, createUnixProviderAuthIpcServer } from '../dist/provider-auth-ipc-unix.js';

const isMacOS = process.platform === 'darwin';

test('macOS process-audit response normalizes into provider-neutral bootstrap identity facts', () => {
  const facts = createMacOSProcessAuditIdentityFacts({ process_id: 42, signing_identifier: 'com.example.agent', team_identifier: 'TEAM1', code_directory_hash: 'cdhash-1' });
  assert.deepEqual(facts, {
    schema: 'zj-loop.worker_identity_facts.v1',
    platform: 'darwin',
    kind: 'process-audit',
    process_id: 42,
    signing_identifier: 'com.example.agent',
    team_identifier: 'TEAM1',
    code_directory_hash: 'cdhash-1',
    executable_digest: facts.executable_digest,
    signer_digest: facts.signer_digest,
  });
  assert.equal(bootstrapIdentityDigest(facts), bootstrapIdentityDigest({ ...facts }));
  assert.match(facts.executable_digest, /^sha256:[0-9a-f]{64}$/);
  assert.match(facts.signer_digest, /^sha256:[0-9a-f]{64}$/);
});

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

async function helperPidIdentity(binary, pid) {
  return await new Promise((resolve, reject) => {
    const child = spawn(binary, ['--pid', String(pid)], { stdio: ['ignore', 'pipe', 'pipe'] });
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

test('macOS process-audit helper observes a Runtime service by PID', { skip: !isMacOS }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-process-audit-pid-'));
  try {
    const binary = await compileHelper(root);
    const first = await helperPidIdentity(binary, process.pid);
    const second = await helperPidIdentity(binary, process.pid);
    assert.equal(first.status, 'verified');
    assert.equal(first.process_id, process.pid);
    assert.match(first.identity_digest, /^sha256:[0-9a-f]{64}$/);
    assert.equal(first.identity_digest, second.identity_digest);
  } finally { await rm(root, { recursive: true, force: true }); }
});

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

test('macOS process-audit bootstrap verifier verifies the real Unix socket against bootstrap identity digest', { skip: !isMacOS }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-process-audit-bootstrap-'));
  const socketPath = path.join(root, 'peer.sock');
  try {
    const binary = await compileHelper(root);
    const pair = await connectedPair(socketPath);
    const native = await helperIdentity(binary, pair.socket);
    const facts = createMacOSProcessAuditIdentityFacts(native);
    const helperBytes = await readFile(binary);
    const verifier = createMacOSProcessAuditBootstrapPeerIdentityVerifier({ helper_path: binary, helper_digest: `sha256:${createHash('sha256').update(helperBytes).digest('hex')}` });
    const result = await verifier({ socket: pair.socket, correlation_id: 'bootstrap-fixture', expected_identity_digest: bootstrapIdentityDigest(facts) });
    assert.equal(result.status, 'verified');
    assert.equal(result.identity.identity_digest, bootstrapIdentityDigest(facts));
    assert.equal(result.identity.process_id, process.pid);
    pair.client.destroy(); pair.socket.destroy(); await new Promise((resolve) => pair.server.close(resolve));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('macOS bootstrap identity is a Unix socket server gate before provider IPC handling', { skip: !isMacOS }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-process-audit-gate-'));
  const probePath = path.join(root, 'probe.sock');
  const serverPath = path.join(root, 'server.sock');
  try {
    const binary = await compileHelper(root);
    const helperBytes = await readFile(binary);
    const helperDigest = `sha256:${createHash('sha256').update(helperBytes).digest('hex')}`;
    const probe = await connectedPair(probePath);
    const facts = createMacOSProcessAuditIdentityFacts(await helperIdentity(binary, probe.socket));
    probe.client.destroy(); probe.socket.destroy(); await new Promise((resolve) => probe.server.close(resolve));
    const verifier = createMacOSProcessAuditBootstrapPeerIdentityVerifier({ helper_path: binary, helper_digest: helperDigest });
    const received = [];
    let resolveFrame;
    const frameReceived = new Promise((resolve) => { resolveFrame = resolve; });
    const server = createUnixProviderAuthIpcServer({
      socket_path: serverPath,
      correlation_id: 'bootstrap-gate',
      verify_peer: async (socket) => (await verifier({ socket, correlation_id: 'bootstrap-gate', expected_identity_digest: bootstrapIdentityDigest(facts) })).status === 'verified',
      on_frames: async (frames) => { received.push(...frames); resolveFrame(); },
    });
    await server.start();
    const client = await connectUnixProviderAuthIpc({ socket_path: serverPath, correlation_id: 'bootstrap-gate', on_frames: () => {} });
    await client.send(createProviderAuthIpcFrame({ kind: 'challenge', correlation_id: 'bootstrap-gate', sequence: 1, network_id: 'network-1', node_id: 'node-1', provider_runtime_id: 'runtime-1', provider_id: 'agent-1', execution_id: 'execution-1', attempt: 1, nonce: 'nonce-1', payload: { schema: 'fixture' } }));
    await Promise.race([frameReceived, new Promise((_, reject) => setTimeout(() => reject(new Error('bootstrap-gate-frame-timeout')), 2_000))]);
    assert.equal(received.length, 1);
    client.close();
    await server.close();
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
