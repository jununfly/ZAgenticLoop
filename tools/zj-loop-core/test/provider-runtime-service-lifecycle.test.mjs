import test from 'node:test';
import assert from 'node:assert/strict';
import { createProviderRuntimeServiceBinding } from '../dist/provider-runtime-service-binding.js';
import { createInMemoryProviderRuntimeProcessIdentityVerifier } from '../dist/provider-runtime-process-identity.js';
import { createProviderRuntimeServiceLifecycle } from '../dist/provider-runtime-service-lifecycle.js';

const digest = (value) => `sha256:${Buffer.from(value).toString('hex').padEnd(64, '0').slice(0, 64)}`;
const binding = createProviderRuntimeServiceBinding({ service_id: 'service-lifecycle', network_id: 'network-1', socket_path: '/tmp/runtime.sock', provider_id: 'codex', provider_executable: '/usr/bin/codex', working_directory: '/tmp', contract_digest: digest('contract'), adapter_contract_digest: digest('adapter'), runtime_binding: { runtime_identity_fingerprint: digest('identity'), runtime_manifest_digest: digest('manifest'), provider_capabilities_digest: digest('capabilities') }, process_identity_digest: digest('process'), pid: 1234, started_at: '2026-08-05T12:00:00.000Z' });
const verifier = createInMemoryProviderRuntimeProcessIdentityVerifier({ facts: { service_id: binding.service_id, pid: binding.pid, started_at: binding.started_at, process_identity_digest: binding.process_identity_digest } });

test('Runtime status requires process identity and socket readiness', async () => {
  const lifecycle = createProviderRuntimeServiceLifecycle({ verifier, probe_socket: async () => true });
  assert.deepEqual(await lifecycle.status({ binding }), { status: 'ready', service_id: binding.service_id, pid: binding.pid, socket_path: binding.socket_path });
  const unavailable = createProviderRuntimeServiceLifecycle({ verifier: createInMemoryProviderRuntimeProcessIdentityVerifier({ available: false }), probe_socket: async () => true });
  assert.equal((await unavailable.status({ binding })).reason, 'provider-runtime-process-identity-unavailable');
});

test('Runtime stop never terminates an unverified PID and waits for bounded shutdown', async () => {
  let terminated = 0;
  const lifecycle = createProviderRuntimeServiceLifecycle({ verifier, probe_socket: async () => true });
  const uncertain = await lifecycle.stop({ binding, terminate: async () => { terminated += 1; }, wait_for_exit: async () => false });
  assert.equal(terminated, 1);
  assert.deepEqual(uncertain, { status: 'outcome-uncertain', reason: 'provider-runtime-ipc-still-ready' });
  const blocked = await createProviderRuntimeServiceLifecycle({ verifier: createInMemoryProviderRuntimeProcessIdentityVerifier({ available: false }) }).stop({ binding, terminate: async () => { terminated += 1; } });
  assert.equal(terminated, 1);
  assert.deepEqual(blocked, { status: 'blocked', reason: 'provider-runtime-process-identity-unavailable' });
});
