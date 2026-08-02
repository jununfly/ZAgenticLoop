import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createTrustedRunnerPostRunProofFactory, createTrustedRunnerPostRunProofServer } from '../dist/trusted-runner-post-run-ipc.js';
import { createFakeRealAgentDogfoodPostRunProof } from '../dist/real-agent-dogfood-post-run-proof.js';

const digest = (letter) => `sha256:${letter.repeat(64)}`;

test('TrustedRunner post-run IPC returns a proof only from the bound endpoint', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-trusted-post-run-ipc-'));
  const socketPath = path.join(root, 'trusted-runner.sock');
  const server = createTrustedRunnerPostRunProofServer({ socket_path: socketPath, correlation_id: 'trusted-correlation', verify_peer: () => true, issue: async (request) => createFakeRealAgentDogfoodPostRunProof(request) });
  try {
    await server.start();
    const factory = createTrustedRunnerPostRunProofFactory({ socket_path: socketPath, correlation_id: 'trusted-correlation' });
    const proof = await factory({ execution_id: 'execution-1', attempt: 1, worktree_path: '/tmp/worktree', executable_digest: digest('a'), stdout_digest: digest('b'), stderr_digest: digest('c'), provider_result: { status: 'completed', success: true, pid: 12, exit_code: 0, signal: null } });
    assert.equal(proof.execution_id, 'execution-1');
    assert.equal(proof.stdout_digest, digest('b'));
  } finally { await server.close(); await rm(root, { recursive: true, force: true }); }
});

test('TrustedRunner post-run IPC fails closed on correlation drift and unavailable endpoint', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-tr-ipc-b-'));
  const socketPath = path.join(root, 'trusted-runner.sock');
  const server = createTrustedRunnerPostRunProofServer({ socket_path: socketPath, correlation_id: 'trusted-correlation', verify_peer: () => true, issue: async (request) => createFakeRealAgentDogfoodPostRunProof(request) });
  try {
    await server.start();
    const drift = createTrustedRunnerPostRunProofFactory({ socket_path: socketPath, correlation_id: 'wrong-correlation', timeout_ms: 100 });
    await assert.rejects(drift({ execution_id: 'execution-1', attempt: 1, worktree_path: '/tmp/worktree', executable_digest: digest('a'), stdout_digest: digest('b'), stderr_digest: digest('c'), provider_result: { status: 'completed', success: true, pid: 12, exit_code: 0, signal: null } }), /post-run/);
  } finally { await server.close(); await rm(root, { recursive: true, force: true }); }
  const unavailable = createTrustedRunnerPostRunProofFactory({ socket_path: socketPath, correlation_id: 'trusted-correlation', timeout_ms: 100 });
  await assert.rejects(unavailable({ execution_id: 'execution-1', attempt: 1, worktree_path: '/tmp/worktree', executable_digest: digest('a'), stdout_digest: digest('b'), stderr_digest: digest('c'), provider_result: { status: 'completed', success: true, pid: 12, exit_code: 0, signal: null } }), /post-run|ENOENT/);
});
