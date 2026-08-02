import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInMemoryProviderAuthRuntime, providerAuthRefDigest, validateProviderAuthRef } from '../dist/provider-auth-runtime.js';

const clock = () => '2026-08-02T12:00:00.000Z';

test('ProviderAuthRuntime issues an opaque, node-bound ref without exposing secret in metadata', async () => {
  const runtime = createInMemoryProviderAuthRuntime({ runtime_id: 'provider-runtime-1', provider_ids: ['codex'], now: clock });
  const result = await runtime.issueRef({ network_id: 'network-1', node_id: 'node-1', provider_id: 'codex', execution_id: 'execution-1', attempt: 1, audience: 'model-api', scope: ['model:invoke'], secret: 'secret-value', issued_at: '2026-08-02T11:59:00.000Z', expires_at: '2026-08-02T13:00:00.000Z', human_authorized: true });
  assert.equal(result.status, 'issued');
  assert.equal(result.ref.ref_digest, providerAuthRefDigest(result.ref));
  assert.equal(JSON.stringify(result.ref).includes('secret-value'), false);
  assert.equal(validateProviderAuthRef({ ...result.ref, secret: 'secret-value' }).reason, 'provider-auth-ref-invalid');
  assert.equal(result.ref.execution_id, 'execution-1');
  assert.equal(result.ref.attempt, 1);
  const consumed = await runtime.consumeSecret({ ref: result.ref, network_id: 'network-1', node_id: 'node-1', provider_id: 'codex', execution_id: 'execution-1', attempt: 1, now: clock() });
  assert.deepEqual(consumed, { status: 'authorized', secret: 'secret-value' });
});

test('ProviderAuthRuntime blocks missing Human authorization, node drift, expiry, and revoked refs', async () => {
  const runtime = createInMemoryProviderAuthRuntime({ runtime_id: 'provider-runtime-1', provider_ids: ['codex'], now: clock });
  const denied = await runtime.issueRef({ network_id: 'network-1', node_id: 'node-1', provider_id: 'codex', execution_id: 'execution-1', attempt: 1, audience: 'model-api', scope: [], secret: 'secret', issued_at: '2026-08-02T11:59:00.000Z', expires_at: '2026-08-02T13:00:00.000Z', human_authorized: false });
  assert.deepEqual(denied, { status: 'blocked', reason: 'provider-auth-human-authorization-required' });
  const issued = await runtime.issueRef({ network_id: 'network-1', node_id: 'node-1', provider_id: 'codex', execution_id: 'execution-1', attempt: 1, audience: 'model-api', scope: [], secret: 'secret', issued_at: '2026-08-02T11:59:00.000Z', expires_at: '2026-08-02T12:01:00.000Z', human_authorized: true });
  assert.equal(issued.status, 'issued');
  assert.deepEqual(await runtime.verify({ ref: issued.ref, network_id: 'network-2', node_id: 'node-1', provider_id: 'codex', execution_id: 'execution-1', attempt: 1, now: clock() }), { status: 'blocked', reason: 'provider-auth-ref-binding-mismatch' });
  assert.deepEqual(await runtime.verify({ ref: issued.ref, network_id: 'network-1', node_id: 'node-1', provider_id: 'codex', execution_id: 'execution-1', attempt: 1, now: '2026-08-02T12:02:00.000Z' }), { status: 'blocked', reason: 'provider-auth-ref-expired' });
  assert.deepEqual(await runtime.revoke({ auth_ref_id: issued.ref.auth_ref_id }), { status: 'revoked' });
  assert.deepEqual(await runtime.consumeSecret({ ref: issued.ref, network_id: 'network-1', node_id: 'node-1', provider_id: 'codex', execution_id: 'execution-1', attempt: 1, now: clock() }), { status: 'blocked', reason: 'provider-auth-ref-invalid' });
});

test('ProviderAuthRuntime issues one-time launch handles and returns a secret-free cleanup proof', async () => {
  const runtime = createInMemoryProviderAuthRuntime({ runtime_id: 'provider-runtime-1', provider_ids: ['codex'], now: clock });
  const issued = await runtime.issueRef({ network_id: 'network-1', node_id: 'node-1', provider_id: 'codex', execution_id: 'execution-1', attempt: 1, audience: 'model-api', scope: ['model:invoke'], secret: 'secret-value', issued_at: '2026-08-02T11:59:00.000Z', expires_at: '2026-08-02T13:00:00.000Z', human_authorized: true });
  assert.equal(issued.status, 'issued');
  const launch = await runtime.launch({ ref: issued.ref, network_id: 'network-1', node_id: 'node-1', provider_id: 'codex', execution_id: 'execution-1', attempt: 1, contract_digest: 'sha256:' + 'a'.repeat(64), adapter_contract_digest: 'sha256:' + 'b'.repeat(64), issued_at: clock(), expires_at: '2026-08-02T13:00:00.000Z' });
  assert.equal(launch.status, 'launched');
  assert.equal(launch.handle.adapter_contract_digest, 'sha256:' + 'b'.repeat(64));
  const duplicate = await runtime.launch({ ref: issued.ref, network_id: 'network-1', node_id: 'node-1', provider_id: 'codex', execution_id: 'execution-1', attempt: 1, contract_digest: 'sha256:' + 'a'.repeat(64), adapter_contract_digest: 'sha256:' + 'b'.repeat(64), issued_at: clock(), expires_at: '2026-08-02T13:00:00.000Z' });
  assert.deepEqual(duplicate, { status: 'blocked', reason: 'provider-launch-handle-already-issued' });
  const cleanup = await runtime.cleanup({ handle: launch.handle, network_id: 'network-1', node_id: 'node-1', provider_id: 'codex', execution_id: 'execution-1', attempt: 1, cleaned_at: clock() });
  assert.equal(cleanup.status, 'cleaned');
  assert.equal(cleanup.proof.adapter_contract_digest, 'sha256:' + 'b'.repeat(64));
  assert.equal(JSON.stringify(cleanup.proof).includes('secret-value'), false);
  assert.equal((await runtime.consumeSecret({ ref: issued.ref, network_id: 'network-1', node_id: 'node-1', provider_id: 'codex', execution_id: 'execution-1', attempt: 1, now: clock() })).status, 'blocked');
  assert.deepEqual(await runtime.cleanup({ handle: launch.handle, network_id: 'network-1', node_id: 'node-1', provider_id: 'codex', execution_id: 'execution-1', attempt: 1, cleaned_at: clock() }), { status: 'blocked', reason: 'provider-launch-handle-invalid' });
});

test('ProviderAuthRuntime blocks a launch without an adapter contract digest', async () => {
  const runtime = createInMemoryProviderAuthRuntime({ runtime_id: 'provider-runtime-1', provider_ids: ['codex'], now: clock });
  const issued = await runtime.issueRef({ network_id: 'network-1', node_id: 'node-1', provider_id: 'codex', execution_id: 'execution-1', attempt: 1, audience: 'model-api', scope: [], secret: 'secret', issued_at: '2026-08-02T11:59:00.000Z', expires_at: '2026-08-02T13:00:00.000Z', human_authorized: true });
  assert.equal(issued.status, 'issued');
  assert.deepEqual(await runtime.launch({ ref: issued.ref, network_id: 'network-1', node_id: 'node-1', provider_id: 'codex', execution_id: 'execution-1', attempt: 1, contract_digest: 'sha256:' + 'a'.repeat(64), adapter_contract_digest: '', issued_at: clock(), expires_at: '2026-08-02T13:00:00.000Z' }), { status: 'blocked', reason: 'provider-launch-contract-invalid' });
});
