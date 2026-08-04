import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCodexInvocation, createCodexAgentProviderAdapter, validateCodexExecutionModeBinding, validateCodexWriteScope } from '../dist/codex-agent-provider-adapter.js';

test('Codex extension builds the fixed read-only invocation without shell composition', () => {
  const invocation = buildCodexInvocation({ executable: '/opt/codex/bin/codex', cwd: '/tmp/task' });
  assert.deepEqual(invocation, {
    executable: '/opt/codex/bin/codex',
    args: ['exec', '--json', '--ephemeral', '--sandbox', 'read-only', '--ask-for-approval', 'never', '--cd', '/tmp/task'],
    cwd: '/tmp/task',
  });
});

test('Codex extension delegates one bounded prompt to the provider-neutral process adapter', async () => {
  const calls = [];
  const adapter = createCodexAgentProviderAdapter({
    process_adapter: {
      async launch(spec) {
        calls.push(spec);
        return { pid: 42, stdin: { end(value) { calls.push({ stdin: value }); } }, cancel() {}, async wait() { return { schema: 'zj-loop.local_process_adapter.v1', status: 'completed', success: true, pid: 42, exit_code: 0, signal: null, stdout: '{"type":"task.completed"}\n', stderr: '' }; } };
      },
    },
    executable: '/opt/codex/bin/codex',
  });
  const result = await adapter.run({
    cwd: '/tmp/task',
    prompt: 'Review the repository',
    env_allowlist: ['CODEX_HOME'],
    env: { CODEX_HOME: '/tmp/codex' },
    timeout_ms: 5000,
    termination_grace_ms: 100,
    max_stdout_bytes: 1024,
    max_stderr_bytes: 1024,
  });
  assert.equal(result.status, 'completed');
  assert.deepEqual(result.invocation.args, ['exec', '--json', '--ephemeral', '--sandbox', 'read-only', '--ask-for-approval', 'never', '--cd', '/tmp/task']);
  assert.equal(calls[0].cwd, '/tmp/task');
  assert.deepEqual(calls[0].args, result.invocation.args);
  assert.deepEqual(calls[1], { stdin: 'Review the repository' });
});

test('Codex extension builds an explicit write-enabled invocation without changing the read-only default', () => {
  const invocation = buildCodexInvocation({ executable: '/opt/codex/bin/codex', cwd: '/tmp/task', mode: 'write-enabled' });
  assert.deepEqual(invocation.args, ['exec', '--json', '--ephemeral', '--sandbox', 'workspace-write', '--ask-for-approval', 'never', '--cd', '/tmp/task']);
  assert.deepEqual(buildCodexInvocation({ executable: '/opt/codex/bin/codex', cwd: '/tmp/task' }).args, ['exec', '--json', '--ephemeral', '--sandbox', 'read-only', '--ask-for-approval', 'never', '--cd', '/tmp/task']);
});

test('Codex write scope accepts only the exact test file and a clean commit on the dogfood baseline', () => {
  assert.deepEqual(validateCodexWriteScope({
    allowed_files: ['tools/zj-loop-core/test/native-opn-tracer.test.mjs'],
    changed_files: ['tools/zj-loop-core/test/native-opn-tracer.test.mjs'],
    uncommitted_files: [],
    commit_parent: 'a'.repeat(40),
    baseline_commit: 'a'.repeat(40),
    diff_check_passed: true,
  }), { status: 'valid' });
});

test('Codex write scope blocks extra files, dirty state, drifted parent, or diff errors', () => {
  const base = {
    allowed_files: ['tools/zj-loop-core/test/native-opn-tracer.test.mjs'],
    changed_files: ['tools/zj-loop-core/test/native-opn-tracer.test.mjs'],
    uncommitted_files: [],
    commit_parent: 'a'.repeat(40),
    baseline_commit: 'a'.repeat(40),
    diff_check_passed: true,
  };
  assert.deepEqual(validateCodexWriteScope({ ...base, changed_files: [...base.changed_files, 'README.md'] }), { status: 'blocked', reason: 'write-scope-file-drift' });
  assert.deepEqual(validateCodexWriteScope({ ...base, uncommitted_files: ['tools/zj-loop-core/test/native-opn-tracer.test.mjs'] }), { status: 'blocked', reason: 'write-scope-dirty' });
  assert.deepEqual(validateCodexWriteScope({ ...base, commit_parent: 'b'.repeat(40) }), { status: 'blocked', reason: 'write-scope-parent-drift' });
  assert.deepEqual(validateCodexWriteScope({ ...base, diff_check_passed: false }), { status: 'blocked', reason: 'write-scope-diff-check' });
});

test('Codex execution mode binding accepts only the exact admitted argv', () => {
  const invocation = buildCodexInvocation({ executable: '/opt/codex/bin/codex', cwd: '/tmp/task', mode: 'write-enabled' });
  assert.deepEqual(validateCodexExecutionModeBinding({ mode: 'write-enabled', admitted_args: invocation.args, invocation_args: invocation.args }), { status: 'valid' });
  assert.deepEqual(validateCodexExecutionModeBinding({ mode: 'write-enabled', admitted_args: buildCodexInvocation({ executable: '/opt/codex/bin/codex', cwd: '/tmp/task' }).args, invocation_args: invocation.args }), { status: 'blocked', reason: 'execution-mode-argv-mismatch' });
});
