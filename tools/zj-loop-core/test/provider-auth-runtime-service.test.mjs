import test from 'node:test';
import assert from 'node:assert/strict';
import { createProviderAuthRuntimeServiceAdapter } from '../dist/provider-auth-runtime-service.js';
import { createInMemoryProviderAuthRuntime } from '../dist/provider-auth-runtime.js';

const digest = (value) => `sha256:${Buffer.from(value).toString('hex').padEnd(64, '0').slice(0, 64)}`;
const binding = { runtime_identity_fingerprint: digest('identity'), runtime_manifest_digest: digest('manifest'), provider_capabilities_digest: digest('capabilities') };

test('service-only ProviderAuthRuntime verifies resolver refs and cannot issue or consume secrets', async () => {
  const authority = createInMemoryProviderAuthRuntime({ runtime_id: 'runtime-service', provider_ids: ['codex'], runtime_binding: binding, now: () => '2026-08-05T12:00:00.000Z' });
  const issued = await authority.issueRef({ network_id: 'network-service', node_id: 'node-service', provider_id: 'codex', execution_id: 'execution-service', attempt: 1, audience: 'model-api', scope: [], secret: 'secret', issued_at: '2026-08-05T12:00:00.000Z', expires_at: '2099-01-01T00:00:00.000Z', human_authorized: true });
  assert.equal(issued.status, 'issued');
  let revoked = false;
  const runtime = createProviderAuthRuntimeServiceAdapter({ runtime_id: 'runtime-service', provider_ids: ['codex'], runtime_binding: binding, resolver: { resolve: async ({ auth_ref_digest }) => auth_ref_digest === issued.ref.ref_digest ? issued.ref : undefined }, revoke_ref: async ({ auth_ref_id }) => { revoked = auth_ref_id === issued.ref.auth_ref_id; return revoked ? { status: 'revoked' } : { status: 'blocked', reason: 'ref-not-found' }; } });
  assert.equal((await runtime.issueRef({ network_id: 'network-service', node_id: 'node-service', provider_id: 'codex', execution_id: 'execution-service', attempt: 1, audience: 'model-api', scope: [], secret: 'secret', issued_at: '2026-08-05T12:00:00.000Z', expires_at: '2099-01-01T00:00:00.000Z', human_authorized: true })).status, 'blocked');
  assert.equal((await runtime.consumeSecret({ ref: issued.ref, network_id: 'network-service', node_id: 'node-service', provider_id: 'codex', execution_id: 'execution-service', attempt: 1 })).status, 'blocked');
  const launch = await runtime.launch({ ref: issued.ref, network_id: 'network-service', node_id: 'node-service', provider_id: 'codex', execution_id: 'execution-service', attempt: 1, contract_digest: digest('contract'), adapter_contract_digest: digest('adapter'), runtime_binding: binding, issued_at: '2026-08-05T12:00:00.000Z', expires_at: issued.ref.expires_at });
  assert.equal(launch.status, 'launched');
  const cleanup = await runtime.cleanup({ handle: launch.handle, network_id: 'network-service', node_id: 'node-service', provider_id: 'codex', execution_id: 'execution-service', attempt: 1, cleaned_at: '2026-08-05T12:00:01.000Z' });
  assert.equal(cleanup.status, 'cleaned');
  assert.equal(revoked, true);
});
