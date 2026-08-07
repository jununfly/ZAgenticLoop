import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createLocalProcessAdapter } from '../dist/local-process-adapter.js';

const node = process.execPath;

async function tempCwd() {
  return mkdtemp(path.join(os.tmpdir(), 'zj-local-process-'));
}

test('local process adapter launches structured argv, pipes stdin, and isolates environment', async () => {
  const cwd = await tempCwd();
  const adapter = createLocalProcessAdapter();
  const handle = await adapter.launch({
    executable: node,
    args: ['-e', "process.stdin.setEncoding('utf8'); process.stdin.on('data', d => process.stdout.write(process.env.VISIBLE + ':' + (process.env.HIDDEN || 'missing') + ':' + d))"],
    cwd,
    env_allowlist: ['VISIBLE'],
    env: { VISIBLE: 'allowed' },
    max_stdout_bytes: 1024,
    max_stderr_bytes: 1024,
    timeout_ms: 1000,
    termination_grace_ms: 100,
  });
  handle.stdin.end('payload');
  const result = await handle.wait();
  assert.equal(result.status, 'completed');
  assert.equal(result.exit_code, 0);
  assert.equal(result.stdout, 'allowed:missing:payload');
  assert.equal(result.stderr, '');
  assert.equal(typeof result.pid, 'number');
});

test('local process adapter rejects shell command strings and relative cwd before spawn', async () => {
  const adapter = createLocalProcessAdapter();
  await assert.rejects(() => adapter.launch({
    executable: 'node -e "process.exit(1)"', args: [], cwd: '.', env_allowlist: [], env: {},
    max_stdout_bytes: 1024, max_stderr_bytes: 1024, timeout_ms: 1000, termination_grace_ms: 100,
  }), { message: 'local-process-executable-must-be-absolute' });
  await assert.rejects(() => adapter.launch({
    executable: node, args: [], cwd: '.', env_allowlist: [], env: {},
    max_stdout_bytes: 1024, max_stderr_bytes: 1024, timeout_ms: 1000, termination_grace_ms: 100,
  }), { message: 'local-process-cwd-must-be-absolute' });
});

test('local process adapter converts a missing executable into a structured spawn failure', async () => {
  const cwd = await tempCwd();
  const adapter = createLocalProcessAdapter();
  const handle = await adapter.launch({
    executable: path.join(cwd, 'missing-provider.exe'), args: [], cwd, env_allowlist: [], env: {},
    max_stdout_bytes: 1024, max_stderr_bytes: 1024, timeout_ms: 1000, termination_grace_ms: 100,
  });
  const result = await handle.wait();
  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'spawn-failed');
  assert.equal(result.success, false);
});

test('local process adapter rejects env values outside the declared allowlist', async () => {
  const cwd = await tempCwd();
  const adapter = createLocalProcessAdapter();
  await assert.rejects(() => adapter.launch({
    executable: node, args: [], cwd, env_allowlist: [], env: { SECRET: 'nope' },
    max_stdout_bytes: 1024, max_stderr_bytes: 1024, timeout_ms: 1000, termination_grace_ms: 100,
  }), { message: 'local-process-env-not-allowlisted' });
});

test('local process adapter fails closed when stdout exceeds its bound', async () => {
  const cwd = await tempCwd();
  const adapter = createLocalProcessAdapter();
  const handle = await adapter.launch({
    executable: node,
    args: ['-e', "process.stdout.write('x'.repeat(32))"],
    cwd,
    env_allowlist: [],
    env: {},
    max_stdout_bytes: 8,
    max_stderr_bytes: 1024,
    timeout_ms: 1000,
    termination_grace_ms: 100,
  });
  const result = await handle.wait();
  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'stdout-limit-exceeded');
  assert.equal(result.success, false);
});

test('local process adapter reports timeout only after the child has exited', async () => {
  const cwd = await tempCwd();
  const adapter = createLocalProcessAdapter();
  const handle = await adapter.launch({
    executable: node,
    args: ['-e', 'setInterval(() => {}, 1000)'],
    cwd,
    env_allowlist: [],
    env: {},
    max_stdout_bytes: 1024,
    max_stderr_bytes: 1024,
    timeout_ms: 25,
    termination_grace_ms: 100,
  });
  const result = await handle.wait();
  assert.equal(result.status, 'timed-out');
  assert.equal(result.reason, 'timeout');
  assert.equal(result.success, false);
  assert.equal(result.exit_code, null);
  assert.equal(result.signal, 'SIGTERM');
});

test('local process adapter cancellation is fail-closed and waits for process close', async () => {
  const cwd = await tempCwd();
  const adapter = createLocalProcessAdapter();
  const handle = await adapter.launch({
    executable: node,
    args: ['-e', 'setInterval(() => {}, 1000)'],
    cwd,
    env_allowlist: [],
    env: {},
    max_stdout_bytes: 1024,
    max_stderr_bytes: 1024,
    timeout_ms: 1000,
    termination_grace_ms: 100,
  });
  handle.cancel();
  const result = await handle.wait();
  assert.equal(result.status, 'cancelled');
  assert.equal(result.reason, 'cancelled');
  assert.equal(result.success, false);
});
