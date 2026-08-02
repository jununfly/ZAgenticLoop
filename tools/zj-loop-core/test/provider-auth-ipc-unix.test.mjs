import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { connectUnixProviderAuthIpc, createUnixProviderAuthIpcServer } from '../dist/provider-auth-ipc-unix.js';
import { createProviderAuthIpcFrame } from '../dist/provider-auth-ipc-protocol.js';

test('Unix ProviderAuth IPC transport requires peer verification and round-trips framed messages', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-provider-auth-ipc-'));
  const socketPath = path.join(root, 'runtime.sock');
  const received = [];
  const server = createUnixProviderAuthIpcServer({ socket_path: socketPath, correlation_id: 'corr-1', verify_peer: () => true, on_frames: async (frames, connection) => { received.push(...frames); await connection.send(createProviderAuthIpcFrame({ correlation_id: 'corr-1', sequence: 1, network_id: 'network-1', node_id: 'node-1', provider_runtime_id: 'runtime-1', provider_id: 'codex', execution_id: 'execution-1', attempt: 1, kind: 'launch-accepted', launch_handle_digest: 'sha256:' + 'a'.repeat(64) })); } });
  const responses = [];
  try {
    await server.start();
    const client = await connectUnixProviderAuthIpc({ socket_path: socketPath, correlation_id: 'corr-1', on_frames: (frames) => responses.push(...frames) });
    await client.send(createProviderAuthIpcFrame({ correlation_id: 'corr-1', sequence: 1, network_id: 'network-1', node_id: 'node-1', provider_runtime_id: 'runtime-1', provider_id: 'codex', execution_id: 'execution-1', attempt: 1, kind: 'challenge', nonce: 'nonce-1' }));
    for (let i = 0; i < 20 && responses.length === 0; i++) await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(received[0].kind, 'challenge');
    assert.equal(responses[0].kind, 'launch-accepted');
    client.close();
  } finally { await server.close(); await rm(root, { recursive: true, force: true }); }
});

test('Unix ProviderAuth IPC transport closes unverified peers', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-provider-auth-ipc-blocked-'));
  const socketPath = path.join(root, 'runtime.sock');
  const server = createUnixProviderAuthIpcServer({ socket_path: socketPath, correlation_id: 'corr-1', verify_peer: () => false, on_frames: () => { throw new Error('unverified peer reached handler'); } });
  try { await server.start(); const client = await connectUnixProviderAuthIpc({ socket_path: socketPath, correlation_id: 'corr-1', on_frames: () => {} }); client.close(); } finally { await server.close(); await rm(root, { recursive: true, force: true }); }
});

test('Unix ProviderAuth IPC transport bounds connection establishment', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-provider-auth-ipc-timeout-'));
  try {
    await assert.rejects(() => connectUnixProviderAuthIpc({ socket_path: path.join(root, 'missing.sock'), correlation_id: 'corr-timeout', timeout_ms: 25, on_frames: () => {} }));
  } finally { await rm(root, { recursive: true, force: true }); }
});
