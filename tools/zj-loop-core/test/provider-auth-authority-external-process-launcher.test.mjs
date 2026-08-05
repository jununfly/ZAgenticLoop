import assert from 'node:assert/strict';
import test from 'node:test';
import { createProviderAuthAuthorityExternalProcessLauncher } from '../dist/provider-auth-authority-external-process-launcher.js';

function fakeProcess({ waitResult = { schema: 'zj-loop.local_process_adapter.v1', status: 'cancelled', success: false, pid: 4242, exit_code: null, signal: 'SIGTERM', stdout: '', stderr: '' }, wait = async () => waitResult } = {}) {
  const calls = { launch: [], cancel: 0 };
  return {
    calls,
    adapter: { async launch(spec) { calls.launch.push(spec); return { pid: 4242, stdin: { end() {} }, cancel() { calls.cancel += 1; }, wait }; } },
  };
}

test('Authority external launcher uses a bounded non-detached process and probes readiness', async () => {
  const fake = fakeProcess();
  const launcher = createProviderAuthAuthorityExternalProcessLauncher({ executable: '/usr/bin/node', args: ['-e', 'process.stdin.resume()'], cwd: '/tmp', socket_path: '/tmp/authority.sock', process_adapter: fake.adapter, probe_socket: async () => true });
  await launcher.start();
  assert.deepEqual(fake.calls.launch[0], { executable: '/usr/bin/node', args: ['-e', 'process.stdin.resume()'], cwd: '/tmp', env_allowlist: [], env: {}, max_stdout_bytes: 10 * 1024 * 1024, max_stderr_bytes: 10 * 1024 * 1024, timeout_ms: 900_000, termination_grace_ms: 5_000 });
  assert.deepEqual(await launcher.readiness(), { status: 'ready', socket_path: '/tmp/authority.sock' });
  await launcher.close();
  assert.equal(fake.calls.cancel, 1);
});

test('Authority external launcher reports unavailable readiness and prevents duplicate start', async () => {
  const fake = fakeProcess();
  const launcher = createProviderAuthAuthorityExternalProcessLauncher({ executable: '/usr/bin/node', args: [], cwd: '/tmp', socket_path: '/tmp/authority.sock', process_adapter: fake.adapter, probe_socket: async () => false });
  await launcher.start();
  assert.deepEqual(await launcher.readiness(), { status: 'blocked', reason: 'provider-auth-authority-external-ipc-unavailable' });
  await assert.rejects(() => launcher.start(), /already-started/);
  await launcher.close();
});

test('Authority external launcher maps a hanging child close to bounded uncertainty', async () => {
  const fake = fakeProcess({ wait: () => new Promise(() => {}) });
  const launcher = createProviderAuthAuthorityExternalProcessLauncher({ executable: '/usr/bin/node', args: [], cwd: '/tmp', socket_path: '/tmp/authority.sock', process_adapter: fake.adapter, close_timeout_ms: 5 });
  await launcher.start();
  await assert.rejects(() => launcher.close(), /external-close-timeout/);
  assert.equal(fake.calls.cancel, 1);
});
