import { test } from 'node:test';
import assert from 'node:assert/strict';

import { replayCompletionAlignmentCorpus } from './completion-alignment-replay.mjs';

test('completion alignment replay corpus covers hard stops and recovery without writes', () => {
  const result = replayCompletionAlignmentCorpus();

  assert.equal(result.schema, 'zj-loop.completion_replay_corpus.v1');
  assert.equal(result.status, 'passed');
  assert.equal(result.scenario_count, 6);
  assert.equal(result.provider_calls, 0);
  assert.equal(result.writes, 0);
  assert.equal(result.side_effects_executed, false);
  assert.deepEqual(result.results.map((item) => item.name), ['pass', 'stale', 'blocked', 'regression', 'recovery', 'duplicate']);
  assert.ok(result.results.every((item) => item.pass));
});

test('recovery replay retains one deterministic resume anchor', () => {
  const result = replayCompletionAlignmentCorpus();
  const recovery = result.results.find((item) => item.name === 'recovery');

  assert.equal(recovery?.evidence.hard_stop_resume_anchor, 'resume:orch-replay');
  assert.equal(recovery?.evidence.resume_anchor, 'resume:orch-replay');
});
