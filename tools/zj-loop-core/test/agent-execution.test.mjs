import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NATIVE_AGENT_EXECUTION_STATUS,
  createNativeAgentExecution,
  transitionNativeAgentExecution,
} from '../dist/agent-execution.js';

const execution = () => createNativeAgentExecution({
  execution_id: 'exec-1',
  task_id: 'task-1',
  attempt: 1,
  agent_id: 'agent-1',
  task_digest: 'sha256:' + '1'.repeat(64),
  registration_digest: 'sha256:' + '2'.repeat(64),
  started_at: '2026-08-01T00:00:00.000Z',
});

const move = (current, status, extra = {}) => transitionNativeAgentExecution({
  execution: current,
  status,
  at: '2026-08-01T00:00:01.000Z',
  ...extra,
});

test('execution follows the bounded happy-path lifecycle and records transitions', () => {
  let item = execution();
  assert.equal(item.status, NATIVE_AGENT_EXECUTION_STATUS.received);
  for (const status of ['validated', 'dispatched', 'running', 'succeeded']) item = move(item, status);
  item = move(item, 'evidence-recorded', { evidence_refs: ['evidence:result-1'] });
  item = move(item, 'review-pending', { evidence_refs: ['evidence:result-1'] });
  item = move(item, 'accepted', { reason: 'human-accepted' });
  assert.equal(item.status, 'accepted');
  assert.equal(item.transitions.length, 7);
  assert.deepEqual(item.transitions.at(-1), { from: 'review-pending', to: 'accepted', at: '2026-08-01T00:00:01.000Z', reason: 'human-accepted' });
});

test('execution fail-closes blocked, failed, timed-out, and cancelled paths', () => {
  assert.equal(move(execution(), 'blocked', { reason: 'resource-isolation-missing' }).status, 'blocked');
  let failed = move(move(move(execution(), 'validated'), 'dispatched'), 'running');
  failed = move(failed, 'failed', { reason: 'provider-failed' });
  assert.equal(failed.status, 'failed');
  let cancelled = move(move(move(execution(), 'validated'), 'dispatched'), 'running');
  cancelled = move(cancelled, 'cancelled', { reason: 'human-cancelled' });
  assert.equal(cancelled.status, 'cancelled');
  assert.throws(() => move(execution(), 'timed-out'), { message: 'agent-execution-transition-invalid' });
});

test('execution rejects illegal transitions and requires evidence or reasons', () => {
  assert.throws(() => move(execution(), 'running'), { message: 'agent-execution-transition-invalid' });
  let succeeded = move(move(move(move(execution(), 'validated'), 'dispatched'), 'running'), 'succeeded');
  assert.throws(() => move(succeeded, 'evidence-recorded'), { message: 'agent-execution-evidence-required' });
  assert.throws(() => move(move(move(move(execution(), 'validated'), 'dispatched'), 'running'), 'failed'), { message: 'agent-execution-reason-required' });
  let terminal = move(execution(), 'blocked', { reason: 'blocked' });
  assert.throws(() => move(terminal, 'validated'), { message: 'agent-execution-terminal' });
  let pending = move(move(move(move(move(execution(), 'validated'), 'dispatched'), 'running'), 'succeeded'), 'evidence-recorded', { evidence_refs: ['evidence:1'] });
  pending = move(pending, 'review-pending', { evidence_refs: ['evidence:1'] });
  assert.throws(() => move(pending, 'accepted'), { message: 'agent-execution-reason-required' });
});
