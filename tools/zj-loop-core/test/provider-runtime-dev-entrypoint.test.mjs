import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createDevelopmentProviderRuntime } from '../dist/provider-runtime-dev-entrypoint.js';

const digest = (value) => `sha256:${Buffer.from(value).toString('hex').padEnd(64, '0').slice(0, 64)}`;

function config(root, overrides = {}) {
  return {
    profile: 'development-local',
    network_id: 'dev-network',
    runtime_id: 'dev-runtime',
    provider_id: 'codex',
    node_id: 'dev-node',
    execution_id: 'dev-execution',
    attempt: 1,
    socket_path: path.join(root, 'provider-runtime.sock'),
    binding_path: path.join(root, 'provider-runtime-binding.json'),
    auth_ref_path: path.join(root, 'provider-runtime-auth-ref.json'),
    provider_executable: '/usr/bin/true',
    working_directory: root,
    provider_secret: 'test-only-secret',
    ...overrides,
  };
}

test('development Provider Runtime rejects every profile except development-local', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-dev-runtime-'));
  assert.throws(
    () => createDevelopmentProviderRuntime(config(root, { profile: 'production' })),
    /provider-runtime-dev-profile-required/,
  );
});

test('development Provider Runtime starts a real IPC socket and writes verifiable bindings', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-dev-runtime-'));
  const runtime = createDevelopmentProviderRuntime(config(root), {
    peer_identity_digest: 'a'.repeat(64),
    peer_process_id: null,
  });
  const started = await runtime.start();
  assert.equal(started.status, 'started');
  assert.equal(started.binding.schema, 'zj-loop.provider_runtime_service_binding.v1');
  assert.equal(started.dev_binding.schema, 'zj-loop.provider_runtime_dev_binding.v1');
  assert.equal(started.dev_binding.profile, 'development-local');
  assert.equal(started.dev_binding.correlation_id, 'dev-runtime:dev');
  assert.match(started.dev_binding.auth_ref.ref_digest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(JSON.parse(await readFile(config(root).auth_ref_path, 'utf8')).auth_ref.ref_digest, started.dev_binding.auth_ref.ref_digest);
  await stat(config(root).socket_path);
  await runtime.close();
  await assert.rejects(stat(config(root).socket_path));
  await assert.rejects(stat(config(root).binding_path));
  await assert.rejects(stat(path.join(root, 'provider-runtime-dev-binding.json')));
});
