import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  DEFAULT_REPLAY_SCENARIOS,
  replayCiSweeperDogfood,
  runReplaySuite,
} from './ci-sweeper-e2e-replay.mjs';

const ROUTE_TABLE_PATH = 'zj-loop/zj-loop-route-table.yaml';

async function routeTableText() {
  return readFile(ROUTE_TABLE_PATH, 'utf8');
}

test('e2e replay reaches repair-pr when route dispatches and all sweeper gates pass', async () => {
  const replay = replayCiSweeperDogfood({
    routeTableText: await routeTableText(),
    failures: DEFAULT_REPLAY_SCENARIOS.find((scenario) => scenario.name === 'repair-pr').failures,
    sweeperResult: {
      repairDiff: true,
      repairOutcome: 'success',
      validateOutcome: 'success',
      auditOutcome: 'success',
    },
  });

  assert.equal(replay.outcome, 'repair-pr');
  assert.equal(replay.routeDecision.dispatch, true);
  assert.deepEqual(replay.steps.map((step) => step.name), [
    'daily-triage-signal',
    'route-table-decision',
    'ci-sweeper-dispatch',
    'ci-sweeper-outcome',
  ]);
});

test('e2e replay reaches escalation-issue when repair output is not gate-backed', async () => {
  const replay = replayCiSweeperDogfood({
    routeTableText: await routeTableText(),
    failures: DEFAULT_REPLAY_SCENARIOS.find((scenario) => scenario.name === 'escalation-issue').failures,
    sweeperResult: {
      repairDiff: true,
      repairOutcome: 'success',
      validateOutcome: 'failure',
      auditOutcome: 'success',
    },
  });

  assert.equal(replay.outcome, 'escalation-issue');
  assert.equal(replay.steps.at(-1).validate_outcome, 'failure');
});

test('e2e replay returns duplicate-request before dispatching CI Sweeper', async () => {
  const scenario = DEFAULT_REPLAY_SCENARIOS.find((item) => item.name === 'duplicate-request');
  const replay = replayCiSweeperDogfood({
    routeTableText: await routeTableText(),
    failures: scenario.failures,
    existingRequests: scenario.existingRequests,
    sweeperResult: scenario.sweeperResult,
  });

  assert.equal(replay.outcome, 'duplicate-request');
  assert.equal(replay.routeDecision.dispatch, false);
  assert.equal(replay.steps.some((step) => step.name === 'ci-sweeper-dispatch'), false);
});

test('e2e replay returns route-denied for generated CI Sweeper branches', async () => {
  const scenario = DEFAULT_REPLAY_SCENARIOS.find((item) => item.name === 'route-denied-generated-branch');
  const replay = replayCiSweeperDogfood({
    routeTableText: await routeTableText(),
    failures: scenario.failures,
    sweeperResult: scenario.sweeperResult,
  });

  assert.equal(replay.outcome, 'route-denied');
  assert.equal(replay.routeDecision.reason, 'generated-ci-sweeper-branch');
});

test('default e2e replay suite is fully passing against the dogfood route table', async () => {
  const suite = await runReplaySuite({ routeTablePath: ROUTE_TABLE_PATH });

  assert.equal(suite.passed, true);
  assert.deepEqual(
    suite.results.map((result) => [result.name, result.actual]),
    DEFAULT_REPLAY_SCENARIOS.map((scenario) => [scenario.name, scenario.expectOutcome]),
  );
});
