import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createProviderRuntimeServiceBinding, persistProviderRuntimeServiceBinding, readProviderRuntimeServiceBinding, validateProviderRuntimeServiceBinding } from '../dist/provider-runtime-service-binding.js';

const digest = (value) => `sha256:${Buffer.from(value).toString('hex').padEnd(64, '0').slice(0, 64)}`;
const binding = { runtime_identity_fingerprint: digest('identity'), runtime_manifest_digest: digest('manifest'), provider_capabilities_digest: digest('capabilities') };

test('Runtime service binding is secret-free, content-addressed, and persisted with private permissions', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-runtime-binding-'));
  const file = path.join(root, 'runtime', 'binding.json');
  const value = createProviderRuntimeServiceBinding({ service_id: 'service-1', network_id: 'network-1', socket_path: path.join(root, 'runtime.sock'), provider_id: 'codex', provider_executable: '/usr/bin/codex', working_directory: '/tmp', contract_digest: digest('contract'), adapter_contract_digest: digest('adapter'), runtime_binding: binding, process_identity_digest: digest('process'), pid: 1234, started_at: '2026-08-05T12:00:00.000Z' });
  assert.equal(validateProviderRuntimeServiceBinding(value).status, 'valid');
  assert.equal(JSON.stringify(value).includes('secret'), false);
  await persistProviderRuntimeServiceBinding(file, value);
  assert.deepEqual(await readProviderRuntimeServiceBinding(file), value);
  assert.equal((await stat(file)).mode & 0o777, 0o600);
  await rm(root, { recursive: true, force: true });
});

test('Runtime service binding rejects digest drift and unknown fields', () => {
  const value = createProviderRuntimeServiceBinding({ service_id: 'service-2', network_id: 'network-2', socket_path: '/tmp/runtime.sock', provider_id: 'codex', provider_executable: '/usr/bin/codex', working_directory: '/tmp', contract_digest: digest('contract'), adapter_contract_digest: digest('adapter'), runtime_binding: binding, process_identity_digest: digest('process'), pid: 1234, started_at: '2026-08-05T12:00:00.000Z' });
  assert.equal(validateProviderRuntimeServiceBinding({ ...value, binding_digest: digest('wrong') }).status, 'blocked');
  assert.equal(validateProviderRuntimeServiceBinding({ ...value, extra: true }).status, 'blocked');
});
