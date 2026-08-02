import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createProviderRuntimeIpcProvider as createProviderRuntimeIpcProviderImpl } from '../dist/provider-auth-ipc-provider-client.js';
import { createProviderAuthIpcFrame } from '../dist/provider-auth-ipc-protocol.js';
import { createUnixProviderAuthIpcServer } from '../dist/provider-auth-ipc-unix.js';
import { createInMemoryProviderAuthRuntime as createInMemoryProviderAuthRuntimeImpl } from '../dist/provider-auth-runtime.js';

const digest = (letter) => `sha256:${letter.repeat(64)}`;
const runtimeBinding = { runtime_identity_fingerprint: digest('e'), runtime_manifest_digest: digest('f'), provider_capabilities_digest: digest('1') };
const createProviderRuntimeIpcProvider = (input) => createProviderRuntimeIpcProviderImpl({ ...input, runtime_binding: input.runtime_binding ?? runtimeBinding });
const createInMemoryProviderAuthRuntime = (input) => {
  const runtime = createInMemoryProviderAuthRuntimeImpl(input);
  return { ...runtime, launch: (request) => runtime.launch({ ...request, runtime_binding: request.runtime_binding ?? runtimeBinding }) };
};

test('Runtime IPC provider consumes only a bound launch handle and ordered result channel', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-provider-ipc-provider-'));
  const socketPath = path.join(root, 'runtime.sock');
  const runtime = createInMemoryProviderAuthRuntime({ runtime_id: 'runtime-1', provider_ids: ['codex'], now: () => '2026-08-02T12:00:00.000Z' });
  const issued = await runtime.issueRef({ network_id: 'network-1', node_id: 'node-1', provider_id: 'codex', execution_id: 'execution-1', attempt: 1, audience: 'model-api', scope: [], secret: 'secret', issued_at: '2026-08-02T11:00:00.000Z', expires_at: '2026-08-02T13:00:00.000Z', human_authorized: true });
  const launched = await runtime.launch({ ref: issued.ref, network_id: 'network-1', node_id: 'node-1', provider_id: 'codex', execution_id: 'execution-1', attempt: 1, contract_digest: digest('a'), adapter_contract_digest: digest('b'), issued_at: '2026-08-02T12:00:00.000Z', expires_at: '2026-08-02T13:00:00.000Z' });
  assert.equal(launched.status, 'launched');
  const providerResult = { schema: 'zj-loop.provider_result.v1', status: 'completed', success: true, exit_code: 0, signal: null, stdout_digest: digest('c'), stderr_digest: digest('d') };
  const server = createUnixProviderAuthIpcServer({ socket_path: socketPath, correlation_id: 'corr-provider', verify_peer: () => true, on_frames: async (frames, connection) => {
    assert.equal(frames[0].kind, 'challenge');
    await connection.send(createProviderAuthIpcFrame({ correlation_id: 'corr-provider', sequence: 1, network_id: 'network-1', node_id: 'node-1', provider_runtime_id: 'runtime-1', provider_id: 'codex', execution_id: 'execution-1', attempt: 1, kind: 'launch-accepted', launch_handle_digest: launched.handle.handle_digest, payload: { schema: 'zj-loop.provider_launch_response.v1', status: 'accepted', handle: launched.handle } }));
    await connection.send(createProviderAuthIpcFrame({ correlation_id: 'corr-provider', sequence: 2, network_id: 'network-1', node_id: 'node-1', provider_runtime_id: 'runtime-1', provider_id: 'codex', execution_id: 'execution-1', attempt: 1, kind: 'stdout', launch_handle_digest: launched.handle.handle_digest, payload: 'runtime-output' }));
    await connection.send(createProviderAuthIpcFrame({ correlation_id: 'corr-provider', sequence: 3, network_id: 'network-1', node_id: 'node-1', provider_runtime_id: 'runtime-1', provider_id: 'codex', execution_id: 'execution-1', attempt: 1, kind: 'stderr', launch_handle_digest: launched.handle.handle_digest, payload: '' }));
    await connection.send(createProviderAuthIpcFrame({ correlation_id: 'corr-provider', sequence: 4, network_id: 'network-1', node_id: 'node-1', provider_runtime_id: 'runtime-1', provider_id: 'codex', execution_id: 'execution-1', attempt: 1, kind: 'result', launch_handle_digest: launched.handle.handle_digest, payload: { schema: 'zj-loop.provider_ipc_result.v1', status: 'completed', success: true, pid: 321, exit_code: 0, signal: null, provider_result: providerResult } }));
  } });
  try {
    await server.start();
    const provider = createProviderRuntimeIpcProvider({ socket_path: socketPath, correlation_id: 'corr-provider', network_id: 'network-1', node_id: 'node-1', provider_runtime_id: 'runtime-1', provider_id: 'codex', execution_id: 'execution-1', attempt: 1, auth_ref_digest: issued.ref.ref_digest, contract_digest: digest('a'), adapter_contract_digest: digest('b') });
    const result = await provider.run({ cwd: '/tmp/worktree', prompt: 'inspect the atom', executable: '/opt/provider' });
    assert.equal(result.stdout, 'runtime-output');
    assert.equal(result.provider_result.stdout_digest, digest('c'));
    assert.equal(result.launch_handle.handle_digest, launched.handle.handle_digest);
    assert.equal(provider.getLaunchHandle().handle_digest, launched.handle.handle_digest);
  } finally { await server.close(); await rm(root, { recursive: true, force: true }); }
});
