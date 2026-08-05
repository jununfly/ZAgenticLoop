import assert from 'node:assert/strict';
import test from 'node:test';
import { createProviderAuthAuthorityBinding } from '../dist/provider-auth-authority-binding.js';
import { createInMemoryProviderAuthAuthorityProcessIdentityVerifier } from '../dist/provider-auth-authority-process-identity.js';
import { createProviderAuthAuthorityServiceLifecycle } from '../dist/provider-auth-authority-service-lifecycle.js';

const digest = (value) => `sha256:${Buffer.from(value).toString('hex').padEnd(64, '0').slice(0, 64)}`;
const binding = createProviderAuthAuthorityBinding({ service_id: 'authority-lifecycle', network_id: 'network-1', socket_path: '/tmp/authority.sock', authority_contract_digest: digest('contract'), state_store_identity_digest: digest('store'), state_store_path: '/tmp/state.db', process_identity_digest: digest('process'), pid: 1234, started_at: '2026-08-05T22:00:00.000Z' });

test('Authority lifecycle status requires exact process identity and socket readiness', async () => {
  const verifier = createInMemoryProviderAuthAuthorityProcessIdentityVerifier({ facts: { service_id: binding.service_id, pid: binding.pid, started_at: binding.started_at, process_identity_digest: binding.process_identity_digest } });
  const lifecycle = createProviderAuthAuthorityServiceLifecycle({ verifier, probe_socket: async () => true });
  assert.deepEqual(await lifecycle.status({ binding }), { status: 'ready', service_id: binding.service_id, pid: binding.pid, socket_path: binding.socket_path });
  const unavailable = createProviderAuthAuthorityServiceLifecycle({ verifier: createInMemoryProviderAuthAuthorityProcessIdentityVerifier({ available: false }), probe_socket: async () => true });
  assert.equal((await unavailable.status({ binding })).reason, 'provider-auth-authority-process-identity-unavailable');
});

test('Authority lifecycle stop never terminates an unverified process and reports bounded uncertainty', async () => {
  let terminated = 0;
  const unavailable = createProviderAuthAuthorityServiceLifecycle({ verifier: createInMemoryProviderAuthAuthorityProcessIdentityVerifier({ available: false }), probe_socket: async () => true });
  assert.equal((await unavailable.stop({ binding, terminate: async () => { terminated += 1; } })).status, 'blocked');
  assert.equal(terminated, 0);

  const verifier = createInMemoryProviderAuthAuthorityProcessIdentityVerifier({ facts: { service_id: binding.service_id, pid: binding.pid, started_at: binding.started_at, process_identity_digest: binding.process_identity_digest } });
  const lifecycle = createProviderAuthAuthorityServiceLifecycle({ verifier, probe_socket: async () => true });
  assert.equal((await lifecycle.stop({ binding, terminate: async () => { terminated += 1; }, wait_for_exit: async () => false })).status, 'outcome-uncertain');
  assert.equal(terminated, 1);
  assert.deepEqual(await lifecycle.stop({ binding, terminate: async () => { terminated += 1; }, wait_for_exit: async () => true }), { status: 'stopped', service_id: binding.service_id, pid: binding.pid });
});
