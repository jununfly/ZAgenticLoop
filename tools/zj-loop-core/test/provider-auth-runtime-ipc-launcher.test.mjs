import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createProviderAuthRuntimeIpcLauncher } from '../dist/provider-auth-runtime-ipc-launcher.js';
import { createProviderRuntimeIpcProvider } from '../dist/provider-auth-ipc-provider-client.js';
import { createProviderRuntimeIpcCleanupCoordinator } from '../dist/provider-auth-ipc-cleanup-client.js';
import { createInMemoryProviderAuthRuntime } from '../dist/provider-auth-runtime.js';
import { createInMemoryTrustedRunnerPeerIdentityVerifier } from '../dist/trusted-runner-peer-identity.js';

const digest = (value) => `sha256:${Buffer.from(value).toString('hex').padEnd(64, '0').slice(0, 64)}`;
const binding = {
  runtime_identity_fingerprint: digest('identity'),
  runtime_manifest_digest: digest('manifest'),
  provider_capabilities_digest: digest('capabilities'),
};

function processAdapter() {
  return {
    async launch(spec) {
      let resolve;
      const wait = new Promise((done) => { resolve = done; });
      return {
        pid: 4242,
        stdin: { end(value) { resolve({ schema: 'zj-loop.local_process_adapter.v1', status: 'completed', success: true, pid: 4242, exit_code: 0, signal: null, stdout: value, stderr: '' }); } },
        wait: () => wait,
        cancel() { resolve({ schema: 'zj-loop.local_process_adapter.v1', status: 'cancelled', success: false, pid: 4242, exit_code: null, signal: 'SIGTERM', stdout: '', stderr: '' }); },
      };
    },
  };
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-provider-launcher-'));
  const runtime = createInMemoryProviderAuthRuntime({ runtime_id: 'runtime-launcher', provider_ids: ['codex'], runtime_binding: binding, now: () => '2026-08-05T12:00:00.000Z' });
  const issued = await runtime.issueRef({ network_id: 'network-launcher', node_id: 'node-launcher', provider_id: 'codex', execution_id: 'execution-launcher', attempt: 1, audience: 'model-api', scope: [], secret: 'secret', issued_at: '2020-01-01T00:00:00.000Z', expires_at: '2099-01-01T00:00:00.000Z', human_authorized: true });
  assert.equal(issued.status, 'issued');
  const launcher = createProviderAuthRuntimeIpcLauncher({
    socket_path: path.join(root, 'runtime.sock'),
    correlation_id: 'launcher-correlation',
    expected_peer_identity_digest: 'a'.repeat(64),
    verify_peer: createInMemoryTrustedRunnerPeerIdentityVerifier({ identity: { schema: 'zj-loop.trusted_runner_peer_identity.v1', platform: 'darwin', kind: 'process-audit', identity_digest: 'a'.repeat(64), process_id: 42 } }),
    runtime,
    auth_ref: issued.ref,
    contract_digest: digest('contract'),
    adapter_contract_digest: digest('adapter'),
    runtime_binding: binding,
    provider_executable: '/provider',
    working_directory: '/tmp',
    process_adapter: processAdapter(),
  });
  return { root, launcher, issued };
}

