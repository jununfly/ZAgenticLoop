import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCodexInvocation, createCodexAgentProviderAdapter } from '../dist/codex-agent-provider-adapter.js';

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
