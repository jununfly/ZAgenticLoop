import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildWorkBuddyCodeInvocation, createWorkBuddyCodeProviderAdapter } from '../dist/workbuddy-code-provider-adapter.js';

test('WorkBuddy Code adapter builds a fixed read-only non-interactive invocation', () => {
  assert.deepEqual(buildWorkBuddyCodeInvocation({ executable: '/Applications/WorkBuddy.app/Contents/Resources/app.asar.unpacked/cli/bin/codebuddy', cwd: '/tmp/task', session_id: 'zj-opn-agent-1' }), {
    executable: '/Applications/WorkBuddy.app/Contents/Resources/app.asar.unpacked/cli/bin/codebuddy',
    args: ['--print', '--output-format', 'json', '--tools', 'Read', '--permission-mode', 'dontAsk', '--no-session-persistence', '--session-id', 'zj-opn-agent-1'],
    cwd: '/tmp/task',
    session_id: 'zj-opn-agent-1',
  });
});

test('WorkBuddy Code adapter passes the bounded prompt as one argv value', async () => {
  const calls = [];
  const adapter = createWorkBuddyCodeProviderAdapter({ executable: '/opt/workbuddy/codebuddy', session_id: 'zj-opn-agent-1', process_adapter: { async launch(spec) { calls.push(spec); return { pid: 41, stdin: { end() {} }, cancel() {}, async wait() { return { schema: 'zj-loop.local_process_adapter.v1', status: 'completed', success: true, pid: 41, exit_code: 0, signal: null, stdout: '{"result":"ok"}', stderr: '' }; } }; } } });
  const result = await adapter.run({ cwd: '/tmp/task', prompt: 'inspect', env_allowlist: [], env: {}, timeout_ms: 1000, termination_grace_ms: 100, max_stdout_bytes: 1024, max_stderr_bytes: 1024 });
  assert.equal(result.provider, 'workbuddy-code');
  assert.equal(result.status, 'completed');
  assert.deepEqual(calls[0].args, ['--print', '--output-format', 'json', '--tools', 'Read', '--permission-mode', 'dontAsk', '--no-session-persistence', '--session-id', 'zj-opn-agent-1', 'inspect']);
});

test('WorkBuddy Code adapter rejects empty prompts', async () => {
  const adapter = createWorkBuddyCodeProviderAdapter({ executable: '/opt/workbuddy/codebuddy', session_id: 'zj-opn-agent-1', process_adapter: { launch() { throw new Error('must-not-launch'); } } });
  await assert.rejects(() => adapter.run({ cwd: '/tmp/task', prompt: ' ', env_allowlist: [], env: {}, timeout_ms: 1000, termination_grace_ms: 100, max_stdout_bytes: 1024, max_stderr_bytes: 1024 }), /workbuddy-code-prompt-required/);
});

test('WorkBuddy Code adapter requires a scoped session identity', () => {
  assert.throws(() => buildWorkBuddyCodeInvocation({ executable: '/opt/workbuddy/codebuddy', cwd: '/tmp/task', session_id: 'user session' }), /workbuddy-code-session-id-invalid/);
});
