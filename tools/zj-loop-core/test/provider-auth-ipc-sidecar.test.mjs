import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createProviderAuthRuntimeIpcSidecar } from '../dist/provider-auth-ipc-sidecar.js';
import { createProviderRuntimeIpcProvider } from '../dist/provider-auth-ipc-provider-client.js';
import { createProviderRuntimeIpcCleanupCoordinator } from '../dist/provider-auth-ipc-cleanup-client.js';
import { createInMemoryProviderAuthRuntime } from '../dist/provider-auth-runtime.js';
import { createInMemoryTrustedRunnerPeerIdentityVerifier } from '../dist/trusted-runner-peer-identity.js';
import { connectUnixProviderAuthIpc } from '../dist/provider-auth-ipc-unix.js';
import { createProviderAuthIpcFrame } from '../dist/provider-auth-ipc-protocol.js';

const digest = (letter) => `sha256:${letter.repeat(64)}`;

test('Runtime sidecar owns launch, relays bounded provider result, and owns cleanup', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-provider-sidecar-'));
  const socketPath = path.join(root, 'runtime.sock');
  const runtime = createInMemoryProviderAuthRuntime({ runtime_id: 'runtime-1', provider_ids: ['codex'], now: () => '2026-08-01T12:00:00.000Z' });
  const issued = await runtime.issueRef({ network_id: 'network-1', node_id: 'node-1', provider_id: 'codex', execution_id: 'execution-1', attempt: 1, audience: 'model-api', scope: [], secret: 'secret', issued_at: '2026-08-01T12:00:00.000Z', expires_at: '2026-08-01T13:00:00.000Z', human_authorized: true });
  assert.equal(issued.status, 'issued');
  const sidecar = createProviderAuthRuntimeIpcSidecar({ socket_path: socketPath, correlation_id: 'corr-sidecar', expected_peer_identity_digest: 'a'.repeat(64), verify_peer: createInMemoryTrustedRunnerPeerIdentityVerifier({ identity: { schema: 'zj-loop.trusted_runner_peer_identity.v1', platform: 'darwin', kind: 'process-audit', identity_digest: 'a'.repeat(64), process_id: 42 } }), runtime, auth_ref: issued.ref, contract_digest: digest('a'), adapter_contract_digest: digest('b'), now: () => '2026-08-01T12:00:00.000Z', invoke: async ({ task }) => ({ status: 'completed', success: true, pid: 42, exit_code: 0, signal: null, stdout: String(task.goal), stderr: '', provider_result: { schema: 'zj-loop.provider_result.v1', status: 'completed', success: true, exit_code: 0, signal: null, stdout_digest: digest('c'), stderr_digest: digest('d') } }) });
  try {
    await sidecar.start();
    const provider = createProviderRuntimeIpcProvider({ socket_path: socketPath, correlation_id: 'corr-sidecar', network_id: 'network-1', node_id: 'node-1', provider_runtime_id: 'runtime-1', provider_id: 'codex', execution_id: 'execution-1', attempt: 1, auth_ref_digest: issued.ref.ref_digest, contract_digest: digest('a'), adapter_contract_digest: digest('b') });
    const result = await provider.run({ cwd: '/tmp/worktree', prompt: 'inspect', executable: '/provider' });
    assert.equal(result.stdout, 'inspect');
    const cleanup = createProviderRuntimeIpcCleanupCoordinator({ socket_path: socketPath, correlation_id: 'corr-sidecar', handle: result.launch_handle, network_id: 'network-1', node_id: 'node-1', provider_id: 'codex', execution_id: 'execution-1', attempt: 1 });
    assert.equal((await cleanup()).status, 'cleaned');
  } finally { await sidecar.close(); await rm(root, { recursive: true, force: true }); }
});

