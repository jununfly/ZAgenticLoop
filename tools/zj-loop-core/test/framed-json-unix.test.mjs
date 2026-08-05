import assert from 'node:assert/strict';
import { mkdtemp, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { connectUnixFramedJson, createUnixFramedJsonServer } from '../dist/framed-json-unix.js';

test('provider-neutral Unix transport authenticates before decoding and exchanges framed JSON', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-framed-unix-'));
  const socketPath = path.join(root, 'authority.sock');
  const received = [];
  let resolveResponse;
  const responsePromise = new Promise((resolve) => { resolveResponse = resolve; });
  const server = createUnixFramedJsonServer({ socket_path: socketPath, correlation_id: 'corr-1', verify_peer: () => true, on_frames: async (frames, connection) => { received.push(...frames); await connection.send({ correlation_id: 'corr-1', sequence: 1, response: 'ok' }); } });
  await server.start();
  const client = await connectUnixFramedJson({ socket_path: socketPath, correlation_id: 'corr-1', on_frames: (frames) => { received.push(...frames); resolveResponse(); } });
  await client.send({ correlation_id: 'corr-1', sequence: 1, command: 'revoke', payload: { auth_ref_id: 'ref-1' } });
  await Promise.race([responsePromise, new Promise((_, reject) => setTimeout(() => reject(new Error('framed-unix-timeout')), 1_000))]);
  assert.equal(received[0].command, 'revoke');
  assert.equal(received[1].response, 'ok');
  client.close();
  await server.close();
  await assert.rejects(stat(socketPath));
});

test('provider-neutral Unix transport rejects an unauthenticated peer before command handling', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-framed-unix-blocked-'));
  const socketPath = path.join(root, 'authority.sock');
  let handled = false;
  const server = createUnixFramedJsonServer({ socket_path: socketPath, correlation_id: 'corr-1', verify_peer: () => false, on_frames: async () => { handled = true; } });
  await server.start();
  const client = await connectUnixFramedJson({ socket_path: socketPath, correlation_id: 'corr-1', timeout_ms: 250, on_frames: () => {} });
  await new Promise((resolve) => setTimeout(resolve, 50));
  await assert.rejects(client.send({ correlation_id: 'corr-1', sequence: 1, command: 'revoke' }));
  assert.equal(handled, false);
  await server.close();
});
