import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  classifyRealAgentDogfoodFailure,
  replayRealAgentDogfoodAttempt,
} from '../dist/real-agent-dogfood-replay.js';

const digest = (letter) => `sha256:${letter.repeat(64)}`;

test('maps deterministic failure classes to bounded lifecycle outcomes', () => {
  assert.deepEqual(classifyRealAgentDogfoodFailure('known-rejection'), { status: 'blocked', reason_code: 'known-rejection' });
  assert.deepEqual(classifyRealAgentDogfoodFailure('unverifiable-cleanup'), { status: 'outcome-uncertain', reason_code: 'unverifiable-cleanup' });
  assert.deepEqual(classifyRealAgentDogfoodFailure('provider-timeout'), { status: 'blocked', reason_code: 'provider-timeout' });
  assert.throws(() => classifyRealAgentDogfoodFailure('unknown'), /failure-class-invalid/);
});

test('same digest replay is idempotent while different digest conflicts', () => {
  const first = replayRealAgentDogfoodAttempt({ execution_id: 'execution-1', attempt: 1, result_digest: digest('a'), prior: null });
  assert.deepEqual(first, { status: 'recorded', execution_id: 'execution-1', attempt: 1, result_digest: digest('a') });
  assert.deepEqual(replayRealAgentDogfoodAttempt({ execution_id: 'execution-1', attempt: 1, result_digest: digest('a'), prior: first }), { status: 'idempotent', execution_id: 'execution-1', attempt: 1 });
  assert.deepEqual(replayRealAgentDogfoodAttempt({ execution_id: 'execution-1', attempt: 1, result_digest: digest('b'), prior: first }), { status: 'conflict', reason_code: 'attempt-digest-conflict' });
  assert.deepEqual(replayRealAgentDogfoodAttempt({ execution_id: 'execution-2', attempt: 2, result_digest: digest('b'), prior: first }), { status: 'new-attempt', execution_id: 'execution-2', attempt: 2 });
});
