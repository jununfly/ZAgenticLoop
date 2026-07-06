import test from 'node:test';
import assert from 'node:assert/strict';

import {
  runRoadmapActivationReplaySuite,
} from './roadmap-activation-e2e-replay.mjs';

test('Daily Triage to Roadmap-Sliced Development activation replay is separate from Issue Fix Request', () => {
  const suite = runRoadmapActivationReplaySuite();
  const activation = suite.results.find((result) => result.name === 'activation-created').replay;

  assert.equal(suite.passed, true);
  assert.equal(activation.outcome, 'activation-request');
  assert.equal(activation.routeDecision.request_kind, 'activation-comment');
  assert.equal(activation.steps.some((step) => step.name === 'issue-fix-request'), false);
  assert.equal(activation.activation.fields.kind, 'zj-loop.activation-request');
});
