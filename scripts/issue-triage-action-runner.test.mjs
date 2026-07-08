import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  ALLOWED_TRIAGE_LABELS,
  FIXED_COMMENT_TEMPLATES,
  buildIssueTriageActionRequest,
  runIssueTriageActionReplaySuite,
  runIssueTriageActionRunner,
} from './issue-triage-action-runner.mjs';
import { runIssueTriageReportReplaySuite } from './issue-triage-report-e2e-replay.mjs';

const ROUTE_TABLE_PATH = 'zj-loop/zj-loop-route-table.yaml';

test('issue triage action route dry-runs allowlisted label and fixed comment actions', async () => {
  const suite = await runIssueTriageActionReplaySuite({ routeTablePath: ROUTE_TABLE_PATH });
  const label = suite.results.find((item) => item.name === 'allowlisted-label-dry-run').result;
  const comment = suite.results.find((item) => item.name === 'fixed-comment-dry-run').result;

  assert.equal(suite.passed, true);
  assert.equal(label.decision.status, 'dry-run-completed');
  assert.equal(label.evidence.consumer_kind, 'triage-action-consumer');
  assert.equal(label.evidence.execution_mode, 'dry-run');
  assert.equal(label.evidence.completion_form, 'triage-label-applied');
  assert.equal(label.evidence.side_effects.executed, false);
  assert.deepEqual(label.evidence.side_effects.actions, [
    { kind: 'label', label: 'needs-info', mode: 'dry-run' },
  ]);

  assert.equal(comment.evidence.completion_form, 'triage-comment-posted');
  assert.deepEqual(comment.evidence.side_effects.actions, [
    { kind: 'issue-comment', template: 'needs-info-request', mode: 'dry-run' },
  ]);
});

test('issue triage action route uses fixed allowlists and rejects freeform actions', async () => {
  const suite = await runIssueTriageActionReplaySuite({ routeTablePath: ROUTE_TABLE_PATH });
  const badLabel = suite.results.find((item) => item.name === 'unsupported-label-rejected').result;
  const badComment = suite.results.find((item) => item.name === 'freeform-comment-rejected').result;

  assert.deepEqual(ALLOWED_TRIAGE_LABELS, [
    'needs-info',
    'duplicate-candidate',
    'ready-for-roadmap-review',
  ]);
  assert.deepEqual(FIXED_COMMENT_TEMPLATES, [
    'needs-info-request',
    'duplicate-candidate-note',
    'roadmap-review-ready-note',
  ]);
  assert.equal(badLabel.decision.status, 'rejected');
  assert.equal(badLabel.decision.reason, 'label-not-allowlisted');
  assert.equal(badLabel.evidence.completion_form, 'triage-action-skipped');
  assert.equal(badLabel.evidence.status, 'skipped');

  assert.equal(badComment.decision.status, 'rejected');
  assert.equal(badComment.decision.reason, 'comment-template-not-fixed');
  assert.deepEqual(badComment.evidence.side_effects.actions, []);
});

test('issue triage action route escalates human guarded requests', async () => {
  const suite = await runIssueTriageActionReplaySuite({ routeTablePath: ROUTE_TABLE_PATH });
  const guarded = suite.results.find((item) => item.name === 'human-guard-escalated').result;

  assert.equal(guarded.decision.status, 'escalated');
  assert.equal(guarded.decision.reason, 'human-guard-matched');
  assert.equal(guarded.evidence.completion_form, 'escalation-issue');
  assert.equal(guarded.evidence.status, 'escalated');
});

test('issue triage action route refuses live execution until dogfood enables it', async () => {
  const routeTableText = await readFile(ROUTE_TABLE_PATH, 'utf8');
  const result = runIssueTriageActionRunner({
    routeTableText,
    request: buildIssueTriageActionRequest(),
    live: true,
  });

  assert.equal(result.decision.status, 'rejected');
  assert.equal(result.decision.reason, 'live-side-effects-not-enabled');
  assert.equal(result.evidence.execution_mode, 'live');
  assert.equal(result.evidence.side_effects.executed, false);
  assert.equal(result.validation.ok, true);
});

test('issue triage report remains report-only after action route is added', async () => {
  const suite = await runIssueTriageReportReplaySuite({ routeTablePath: ROUTE_TABLE_PATH });
  const report = suite.results.find((item) => item.name === 'missing-info-recorded').replay;

  assert.equal(suite.passed, true);
  assert.equal(report.routeDecision.route_id, 'issue-triage-report');
  assert.equal(report.routeDecision.request_kind, 'report-only');
  assert.equal(report.routeDecision.public_action_allowed, false);
  assert.equal(report.issueTriageReport.side_effects.consumer_work_started, false);
});
