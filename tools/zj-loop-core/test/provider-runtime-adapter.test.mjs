import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createProviderRuntimeAdapterContract, providerRuntimeAdapterContractDigest, validateProviderResult, validateProviderRuntimeAdapterContract } from '../dist/provider-runtime-adapter.js';

const digest = (letter) => `sha256:${letter.repeat(64)}`;

test('adapter contract has a fixed invocation identity and rejects drift or extra fields', () => {
  const contract = createProviderRuntimeAdapterContract({ adapter_id: 'codex', adapter_version: '1.2.3', binary_digest: digest('a'), argv_policy_digest: digest('b') });
  assert.equal(validateProviderRuntimeAdapterContract(contract).status, 'valid');
  assert.match(providerRuntimeAdapterContractDigest(contract), /^sha256:[0-9a-f]{64}$/);
  assert.equal(validateProviderRuntimeAdapterContract({ ...contract, adapter_version: '1.2.4' }).reason, 'provider-runtime-adapter-contract-invalid');
  assert.equal(validateProviderRuntimeAdapterContract({ ...contract, extra: true }).reason, 'provider-runtime-adapter-contract-invalid');
});

test('ProviderResult is bounded and fail-closed', () => {
  const base = { schema: 'zj-loop.provider_result.v1', status: 'completed', success: true, exit_code: 0, signal: null, stdout_digest: digest('a'), stderr_digest: digest('b'), result: '{"ok":true}', usage_metadata: { input_tokens: 3 }, evidence_refs: ['sha256:ref'] };
  assert.equal(validateProviderResult(base).status, 'valid');
  assert.equal(validateProviderResult({ ...base, result: 'x'.repeat(64 * 1024 + 1) }).reason, 'provider-result-bounded-result-invalid');
  assert.equal(validateProviderResult({ ...base, status: 'failed' }).reason, 'provider-result-success-mismatch');
  assert.equal(validateProviderResult({ ...base, credential: 'secret' }).reason, 'provider-result-invalid');
});
