import assert from 'node:assert/strict';
import test from 'node:test';
import { createProviderAuthAuthorityBinding } from '../dist/provider-auth-authority-binding.js';
import { createInMemoryProviderAuthAuthorityProcessIdentityVerifier } from '../dist/provider-auth-authority-process-identity.js';

const digest = (value) => `sha256:${Buffer.from(value).toString('hex').padEnd(64, '0').slice(0, 64)}`;
const binding = createProviderAuthAuthorityBinding({ service_id: 'authority-identity', network_id: 'network-1', socket_path: '/tmp/authority.sock', authority_contract_digest: digest('contract'), state_store_identity_digest: digest('store'), state_store_path: '/tmp/state.db', process_identity_digest: digest('process'), pid: 1234, started_at: '2026-08-05T22:00:00.000Z' });

test('Authority process verifier accepts exact binding and rejects PID reuse or identity drift', async () => {
  const verifier = createInMemoryProviderAuthAuthorityProcessIdentityVerifier({ facts: { service_id: binding.service_id, pid: binding.pid, started_at: binding.started_at, process_identity_digest: binding.process_identity_digest } });
  assert.equal((await verifier.verify({ binding })).status, 'verified');
  assert.equal((await verifier.verify({ binding: { ...binding, pid: 4321 } })).reason, 'provider-auth-authority-process-identity-mismatch');
  assert.equal((await verifier.verify({ binding: { ...binding, process_identity_digest: digest('other') } })).reason, 'provider-auth-authority-process-identity-mismatch');
});

test('Authority process verifier reports unavailable identity without allowing a fallback', async () => {
  const verifier = createInMemoryProviderAuthAuthorityProcessIdentityVerifier({ available: false });
  assert.deepEqual(await verifier.verify({ binding }), { status: 'blocked', reason: 'provider-auth-authority-process-identity-unavailable' });
});
