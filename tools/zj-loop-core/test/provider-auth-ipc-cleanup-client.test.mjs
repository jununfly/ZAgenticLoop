import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createProviderRuntimeIpcCleanupCoordinator, createProviderRuntimeCleanupRequest } from '../dist/provider-auth-ipc-cleanup-client.js';
import { createProviderAuthIpcFrame } from '../dist/provider-auth-ipc-protocol.js';
import { createUnixProviderAuthIpcServer } from '../dist/provider-auth-ipc-unix.js';
import { createInMemoryProviderAuthRuntime as createInMemoryProviderAuthRuntimeImpl } from '../dist/provider-auth-runtime.js';

const digest = (letter) => `sha256:${letter.repeat(64)}`;
const runtimeBinding = { runtime_identity_fingerprint: digest('e'), runtime_manifest_digest: digest('f'), provider_capabilities_digest: digest('1') };
const createInMemoryProviderAuthRuntime = (input) => {
  const runtime = createInMemoryProviderAuthRuntimeImpl(input);
  return { ...runtime, launch: (request) => runtime.launch({ ...request, runtime_binding: request.runtime_binding ?? runtimeBinding }) };
};

async function launchedRuntime() {
  const runtime = createInMemoryProviderAuthRuntime({ runtime_id: 'runtime-1', provider_ids: ['codex'], now: () => '2026-08-02T12:00:00.000Z' });
  const issued = await runtime.issueRef({ network_id: 'network-1', node_id: 'node-1', provider_id: 'codex', execution_id: 'execution-1', attempt: 1, audience: 'model-api', scope: [], secret: 'secret', issued_at: '2026-08-02T11:00:00.000Z', expires_at: '2026-08-02T13:00:00.000Z', human_authorized: true });
  const launch = await runtime.launch({ ref: issued.ref, network_id: 'network-1', node_id: 'node-1', provider_id: 'codex', execution_id: 'execution-1', attempt: 1, contract_digest: digest('a'), adapter_contract_digest: digest('b'), issued_at: '2026-08-02T12:00:00.000Z', expires_at: '2026-08-02T13:00:00.000Z' });
  assert.equal(launch.status, 'launched');
  return { runtime, handle: launch.handle };
}

test('Runtime IPC cleanup coordinator accepts only a bound Runtime cleanup digest', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-provider-cleanup-'));
  const socketPath = path.join(root, 'runtime.sock');
  const { runtime, handle } = await launchedRuntime();
  const server = createUnixProviderAuthIpcServer({ socket_path: socketPath, correlation_id: 'corr-cleanup', verify_peer: () => true, on_frames: async (frames, connection) => {
    const request = frames[0];
    assert.equal(request.kind, 'cleanup');
    const cleanup = await runtime.cleanup({ handle, network_id: 'network-1', node_id: 'node-1', provider_id: 'codex', execution_id: 'execution-1', attempt: 1, cleaned_at: '2026-08-02T12:01:00.000Z' });
    assert.equal(cleanup.status, 'cleaned');
    await connection.send(createProviderAuthIpcFrame({ correlation_id: 'corr-cleanup', sequence: 1, network_id: 'network-1', node_id: 'node-1', provider_runtime_id: 'runtime-1', provider_id: 'codex', execution_id: 'execution-1', attempt: 1, kind: 'cleanup', launch_handle_digest: handle.handle_digest, payload: { schema: 'zj-loop.provider_cleanup_response.v1', status: 'cleaned', cleanup_digest: cleanup.proof.cleanup_digest, runtime_identity_fingerprint: cleanup.proof.runtime_identity_fingerprint, runtime_manifest_digest: cleanup.proof.runtime_manifest_digest, provider_capabilities_digest: cleanup.proof.provider_capabilities_digest } }));
  } });
  try {
    await server.start();
    const cleanup = createProviderRuntimeIpcCleanupCoordinator({ socket_path: socketPath, correlation_id: 'corr-cleanup', handle, network_id: 'network-1', node_id: 'node-1', provider_id: 'codex', execution_id: 'execution-1', attempt: 1 });
    const result = await cleanup();
    assert.equal(result.status, 'cleaned');
    assert.match(result.proof_digest, /^sha256:/);
  } finally { await server.close(); await rm(root, { recursive: true, force: true }); }
});

test('Runtime IPC cleanup coordinator fails closed on response binding drift and unavailable Runtime', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-provider-cleanup-drift-'));
  const socketPath = path.join(root, 'runtime.sock');
  const { handle } = await launchedRuntime();
  const server = createUnixProviderAuthIpcServer({ socket_path: socketPath, correlation_id: 'corr-drift', verify_peer: () => true, on_frames: async (_frames, connection) => {
    await connection.send(createProviderAuthIpcFrame({ correlation_id: 'corr-drift', sequence: 1, network_id: 'network-other', node_id: 'node-1', provider_runtime_id: 'runtime-1', provider_id: 'codex', execution_id: 'execution-1', attempt: 1, kind: 'cleanup', launch_handle_digest: handle.handle_digest, payload: { schema: 'zj-loop.provider_cleanup_response.v1', status: 'cleaned', cleanup_digest: digest('c') } }));
  } });
  try {
    await server.start();
    const drift = createProviderRuntimeIpcCleanupCoordinator({ socket_path: socketPath, correlation_id: 'corr-drift', handle, network_id: 'network-1', node_id: 'node-1', provider_id: 'codex', execution_id: 'execution-1', attempt: 1 });
    assert.deepEqual(await drift(), { status: 'uncertain', reason: 'provider-runtime-cleanup-response-binding-mismatch' });
  } finally { await server.close(); await rm(root, { recursive: true, force: true }); }
  const unavailable = createProviderRuntimeIpcCleanupCoordinator({ socket_path: path.join(root, 'missing.sock'), handle, network_id: 'network-1', node_id: 'node-1', provider_id: 'codex', execution_id: 'execution-1', attempt: 1, timeout_ms: 100 });
  assert.deepEqual(await unavailable(), { status: 'uncertain', reason: 'provider-runtime-cleanup-ipc-unavailable' });
});

test('Runtime IPC cleanup coordinator maps Runtime rejection immediately and rejects response extras', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-provider-cleanup-rejected-'));
  const socketPath = path.join(root, 'runtime.sock');
  const { handle } = await launchedRuntime();
  const server = createUnixProviderAuthIpcServer({ socket_path: socketPath, correlation_id: 'corr-rejected', verify_peer: () => true, on_frames: async (_frames, connection) => {
    await connection.send(createProviderAuthIpcFrame({ correlation_id: 'corr-rejected', sequence: 1, network_id: 'network-1', node_id: 'node-1', provider_runtime_id: 'runtime-1', provider_id: 'codex', execution_id: 'execution-1', attempt: 1, kind: 'error', launch_handle_digest: handle.handle_digest, payload: { code: 'cleanup-rejected' } }));
  } });
  try {
    await server.start();
    const cleanup = createProviderRuntimeIpcCleanupCoordinator({ socket_path: socketPath, correlation_id: 'corr-rejected', handle, network_id: 'network-1', node_id: 'node-1', provider_id: 'codex', execution_id: 'execution-1', attempt: 1 });
    assert.deepEqual(await cleanup(), { status: 'uncertain', reason: 'provider-runtime-cleanup-rejected' });
  } finally { await server.close(); await rm(root, { recursive: true, force: true }); }
});
