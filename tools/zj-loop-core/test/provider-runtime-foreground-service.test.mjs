import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createProviderRuntimeForegroundService } from '../dist/provider-runtime-foreground-service.js';

const digest = (value) => `sha256:${Buffer.from(value).toString('hex').padEnd(64, '0').slice(0, 64)}`;
const binding = { service_id: 'service-foreground', network_id: 'network-1', socket_path: '/tmp/runtime.sock', provider_id: 'codex', provider_executable: '/usr/bin/codex', working_directory: '/tmp', contract_digest: digest('contract'), adapter_contract_digest: digest('adapter'), runtime_binding: { runtime_identity_fingerprint: digest('identity'), runtime_manifest_digest: digest('manifest'), provider_capabilities_digest: digest('capabilities') }, process_identity_digest: digest('process') };

function launcher(readiness = { status: 'ready', socket_path: '/tmp/runtime.sock' }) {
  const calls = [];
  return { calls, value: { start: async () => { calls.push('start'); }, readiness: async () => { calls.push('readiness'); return readiness; }, close: async () => { calls.push('close'); } } };
}

test('Foreground service persists binding only after launcher readiness and removes it on stop', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-runtime-foreground-'));
  const file = path.join(root, 'binding.json');
  const fake = launcher();
  const service = createProviderRuntimeForegroundService({ launcher: fake.value, binding_path: file, binding, process_id: 4321, now: () => '2026-08-05T12:00:00.000Z' });
  const started = await service.start();
  assert.equal(started.status, 'started');
  assert.deepEqual(fake.calls, ['start', 'readiness']);
  assert.equal(JSON.parse(await readFile(file, 'utf8')).pid, 4321);
  assert.equal((await service.stop()).status, 'stopped');
  await assert.rejects(stat(file));
  assert.deepEqual(fake.calls, ['start', 'readiness', 'close']);
});

test('Foreground service closes and leaves no binding when readiness or binding persistence fails', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-runtime-foreground-blocked-'));
  const fake = launcher({ status: 'blocked', reason: 'provider-runtime-ipc-unavailable' });
  const service = createProviderRuntimeForegroundService({ launcher: fake.value, binding_path: path.join(root, 'binding.json'), binding });
  await assert.rejects(service.start(), /provider-runtime-ipc-unavailable/);
  assert.deepEqual(fake.calls, ['start', 'readiness', 'close']);
});
