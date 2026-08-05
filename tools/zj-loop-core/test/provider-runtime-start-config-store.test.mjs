import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readProviderRuntimeStartConfig } from '../dist/provider-runtime-start-config-store.js';

const digest = (value) => `sha256:${Buffer.from(value).toString('hex').padEnd(64, '0').slice(0, 64)}`;
const config = { schema: 'zj-loop.provider_runtime_start_config.v1', network_id: 'network-1', runtime_id: 'runtime-1', provider_ids: ['codex'], socket_path: '/tmp/runtime.sock', correlation_id: 'correlation-1', expected_peer_identity_digest: 'a'.repeat(64), provider_executable: '/usr/bin/codex', working_directory: '/tmp', contract_digest: digest('contract'), adapter_contract_digest: digest('adapter'), runtime_binding: { runtime_identity_fingerprint: digest('identity'), runtime_manifest_digest: digest('manifest'), provider_capabilities_digest: digest('capabilities') }, state_store_path: '/tmp/state.db', binding_path: '/tmp/binding.json' };

test('Runtime start config loader validates persisted config before returning it', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-runtime-config-store-'));
  const file = path.join(root, 'config.json');
  await writeFile(file, JSON.stringify(config));
  assert.deepEqual((await readProviderRuntimeStartConfig(file)).runtime_id, 'runtime-1');
  await writeFile(file, JSON.stringify({ ...config, token: 'secret' }));
  await assert.rejects(readProviderRuntimeStartConfig(file), /secret-field/);
  await assert.rejects(readProviderRuntimeStartConfig(path.join(root, 'missing.json')), /read-failed/);
});
