import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  runRoadmapActivationReplaySuite,
} from './roadmap-activation-e2e-replay.mjs';

const ROUTE_TABLE_PATH = 'zj-loop/zj-loop-route-table.yaml';

test('Daily Triage to Roadmap-Sliced Development activation replay is separate from Issue Fix Request', async () => {
  const suite = await runRoadmapActivationReplaySuite({ routeTablePath: ROUTE_TABLE_PATH });
  const activation = suite.results.find((result) => result.name === 'activation-created').replay;

  assert.equal(suite.passed, true);
  assert.equal(activation.outcome, 'activation-request');
  assert.equal(activation.routeDecision.request_kind, 'activation-comment');
  assert.equal(activation.routeDecision.allowed, true);
  assert.equal(activation.routeDecision.guards.route_enabled, true);
  assert.equal(activation.steps.some((step) => step.name === 'issue-fix-request'), false);
  assert.equal(activation.activation.fields.kind, 'zj-loop.activation-request');
});

test('activation replay denies route when dogfood route table disables Roadmap-Sliced Development', async () => {
  const routeTableText = await readFile(ROUTE_TABLE_PATH, 'utf8');
  const disabledRouteTableText = routeTableText.replace(
    /route_id: "roadmap-sliced-development"\n    enabled: true/,
    'route_id: "roadmap-sliced-development"\n    enabled: false',
  );
  const suite = await runRoadmapActivationReplaySuite({
    routeTableText: disabledRouteTableText,
    scenarios: [{
      name: 'activation-route-disabled',
      commandText: '/zj-loop start roadmap-sliced-development',
      requestedByPermission: 'write',
      sourceIssue: 324,
      expectOutcome: 'route-denied',
    }],
  });
  const replay = suite.results[0].replay;

  assert.equal(suite.passed, true);
  assert.equal(replay.routeDecision.allowed, false);
  assert.equal(replay.routeDecision.reason, 'roadmap-activation-route-disabled');
  assert.equal(replay.activation, null);
});
