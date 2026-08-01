import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createExecutionLifecycle,
  transitionExecutionLifecycle,
} from '../dist/execution-lifecycle-gate.js';

const digest = (letter) => 'sha256:' + letter.repeat(64);
const base = { network_id: 'network-1', execution_id: 'execution-1', attempt: 1, outcome_digest: digest('a') };

test('ExecutionLifecycleGate requires verification, review handoff, and Human acceptance in order', () => {
  let lifecycle = createExecutionLifecycle(base);
  assert.equal(lifecycle.status, 'provider-completed');
  lifecycle = transitionExecutionLifecycle({ lifecycle, to: 'task-verified', verification_digest: digest('b') });
  lifecycle = transitionExecutionLifecycle({ lifecycle, to: 'review-pending', review_handoff_digest: digest('c') });
  lifecycle = transitionExecutionLifecycle({ lifecycle, to: 'completed', human_acceptance_digest: digest('d'), actor_role: 'human' });
  assert.equal(lifecycle.status, 'completed');
});

test('ExecutionLifecycleGate rejects skipped states and non-Human completion', () => {
  const lifecycle = createExecutionLifecycle(base);
  assert.throws(() => transitionExecutionLifecycle({ lifecycle, to: 'completed', human_acceptance_digest: digest('d'), actor_role: 'agent' }), { message: 'execution-lifecycle-transition-invalid' });
  const verified = transitionExecutionLifecycle({ lifecycle, to: 'task-verified', verification_digest: digest('b') });
  assert.throws(() => transitionExecutionLifecycle({ lifecycle: verified, to: 'completed', human_acceptance_digest: digest('d'), actor_role: 'human' }), { message: 'execution-lifecycle-transition-invalid' });
});
