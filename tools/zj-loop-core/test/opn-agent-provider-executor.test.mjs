import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBoundedLoopTask } from '../dist/agent-task.js';
import { createProviderBackedNativeAgentExecutor } from '../dist/opn-agent-adapter.js';
import { createRetryBoundedLoopTask } from '../dist/opn-agent-runner-cli.js';

const task = createBoundedLoopTask({ task_id: 'task-1', execution_id: 'execution-1', attempt: 1, task_kind: 'loop.task', objective: 'inspect repository', success_criteria: ['result exists'], input_artifact_refs: ['sha256:' + 'a'.repeat(64)], dependency_refs: [], resource_isolation: { status: 'not-applicable', bindings: [] }, budget: { timeout_ms: 30000, max_iterations: 1 }, expected_evidence_kinds: ['result'], idempotency_key: 'task-1:execution-1:1', cancellation: { mode: 'cooperative', token: 'cancel:execution-1' } });

test('failed retry task creates a fresh execution binding without leaking protocol fields', () => {
  const retry = createRetryBoundedLoopTask(task);
  assert.notEqual(retry.execution_id, task.execution_id);
  assert.equal(retry.attempt, 2);
  assert.notEqual(retry.idempotency_key, task.idempotency_key);
  assert.equal(retry.task_digest.startsWith('sha256:'), true);
});

for (const provider_kind of ['codex', 'workbuddy-code']) test(`${provider_kind} provider is invoked through the provider-neutral Agent executor`, async () => {
  const calls = [];
  const executor = createProviderBackedNativeAgentExecutor({ provider_kind, cwd: '/tmp/opn-task', provider: { async run(request) { calls.push(request); return { status: 'completed', success: true }; } }, prompt: (value) => `Execute: ${value.objective}` });
  assert.deepEqual(await executor(task), { status: 'succeeded', evidence_refs: ['provider-result-execution-1'] });
  assert.equal(calls[0].cwd, '/tmp/opn-task');
  assert.equal(calls[0].prompt, 'Execute: inspect repository');
  if (provider_kind === 'codex') assert.equal(calls[0].mode, 'read-only');
  else assert.equal(calls[0].mode, undefined);
});

test('provider timeout becomes blocked and never claims Agent success', async () => {
  const executor = createProviderBackedNativeAgentExecutor({ provider_kind: 'codex', cwd: '/tmp/opn-task', provider: { async run() { return { status: 'timed-out', success: false }; } } });
  assert.deepEqual(await executor(task), { status: 'blocked', reason: 'provider-timed-out', evidence_refs: undefined });
});