test('Runtime sidecar relays a malformed invocation as an error and keeps the handle cleanable', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-provider-sidecar-invalid-'));
  const socketPath = path.join(root, 'runtime.sock');
  const runtime = createInMemoryProviderAuthRuntime({ runtime_id: 'runtime-invalid', provider_ids: ['codex'], now: () => '2026-08-01T12:00:00.000Z' });
  const issued = await runtime.issueRef({ network_id: 'network-invalid', node_id: 'node-invalid', provider_id: 'codex', execution_id: 'execution-invalid', attempt: 1, audience: 'model-api', scope: [], secret: 'secret', issued_at: '2026-08-01T12:00:00.000Z', expires_at: '2026-08-01T13:00:00.000Z', human_authorized: true });
  assert.equal(issued.status, 'issued');
  const sidecar = createProviderAuthRuntimeIpcSidecar({ socket_path: socketPath, correlation_id: 'corr-invalid', expected_peer_identity_digest: 'a'.repeat(64), verify_peer: createInMemoryTrustedRunnerPeerIdentityVerifier({ identity: { schema: 'zj-loop.trusted_runner_peer_identity.v1', platform: 'darwin', kind: 'process-audit', identity_digest: 'a'.repeat(64), process_id: 42 } }), runtime, auth_ref: issued.ref, contract_digest: digest('a'), adapter_contract_digest: digest('b'), now: () => '2026-08-01T12:00:00.000Z', invoke: async () => ({ status: 'completed', success: true, pid: 1, exit_code: 0, signal: null, stdout: '', stderr: '', provider_result: { malformed: true } }) });
  try {
    await sidecar.start();
    const provider = createProviderRuntimeIpcProvider({ socket_path: socketPath, correlation_id: 'corr-invalid', network_id: 'network-invalid', node_id: 'node-invalid', provider_runtime_id: 'runtime-invalid', provider_id: 'codex', execution_id: 'execution-invalid', attempt: 1, auth_ref_digest: issued.ref.ref_digest, contract_digest: digest('a'), adapter_contract_digest: digest('b') });
    await assert.rejects(provider.run({ cwd: '/tmp/worktree', prompt: 'invalid', executable: '/provider' }), /provider-auth-ipc-sidecar-invocation-failed/);
    const handle = provider.getLaunchHandle();
    assert.ok(handle);
    const cleanup = createProviderRuntimeIpcCleanupCoordinator({ socket_path: socketPath, correlation_id: 'corr-invalid', handle, network_id: 'network-invalid', node_id: 'node-invalid', provider_id: 'codex', execution_id: 'execution-invalid', attempt: 1 });
    assert.equal((await cleanup()).status, 'cleaned');
  } finally { await sidecar.close(); await rm(root, { recursive: true, force: true }); }
});

test('Runtime sidecar relays launch rejection before a handle exists', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-provider-sidecar-blocked-'));
  const socketPath = path.join(root, 'runtime.sock');
  const baseRuntime = createInMemoryProviderAuthRuntime({ runtime_id: 'runtime-blocked', provider_ids: ['codex'], now: () => '2026-08-01T12:00:00.000Z' });
  const issued = await baseRuntime.issueRef({ network_id: 'network-blocked', node_id: 'node-blocked', provider_id: 'codex', execution_id: 'execution-blocked', attempt: 1, audience: 'model-api', scope: [], secret: 'secret', issued_at: '2026-08-01T12:00:00.000Z', expires_at: '2026-08-01T13:00:00.000Z', human_authorized: true });
  assert.equal(issued.status, 'issued');
  const runtime = { ...baseRuntime, launch: async () => ({ status: 'blocked', reason: 'runtime-admission-blocked' }) };
  const sidecar = createProviderAuthRuntimeIpcSidecar({ socket_path: socketPath, correlation_id: 'corr-blocked', expected_peer_identity_digest: 'a'.repeat(64), verify_peer: createInMemoryTrustedRunnerPeerIdentityVerifier({ identity: { schema: 'zj-loop.trusted_runner_peer_identity.v1', platform: 'darwin', kind: 'process-audit', identity_digest: 'a'.repeat(64), process_id: 42 } }), runtime, auth_ref: issued.ref, contract_digest: digest('a'), adapter_contract_digest: digest('b'), now: () => '2026-08-01T12:00:00.000Z', invoke: async () => { throw new Error('must not invoke'); } });
  try {
    await sidecar.start();
    const provider = createProviderRuntimeIpcProvider({ socket_path: socketPath, correlation_id: 'corr-blocked', timeout_ms: 1_000, network_id: 'network-blocked', node_id: 'node-blocked', provider_runtime_id: 'runtime-blocked', provider_id: 'codex', execution_id: 'execution-blocked', attempt: 1, auth_ref_digest: issued.ref.ref_digest, contract_digest: digest('a'), adapter_contract_digest: digest('b') });
    await assert.rejects(provider.run({ cwd: '/tmp/worktree', prompt: 'blocked', executable: '/provider' }), /runtime-admission-blocked/);
  } finally { await sidecar.close(); await rm(root, { recursive: true, force: true }); }
});

