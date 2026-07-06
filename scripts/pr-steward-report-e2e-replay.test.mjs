import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { runPrStewardReportReplaySuite } from './pr-steward-report-e2e-replay.mjs';

const ROUTE_TABLE_PATH = 'zj-loop/zj-loop-route-table.yaml';

test('pull request events reach PR Steward report evidence without side effects', async () => {
  const suite = await runPrStewardReportReplaySuite({ routeTablePath: ROUTE_TABLE_PATH });
  const result = suite.results.find((item) => item.name === 'review-requested');
  const replay = result.replay;

  assert.equal(result.pass, true);
  assert.equal(replay.outcome, 'report-evidence');
  assert.equal(replay.routeDecision.allowed, true);
  assert.equal(replay.routeDecision.route_id, 'pr-steward-report');
  assert.equal(replay.routeDecision.request_kind, 'report-only');
  assert.equal(replay.routeDecision.target_consumer, 'pr-steward');
  assert.equal(replay.routeDecision.status, 'closed');
  assert.equal(replay.reportEvidence.evidence_store, 'zj-loop/pr-steward-state.md');
  assert.equal(replay.prStewardReport.status, 'watch');
  assert.equal(replay.prStewardReport.side_effects_executed, false);
  assert.deepEqual(replay.reportEvidence.side_effects, {
    issue_fix_request_created: false,
    activation_request_created: false,
    workflow_dispatched: false,
    consumer_work_started: false,
    pr_comment_created: false,
    label_changed: false,
    rebase_started: false,
    merge_started: false,
  });
});

test('PR steward report classifies common PR events while staying report-only', async () => {
  const suite = await runPrStewardReportReplaySuite({ routeTablePath: ROUTE_TABLE_PATH });
  const outcomes = Object.fromEntries(suite.results.map((result) => [result.name, result.replay.prStewardReport?.status]));

  assert.equal(suite.passed, true);
  assert.equal(outcomes['review-requested'], 'watch');
  assert.equal(outcomes['ci-red'], 'candidate-fix-request');
  assert.equal(outcomes['stale-pr'], 'needs-human-review');
  assert.equal(outcomes['ready-to-merge'], 'ready-to-merge-notice');
});

test('disabled or non matching PR steward report route denies before evidence', async () => {
  const disabledRouteTableText = (await readFile(ROUTE_TABLE_PATH, 'utf8')).replace(
    /route_id: "pr-steward-report"\n    enabled: true/,
    'route_id: "pr-steward-report"\n    enabled: false',
  );
  const suite = await runPrStewardReportReplaySuite({ routeTableText: disabledRouteTableText });
  const result = suite.results.find((item) => item.name === 'review-requested');
  const replay = result.replay;

  assert.equal(result.pass, false);
  assert.equal(replay.outcome, 'route-denied');
  assert.equal(replay.routeDecision.allowed, false);
  assert.equal(replay.reportEvidence, null);
  assert.equal(replay.prStewardReport, null);
});

test('non pull request signal cannot enter PR steward report route', async () => {
  const suite = await runPrStewardReportReplaySuite({
    routeTablePath: ROUTE_TABLE_PATH,
    scenarios: [{
      name: 'issue-plan-signal',
      expectOutcome: 'route-denied',
      signal: {
        signal_id: 'issue:77:plan-signal',
        source: 'issue',
        route: 'pr-steward',
        subject: '#77',
        summary: 'Plan activation carrier should not masquerade as a PR event.',
        priority: 'P2',
        risk: 'medium',
        confidence: 'high',
      },
    }],
  });
  const replay = suite.results[0].replay;

  assert.equal(suite.passed, true);
  assert.equal(replay.routeDecision.allowed, false);
  assert.equal(replay.routeDecision.reason, 'signal-does-not-match-route');
  assert.equal(replay.reportEvidence, null);
});
