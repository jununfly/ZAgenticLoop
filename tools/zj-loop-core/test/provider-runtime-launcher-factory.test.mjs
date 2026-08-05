import test from 'node:test';
import assert from 'node:assert/strict';
import { createMacOSProviderRuntimeLauncher } from '../dist/provider-runtime-launcher-factory.js';

const digest = (value) => `sha256:${Buffer.from(value).toString('hex').padEnd(64, '0').slice(0, 64)}`;
const config = { schema: 'zj-loop.provider_runtime_start_config.v1', network_id: 'network-1', runtime_id: 'runtime-1', provider_ids: ['codex'], socket_path: '/tmp/runtime.sock', correlation_id: 'correlation-1', expected_peer_identity_digest: 'a'.repeat(64), provider_executable: '/usr/bin/codex', working_directory: '/tmp', contract_digest: digest('contract'), adapter_contract_digest: digest('adapter'), runtime_binding: { runtime_identity_fingerprint: digest('identity'), runtime_manifest_digest: digest('manifest'), provider_capabilities_digest: digest('capabilities') }, state_store_path: '/tmp/state.db', binding_path: '/tmp/binding.json' };

test('macOS launcher factory binds provider runtime, resolver, contracts, and peer verifier', { skip: process.platform !== 'darwin' }, () => {
  const runtime = { inspect: async () => ({ status: 'available', runtime_id: 'runtime-1', provider_ids: ['codex'] }), issueRef: async () => ({ status: 'blocked', reason: 'blocked' }), verify: async () => ({ status: 'blocked', reason: 'blocked' }), revoke: async () => ({ status: 'blocked', reason: 'blocked' }), launch: async () => ({ status: 'blocked', reason: 'blocked' }), cleanup: async () => ({ status: 'blocked', reason: 'blocked' }), consumeSecret: async () => ({ status: 'blocked', reason: 'blocked' }) };
  const launcher = createMacOSProviderRuntimeLauncher({ config, runtime, resolver: { resolve: async () => undefined }, macos_helper_path: '/tmp/helper', macos_helper_digest: digest('helper') });
  assert.equal(typeof launcher.start, 'function');
  assert.equal(typeof launcher.readiness, 'function');
  assert.equal(typeof launcher.close, 'function');
});

test('macOS launcher factory rejects construction off macOS instead of weakening peer verification', { skip: process.platform === 'darwin' }, () => {
  assert.throws(() => createMacOSProviderRuntimeLauncher({ config, runtime: {}, resolver: { resolve: async () => undefined }, macos_helper_path: '/tmp/helper', macos_helper_digest: digest('helper') }), /platform-unsupported/);
});