test('Runtime sidecar rejects a replayed challenge nonce across connections', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-provider-sidecar-replay-'));
  const socketPath = path.join(root, 'runtime.sock');
  const runtime = createInMemoryProviderAuthRuntime({ runtime_id: 'runtime-replay', provider_ids: ['codex'], now: () => '2026-08-01T12:00:00.000Z' });
  const issued = await runtime.issueRef({ network_id: 'network-replay', node_id: 'node-replay', provider_id: 'codex', execution_id: 'execution-replay', attempt: 1, audience: 'model-api', scope: [], secret: 'secret', issued_at: '2026-08-01T12:00:00.000Z', expires_at: '2026-08-01T13:00:00.000Z', human_authorized: true });
  assert.equal(issued.status, 'issued');
  const sidecar = createProviderAuthRuntimeIpcSidecar({ socket_path: socketPath, correlation_id: 'corr-replay', expected_peer_identity_digest: 'a'.repeat(64), verify_peer: createInMemoryTrustedRunnerPeerIdentityVerifier({ identity: { schema: 'zj-loop.trusted_runner_peer_identity.v1', platform: 'darwin', kind: 'process-audit', identity_digest: 'a'.repeat(64), process_id: 42 } }), runtime, auth_ref: issued.ref, contract_digest: digest('a'), adapter_contract_digest: digest('b'), now: () => '2026-08-01T12:00:00.000Z', invoke: async () => ({ status: 'completed', success: true, pid: 42, exit_code: 0, signal: null, stdout: '', stderr: '', provider_result: { schema: 'zj-loop.provider_result.v1', status: 'completed', success: true, exit_code: 0, signal: null, stdout_digest: digest('c'), stderr_digest: digest('d') } }) });
  const frame = { correlation_id: 'corr-replay', sequence: 1, network_id: 'network-replay', node_id: 'node-replay', provider_runtime_id: 'runtime-replay', provider_id: 'codex', execution_id: 'execution-replay', attempt: 1, kind: 'challenge', nonce: 'replay-nonce', payload: { schema: 'zj-loop.provider_launch_request.v1', auth_ref_digest: issued.ref.ref_digest, contract_digest: digest('a'), adapter_contract_digest: digest('b'), task: { goal: 'replay' } } };
  const sendChallenge = async () => {
    const received = [];
    const connection = await connectUnixProviderAuthIpc({ socket_path: socketPath, correlation_id: 'corr-replay', on_frames: (frames) => received.push(...frames) });
    await connection.send(createProviderAuthIpcFrame(frame));
    await new Promise((resolve) => setTimeout(resolve, 20));
    connection.close();
    return received;
  };
  try {
    await sidecar.start();
    const first = await sendChallenge();
    assert.equal(first[0]?.kind, 'launch-accepted');
    const second = await sendChallenge();
    assert.equal(second[0]?.kind, 'error');
    assert.equal(second[0]?.payload?.code, 'provider-auth-ipc-challenge-replay');
  } finally { await sidecar.close(); await rm(root, { recursive: true, force: true }); }
});