test('provider runtime launcher reuses one service for separately bound executions', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-provider-launcher-multi-'));
  const runtime = createInMemoryProviderAuthRuntime({ runtime_id: 'runtime-multi', provider_ids: ['codex'], runtime_binding: binding, now: () => '2020-01-01T00:00:00.000Z' });
  const issue = (execution_id) => runtime.issueRef({ network_id: 'network-multi', node_id: 'node-multi', provider_id: 'codex', execution_id, attempt: 1, audience: 'model-api', scope: [], secret: 'secret', issued_at: '2020-01-01T00:00:00.000Z', expires_at: '2099-01-01T00:00:00.000Z', human_authorized: true });
  const first = await issue('execution-multi-1');
  const second = await issue('execution-multi-2');
  assert.equal(first.status, 'issued');
  assert.equal(second.status, 'issued');
  const refs = new Map([[first.ref.ref_digest, first.ref], [second.ref.ref_digest, second.ref]]);
  const launcher = createProviderAuthRuntimeIpcLauncher({
    socket_path: path.join(root, 'runtime.sock'),
    correlation_id: 'launcher-multi',
    expected_peer_identity_digest: 'a'.repeat(64),
    verify_peer: createInMemoryTrustedRunnerPeerIdentityVerifier({ identity: { schema: 'zj-loop.trusted_runner_peer_identity.v1', platform: 'darwin', kind: 'process-audit', identity_digest: 'a'.repeat(64), process_id: 42 } }),
    runtime,
    resolve_auth_ref: async ({ auth_ref_digest }) => refs.get(auth_ref_digest),
    contract_digest: digest('contract'),
    adapter_contract_digest: digest('adapter'),
    runtime_binding: binding,
    provider_executable: '/provider',
    working_directory: '/tmp',
    process_adapter: processAdapter(),
  });
  try {
    await launcher.start();
    for (const issued of [first, second]) {
      const provider = createProviderRuntimeIpcProvider({ socket_path: path.join(root, 'runtime.sock'), correlation_id: 'launcher-multi', network_id: 'network-multi', node_id: 'node-multi', provider_runtime_id: 'runtime-multi', provider_id: 'codex', execution_id: issued.ref.execution_id, attempt: 1, auth_ref: issued.ref, auth_ref_digest: issued.ref.ref_digest, contract_digest: digest('contract'), adapter_contract_digest: digest('adapter'), runtime_binding: binding });
      const result = await provider.run({ cwd: '/tmp', prompt: issued.ref.execution_id, executable: '/provider' });
      assert.equal(result.status, 'completed');
      const cleanup = createProviderRuntimeIpcCleanupCoordinator({ socket_path: path.join(root, 'runtime.sock'), correlation_id: 'launcher-multi', handle: result.launch_handle, network_id: 'network-multi', node_id: 'node-multi', provider_id: 'codex', execution_id: issued.ref.execution_id, attempt: 1 });
      assert.equal((await cleanup()).status, 'cleaned');
    }
  } finally { await launcher.close(); await rm(root, { recursive: true, force: true }); }
});

test('provider runtime launcher reports socket readiness and relays a real provider invocation', async () => {
  const f = await fixture();
  try {
    await f.launcher.start();
    assert.deepEqual(await f.launcher.readiness(), { status: 'ready', socket_path: path.join(f.root, 'runtime.sock') });
    const provider = createProviderRuntimeIpcProvider({ socket_path: path.join(f.root, 'runtime.sock'), correlation_id: 'launcher-correlation', network_id: 'network-launcher', node_id: 'node-launcher', provider_runtime_id: 'runtime-launcher', provider_id: 'codex', execution_id: 'execution-launcher', attempt: 1, auth_ref_digest: f.issued.ref.ref_digest, contract_digest: digest('contract'), adapter_contract_digest: digest('adapter'), runtime_binding: binding });
    const result = await provider.run({ cwd: '/tmp', prompt: 'inspect', executable: '/provider' });
    assert.equal(result.status, 'completed');
    assert.equal(result.stdout, 'inspect');
    const cleanup = createProviderRuntimeIpcCleanupCoordinator({ socket_path: path.join(f.root, 'runtime.sock'), correlation_id: 'launcher-correlation', handle: result.launch_handle, network_id: 'network-launcher', node_id: 'node-launcher', provider_id: 'codex', execution_id: 'execution-launcher', attempt: 1 });
    assert.equal((await cleanup()).status, 'cleaned');
  } finally { await f.launcher.close(); await rm(f.root, { recursive: true, force: true }); }
});

test('provider runtime launcher close removes the socket and is idempotent', async () => {
  const f = await fixture();
  await f.launcher.start();
  await f.launcher.close();
  assert.deepEqual(await f.launcher.readiness(), { status: 'blocked', reason: 'provider-runtime-ipc-unavailable' });
  await f.launcher.close();
  await rm(f.root, { recursive: true, force: true });
});
