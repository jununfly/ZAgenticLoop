import test from 'node:test';
import assert from 'node:assert/strict';
import { createProviderRuntimeServiceBinding } from '../dist/provider-runtime-service-binding.js';
import { createInMemoryProviderRuntimeProcessIdentityVerifier } from '../dist/provider-runtime-process-identity.js';

const digest = (value) => `sha256:${Buffer.from(value).toString('hex').padEnd(64, '0').slice(0, 64)}`;
const binding = createProviderRuntimeServiceBinding({ service_id: 'service-identity', network_id: 'network-identity', socket_path: '/tmp/runtime.sock', provider_id: 'codex', provider_executable: '/usr/bin/codex', working_directory: '/tmp', contract_digest: digest('contract'), adapter_contract_digest: digest('adapter'), runtime_binding: { runtime_identity_fingerprint: digest('identity'), runtime_manifest_digest: digest('manifest'), provider_capabilities_digest: digest('capabilities') }, process_identity_digest: digest('process'), pid: 1234, started_at: '2026-08-05T12:00:00.000Z' });

test('Runtime process verifier accepts the exact service identity and rejects PID reuse or identity drift', async () => {
  const verifier = createInMemoryProviderRuntimeProcessIdentityVerifier({ facts: { service_id: 'service-identity', pid: 1234, started_at: '2026-08-05T12:00:00.000Z', process_identity_digest: digest('process') } });
  assert.equal((await verifier.verify({ binding })).status, 'verified');
  assert.equal((await verifier.verify({ binding: { ...binding, pid: 4321 } })).reason, 'provider-runtime-process-identity-mismatch');
  assert.equal((await verifier.verify({ binding: { ...binding, process_identity_digest: digest('other') } })).reason, 'provider-runtime-process-identity-mismatch');
});
