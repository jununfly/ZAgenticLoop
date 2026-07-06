import assert from 'node:assert/strict';
import test from 'node:test';

import { runDependencySweeperRouteReplaySuite } from './dependency-sweeper-route-e2e-replay.mjs';

const ROUTE_TABLE_PATH = 'zj-loop/zj-loop-route-table.yaml';

test('dependency alert creates verifier-backed Issue Fix Request for Dependency Sweeper', async () => {
  const suite = await runDependencySweeperRouteReplaySuite({ routeTablePath: ROUTE_TABLE_PATH });
  const result = suite.results.find((item) => item.name === 'patch-low-requested');
  const replay = result.replay;

  assert.equal(result.pass, true);
  assert.equal(replay.outcome, 'requested');
  assert.equal(replay.routeDecision.allowed, true);
  assert.equal(replay.routeDecision.route_id, 'dependency-sweeper');
  assert.equal(replay.routeDecision.request_kind, 'issue-fix-request');
  assert.equal(replay.routeDecision.target_consumer, 'dependency-sweeper');
  assert.equal(replay.issueFixRequest.status, 'requested');
  assert.equal(replay.issueFixRequest.requested_consumer.consumer_id, 'dependency-sweeper');
  assert.equal(replay.issueFixRequest.requested_consumer.capability, 'patch-dependency-fix');
  assert.deepEqual(replay.issueFixRequest.fix_scope.files_or_areas, ['package.json', 'package-lock.json']);
  assert.deepEqual(replay.issueFixRequest.fix_scope.non_goals, [
    'major upgrades',
    'high or critical vulnerability policy decisions',
    'auto-merge',
  ]);
  assert.deepEqual(replay.issueFixRequest.verification_gate.commands, ['npm ci', 'npm test']);
  assert.deepEqual(replay.steps.map((step) => step.name), [
    'dependency-alert',
    'route-decision',
    'issue-fix-request',
  ]);
});

test('dependency sweeper route allows minor medium alerts and duplicates existing active requests', async () => {
  const suite = await runDependencySweeperRouteReplaySuite({ routeTablePath: ROUTE_TABLE_PATH });
  const outcomes = Object.fromEntries(suite.results.map((result) => [result.name, result.actual]));

  assert.equal(suite.passed, true);
  assert.equal(outcomes['minor-medium-requested'], 'requested');
  assert.equal(outcomes['duplicate-active-request'], 'duplicate');
});

test('dependency sweeper route denies risky or non-main dependency alerts before request creation', async () => {
  const suite = await runDependencySweeperRouteReplaySuite({ routeTablePath: ROUTE_TABLE_PATH });
  const outcomes = Object.fromEntries(suite.results.map((result) => [result.name, result.actual]));

  assert.equal(outcomes['major-medium-denied'], 'denied');
  assert.equal(outcomes['patch-high-denied'], 'denied');
  assert.equal(outcomes['critical-cve-denied'], 'denied');
  assert.equal(outcomes['feature-branch-denied'], 'denied');

  for (const name of ['major-medium-denied', 'patch-high-denied', 'critical-cve-denied', 'feature-branch-denied']) {
    const replay = suite.results.find((result) => result.name === name).replay;
    assert.equal(replay.routeDecision.allowed, false);
    assert.equal(replay.issueFixRequest, null);
    assert.equal(replay.steps.some((step) => step.name === 'dependency-sweeper-claim'), false);
    assert.equal(replay.steps.some((step) => step.name === 'fix-pr'), false);
  }
});
