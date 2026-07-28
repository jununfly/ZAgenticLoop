import assert from 'node:assert/strict';
import test from 'node:test';
import { validatePublishedCoreRuntime } from './validate-published-core-runtime.mjs';

test('published core runtime gate passes the exact package and read-only CLI checks', async () => {
  const calls = [];
  const result = await validatePublishedCoreRuntime({
    tempRoot: '/tmp/zj-loop-test-cache',
    runner: async (file, args) => {
      calls.push({ file, args });
      if (file === 'npm') return { stdout: '0.1.34\n', stderr: '' };
      const command = args.at(-2);
      return { stdout: `${command} - help\n`, stderr: '' };
    },
  });

  assert.equal(result.schema, 'zj-loop.published_core_runtime_gate.v1');
  assert.equal(result.status, 'passed');
  assert.equal(result.requested_version, '0.1.34');
  assert.equal(result.resolved_version, '0.1.34');
  assert.equal(result.side_effects_executed, false);
  assert.equal(calls.length, 3);
  assert.equal(calls[0].file, 'npm');
  assert.equal(calls[1].file, 'npx');
  assert.equal(calls[2].file, 'npx');
  assert.ok(calls.every(({ args }) => args.includes('--registry')));
});

test('published core runtime gate blocks a registry version mismatch', async () => {
  const result = await validatePublishedCoreRuntime({
    tempRoot: '/tmp/zj-loop-test-cache',
    runner: async (file) =>
      file === 'npm'
        ? { stdout: '0.1.33\n', stderr: '' }
        : { stdout: 'help\n', stderr: '' },
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.resolved_version, null);
  assert.equal(result.checks[0].status, 'failed');
});

test('published core runtime gate rejects a version that only contains the requested version', async () => {
  const result = await validatePublishedCoreRuntime({
    tempRoot: '/tmp/zj-loop-test-cache',
    runner: async (file) =>
      file === 'npm'
        ? { stdout: '0.1.340\n', stderr: '' }
        : { stdout: 'help\n', stderr: '' },
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.checks[0].status, 'failed');
});

test('published core runtime gate blocks a CLI failure', async () => {
  const result = await validatePublishedCoreRuntime({
    tempRoot: '/tmp/zj-loop-test-cache',
    runner: async (file, args) => {
      if (file === 'npm') return { stdout: '0.1.34\n', stderr: '' };
      if (args.at(-2) === 'zj-loop-agent-local') return { stdout: '', stderr: 'failed' };
      return { stdout: 'zj-loop-roadmap-activation - help\n', stderr: '' };
    },
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.checks[1].status, 'failed');
});

test('published core runtime gate redacts the temporary cache path', async () => {
  const cacheRoot = '/tmp/zj-loop-secret-cache';
  const result = await validatePublishedCoreRuntime({
    tempRoot: cacheRoot,
    runner: async (file) =>
      file === 'npm'
        ? { stdout: '', stderr: `cache failure at ${cacheRoot}` }
        : { stdout: 'help\n', stderr: '' },
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.checks[0].output_excerpt.includes(cacheRoot), false);
  assert.equal(result.checks[0].output_excerpt.includes('[redacted]'), true);
});
