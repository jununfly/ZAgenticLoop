import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_ISSUE_FIX_REQUEST_REPLAY_SCENARIOS,
  replayIssueFixRequestChain,
  runIssueFixRequestReplaySuite,
} from './issue-fix-request-e2e-replay.mjs';

test('Issue Fix Request replay reaches Fix PR through dispatcher and allowlisted consumer', () => {
  const replay = replayIssueFixRequestChain(
    DEFAULT_ISSUE_FIX_REQUEST_REPLAY_SCENARIOS.find((scenario) => scenario.name === 'ci-sweeper-fix-pr'),
  );

  assert.equal(replay.outcome, 'fix-pr');
  assert.deepEqual(replay.steps.map((step) => step.name), [
    'signal',
    'route-decision',
    'issue-fix-request',
    'fix-consumer-claim',
    'fix-pr',
  ]);
  assert.equal(replay.issueFixRequest.status, 'pr_opened');
});

test('Issue Fix Request replay covers duplicate denied and failed outcomes', () => {
  const suite = runIssueFixRequestReplaySuite();
  const outcomes = Object.fromEntries(suite.results.map((result) => [result.name, result.actual]));

  assert.equal(outcomes['ci-sweeper-duplicate'], 'duplicate');
  assert.equal(outcomes['activation-kind-denied'], 'denied');
  assert.equal(outcomes['dependency-sweeper-failed'], 'failed');
  assert.equal(suite.passed, true);
});

test('Issue Fix Request replay fixtures cover known fix consumers without making CI Sweeper the protocol', () => {
  const consumers = new Set(DEFAULT_ISSUE_FIX_REQUEST_REPLAY_SCENARIOS.map((scenario) => scenario.route.consumer));

  assert.deepEqual([...consumers].sort(), ['ci-sweeper', 'dependency-sweeper', 'pr-steward']);
});
