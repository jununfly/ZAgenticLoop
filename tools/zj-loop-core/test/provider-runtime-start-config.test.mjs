import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProviderRuntimeStartConfig } from '../dist/provider-runtime-start-config.js';

const digest = (value) => `sha256:${Buffer.from(value).toString('hex').padEnd(64, '0').slice(0, 64)}`;
const config = { schema: 'zj-loop.provider_runtime_start_config.v1', network_id: 'network-1', runtime_id: 'runtime-1', provider_ids: ['codex'], socket_path: '/tmp/runtime.sock', correlation_id: 'correlation-1', expected_peer_identity_digest: 'a'.repeat(64), provider_executable: '/usr/bin/codex', working_directory: '/tmp', contract_digest: digest('contract'), adapter_contract_digest: digest('adapter'), runtime_binding: { runtime_identity_fingerprint: digest('identity'), runtime_manifest_digest: digest('manifest'), provider_capabilities_digest: digest('capabilities') }, state_store_path: '/tmp/state.db', binding_path: '/tmp/binding.json' };

test('Runtime start config validates only absolute, secret-free service configuration', () => {
  const result = validateProviderRuntimeStartConfig(config);
  assert.equal(result.status, 'valid');
  assert.deepEqual(result.config.provider_ids, ['codex']);
  assert.equal(validateProviderRuntimeStartConfig({ ...config, secret: 'must-not-be-here' }).reason, 'provider-runtime-start-config-secret-field');
  assert.equal(validateProviderRuntimeStartConfig({ ...config, socket_path: 'relative.sock' }).reason, 'provider-runtime-start-config-invalid');
});

test('Runtime start config requires the macOS helper path and digest as a pair', () => {
  assert.equal(validateProviderRuntimeStartConfig({ ...config, macos_helper_path: '/tmp/helper' }).reason, 'provider-runtime-start-config-invalid');
  assert.equal(validateProviderRuntimeStartConfig({ ...config, macos_helper_path: '/tmp/helper', macos_helper_digest: digest('helper') }).status, 'valid');
});
