import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BOUNDED_LOOP_TASK_SCHEMA,
  boundedLoopTaskDigest,
  createBoundedLoopTask,
  validateBoundedLoopTask,
} from '../dist/agent-task.js';

const task = (overrides = {}) => createBoundedLoopTask({
  task_id: 'task-1',
  execution_id: 'exec-1',
  attempt: 1,
  task_kind: 'loop.task',
  objective: 'Produce a bounded result',
  success_criteria: ['result exists', 'result is verified'],
  input_artifact_refs: ['sha256:' + '1'.repeat(64)],
  dependency_refs: ['evidence:task-0'],
  resource_isolation: { status: 'declared', bindings: [{ resource_id: 'repo-1', strategy: 'git-branch', evidence_refs: ['evidence:isolation-1'] }] },
  budget: { timeout_ms: 30_000, max_iterations: 3 },
  expected_evidence_kinds: ['result', 'verification'],
  idempotency_key: 'task-1:exec-1:attempt-1',
  cancellation: { mode: 'cooperative', token: 'cancel-1' },
  ...overrides,
});

test('Bounded Loop task is canonical, digest-bound, and explicitly scoped', () => {
  const item = task();
  assert.equal(item.schema, BOUNDED_LOOP_TASK_SCHEMA);
  assert.match(item.task_digest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(validateBoundedLoopTask(item).status, 'valid');
  assert.equal(item.task_digest, boundedLoopTaskDigest(item));
});

test('Bounded Loop task normalizes lists and rejects missing execution bounds', () => {
  const item = task({ success_criteria: ['z', 'a', 'z'] });
  assert.deepEqual(item.success_criteria, ['a', 'z']);
  assert.equal(validateBoundedLoopTask({ ...item, budget: { timeout_ms: 0, max_iterations: 0 } }).status, 'blocked');
  assert.equal(validateBoundedLoopTask({ ...item, resource_isolation: { status: 'declared', bindings: [] } }).status, 'blocked');
  assert.equal(validateBoundedLoopTask({ ...item, cancellation: { mode: 'none', token: '' } }).status, 'blocked');
});

test('Bounded Loop task rejects unscoped or provider-specific fields', () => {
  const item = task();
  assert.equal(validateBoundedLoopTask({ ...item, provider: 'codex' }).status, 'blocked');
  assert.equal(validateBoundedLoopTask({ ...item, input_artifact_refs: [] }).status, 'blocked');
  assert.equal(validateBoundedLoopTask({ ...item, task_digest: 'sha256:' + '0'.repeat(64) }).status, 'blocked');
});
