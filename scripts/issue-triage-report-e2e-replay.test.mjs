import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  ALLOWED_ISSUE_TRIAGE_SIGNAL_KINDS,
  replayIssueTriageReport,
  runIssueTriageReportReplaySuite,
} from './issue-triage-report-e2e-replay.mjs';

const ROUTE_TABLE_PATH = 'zj-loop/zj-loop-route-table.yaml';

test('issue triage report records allowed observations without public side effects', async () => {
  const suite = await runIssueTriageReportReplaySuite({ routeTablePath: ROUTE_TABLE_PATH });
  const result = suite.results.find((item) => item.name === 'missing-info-recorded');
  const replay = result.replay;

  assert.equal(result.pass, true);
  assert.equal(replay.outcome, 'recorded');
  assert.equal(replay.routeDecision.route_id, 'issue-triage-report');
  assert.equal(replay.routeDecision.request_kind, 'report-only');
  assert.equal(replay.routeDecision.target_consumer, 'issue-triage');
  assert.equal(replay.routeDecision.status, 'recorded');
  assert.equal(replay.routeDecision.public_action_allowed, false);
  assert.equal(replay.routeDecision.label_mutation_allowed, false);
  assert.equal(replay.issueTriageReport.evidence_store, 'zj-loop/issue-triage-state.md');
  assert.deepEqual(replay.issueTriageReport.side_effects, {
    public_issue_comment_created: false,
    label_changed: false,
    assignment_changed: false,
    milestone_changed: false,
    issue_closed_or_reopened: false,
    formal_lifecycle_transitioned: false,
    consumer_work_started: false,
  });
});

test('issue triage report uses fixed signal kind and status enums', async () => {
  const suite = await runIssueTriageReportReplaySuite({ routeTablePath: ROUTE_TABLE_PATH });
  const statuses = suite.results.map((result) => result.replay.routeDecision.status);

  assert.equal(suite.passed, true);
  assert.deepEqual(ALLOWED_ISSUE_TRIAGE_SIGNAL_KINDS, [
    'missing-info-observation',
    'possible-duplicate-observation',
    'label-suggestion-observation',
    'human-attention-candidate',
    'issue-backlog-summary',
  ]);
  assert.deepEqual(statuses, [
    'recorded',
    'already-recorded',
    'rejected',
    'routed-to-human-review',
    'recorded',
  ]);
});

test('already-recorded is report evidence dedupe, not issue duplicate action', async () => {
  const suite = await runIssueTriageReportReplaySuite({ routeTablePath: ROUTE_TABLE_PATH });
  const replay = suite.results.find((item) => item.name === 'already-recorded').replay;

  assert.equal(replay.routeDecision.status, 'already-recorded');
  assert.equal(replay.routeDecision.reason, 'report-already-recorded');
  assert.equal(replay.routeDecision.existing_report_id, replay.routeDecision.dedupe_key);
  assert.equal(replay.issueTriageReport.triage_observation.signal_kind, 'missing-info-observation');
  assert.equal(replay.issueTriageReport.side_effects.issue_closed_or_reopened, false);
});

test('unsupported signal kinds are rejected instead of guessed', async () => {
  const suite = await runIssueTriageReportReplaySuite({ routeTablePath: ROUTE_TABLE_PATH });
  const replay = suite.results.find((item) => item.name === 'unsupported-signal-kind').replay;

  assert.equal(replay.routeDecision.status, 'rejected');
  assert.equal(replay.routeDecision.reason, 'unsupported_signal_kind');
  assert.equal(replay.routeDecision.allowed, false);
  assert.equal(replay.issueTriageReport, null);
  assert.equal(replay.evidenceDocument, null);
});

test('human-attention-candidate only becomes human route when hard guard matches', async () => {
  const suite = await runIssueTriageReportReplaySuite({ routeTablePath: ROUTE_TABLE_PATH });
  const replay = suite.results.find((item) => item.name === 'human-review-required').replay;

  assert.equal(replay.routeDecision.status, 'routed-to-human-review');
  assert.equal(replay.routeDecision.reason, 'human_review_guard_matched');
  assert.equal(replay.routeDecision.human_route_required, true);
  assert.equal(replay.issueTriageReport.triage_observation.signal_kind, 'human-attention-candidate');
  assert.equal(replay.issueTriageReport.triage_observation.human_route_required, true);
});

test('human-attention-candidate is report-only without a hard human guard', async () => {
  const routeTableText = await readFile(ROUTE_TABLE_PATH, 'utf8');
  const replay = replayIssueTriageReport({
    routeTableText,
    scenario: {
      signal: {
        signal_id: 'issue:126:ambiguous-scope',
        source: 'issue',
        repo: 'jununfly/ZAgenticLoop',
        scan_window: 'open-issues:last-24h',
        signal_kind: 'human-attention-candidate',
        subject: 'issue-126',
        summary: 'Ambiguous scope should be recorded, not treated as a blocking human gate.',
        priority: 'P2',
        risk: 'medium',
        confidence: 'medium',
        reason: 'ambiguous_scope',
      },
    },
  });

  assert.equal(replay.routeDecision.status, 'recorded');
  assert.equal(replay.routeDecision.human_route_required, false);
  assert.equal(replay.issueTriageReport.triage_observation.human_route_required, false);
});

test('forbidden lifecycle, label, comment, and duplicate action fields are rejected', async () => {
  const routeTableText = await readFile(ROUTE_TABLE_PATH, 'utf8');
  const forbiddenFields = [
    'issue_state',
    'proposed_issue_state',
    'transition',
    'apply_label',
    'labels_to_add',
    'label_mutation',
    'set_label',
    'proposed_labels',
    'duplicate',
    'duplicate_of',
    'mark_duplicate',
    'close_as_duplicate',
    'dedupe_issue_action',
    'needs-info',
    'request-info',
    'ask-reporter',
    'comment-needed',
    'needs-human',
  ];

  for (const field of forbiddenFields) {
    const replay = replayIssueTriageReport({
      routeTableText,
      scenario: {
        signal: {
          signal_id: `issue:127:${field}`,
          source: 'issue',
          repo: 'jununfly/ZAgenticLoop',
          scan_window: 'open-issues:last-24h',
          signal_kind: 'missing-info-observation',
          subject: 'issue-127',
          summary: 'Forbidden protocol field must fail closed.',
          priority: 'P2',
          risk: 'medium',
          confidence: 'high',
          [field]: true,
        },
      },
    });

    assert.equal(replay.routeDecision.status, 'rejected');
    assert.equal(replay.routeDecision.reason, `forbidden_protocol_field:${field}`);
    assert.equal(replay.issueTriageReport, null);
  }
});

test('backlog summary remains summary evidence and never batch mutation', async () => {
  const suite = await runIssueTriageReportReplaySuite({ routeTablePath: ROUTE_TABLE_PATH });
  const replay = suite.results.find((item) => item.name === 'backlog-summary-recorded').replay;

  assert.equal(replay.routeDecision.status, 'recorded');
  assert.equal(replay.issueTriageReport.triage_observation.signal_kind, 'issue-backlog-summary');
  assert.equal(replay.issueTriageReport.triage_observation.batch_mutation_allowed, false);
  assert.equal(replay.routeDecision.guards.batch_mutation_allowed, false);
});
