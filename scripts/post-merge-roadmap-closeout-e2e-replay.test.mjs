import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { runPostMergeRoadmapCloseoutReplaySuite } from './post-merge-roadmap-closeout-e2e-replay.mjs';

const ROUTE_TABLE_PATH = 'zj-loop/zj-loop-route-table.yaml';

test('merged roadmap PR signal reaches report-only evidence and dry-run closeout plan', async () => {
  const suite = await runPostMergeRoadmapCloseoutReplaySuite({ routeTablePath: ROUTE_TABLE_PATH });
  const result = suite.results.find((item) => item.name === 'valid-merged-roadmap-pr');
  const replay = result.replay;

  assert.equal(result.pass, true);
  assert.equal(replay.outcome, 'report-evidence');
  assert.equal(replay.routeDecision.allowed, true);
  assert.equal(replay.routeDecision.request_kind, 'report-only');
  assert.equal(replay.routeDecision.status, 'closed');
  assert.equal(replay.reportEvidence.evidence_store, 'GitHub pull request comment');
  assert.equal(replay.reportEvidence.side_effects.branch_deleted, false);
  assert.equal(replay.reportEvidence.side_effects.carrier_issue_closed, false);
  assert.equal(replay.closeoutPlan.status, 'dry-run');
  assert.deepEqual(
    replay.closeoutPlan.actions.map((action) => [action.name, action.status]),
    [
      ['delete_merged_branch', 'planned'],
      ['close_carrier_issue', 'planned'],
    ],
  );
  assert.equal(replay.steps.some((step) => step.name === 'github-side-effect'), false);
});

test('missing post-merge contract produces report evidence with no planned actions', async () => {
  const suite = await runPostMergeRoadmapCloseoutReplaySuite({ routeTablePath: ROUTE_TABLE_PATH });
  const result = suite.results.find((item) => item.name === 'missing-contract');
  const replay = result.replay;

  assert.equal(result.pass, true);
  assert.equal(replay.outcome, 'report-evidence');
  assert.equal(replay.routeDecision.allowed, true);
  assert.equal(replay.closeoutPlan.status, 'report-only');
  assert.equal(replay.closeoutPlan.reason, 'missing-contract');
  assert.deepEqual(replay.closeoutPlan.actions, []);
  assert.equal(replay.reportEvidence.closeout_plan.side_effects_executed, false);
});

test('disabled route denies before report evidence or closeout plan', async () => {
  const routeTableText = (await readFile(ROUTE_TABLE_PATH, 'utf8')).replace(
    /route_id: "post-merge-roadmap-closeout"\n    enabled: true/,
    'route_id: "post-merge-roadmap-closeout"\n    enabled: false',
  );
  const suite = await runPostMergeRoadmapCloseoutReplaySuite({ routeTableText });
  const result = suite.results.find((item) => item.name === 'valid-merged-roadmap-pr');
  const replay = result.replay;

  assert.equal(result.pass, false);
  assert.equal(replay.outcome, 'route-denied');
  assert.equal(replay.routeDecision.allowed, false);
  assert.equal(replay.routeDecision.reason, 'post-merge-roadmap-closeout-route-disabled');
  assert.equal(replay.closeoutPlan, null);
  assert.equal(replay.reportEvidence, null);
});

test('contract mismatch and unsafe repositories produce report evidence with report-only plans', async () => {
  const suite = await runPostMergeRoadmapCloseoutReplaySuite({ routeTablePath: ROUTE_TABLE_PATH });

  for (const name of ['branch-mismatch', 'fork-head-repository', 'unknown-head-repository']) {
    const result = suite.results.find((item) => item.name === name);
    const replay = result.replay;

    assert.equal(result.pass, true);
    assert.equal(replay.outcome, 'report-evidence');
    assert.equal(replay.routeDecision.allowed, true);
    assert.equal(replay.closeoutPlan.status, 'report-only');
    assert.deepEqual(replay.closeoutPlan.actions, []);
    assert.equal(replay.reportEvidence.side_effects.branch_deleted, false);
    assert.equal(replay.reportEvidence.side_effects.carrier_issue_closed, false);
  }
});
