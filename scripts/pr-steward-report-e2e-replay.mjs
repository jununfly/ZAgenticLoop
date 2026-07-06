#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { dispatchSignalToReportOnlyRoute } from './report-only-route-dispatcher.mjs';

const DEFAULT_ROUTE_TABLE = 'zj-loop/zj-loop-route-table.yaml';
const ROUTE_ID = 'pr-steward-report';
const PR_STEWARD_REPORT_SCHEMA = 'zj-loop.pr_steward_report.v1';

export const DEFAULT_PR_STEWARD_REPORT_SCENARIOS = [
  {
    name: 'review-requested',
    expectOutcome: 'report-evidence',
    signal: {
      signal_id: 'pr:42:review-requested',
      source: 'pull_request',
      action: 'review_requested',
      repo: 'jununfly/ZAgenticLoop',
      pr_number: 42,
      subject: 'PR #42',
      summary: 'PR #42 requested review from maintainers.',
      priority: 'P2',
      state: 'none',
      risk: 'medium',
      confidence: 'high',
      evidence: ['https://github.com/jununfly/ZAgenticLoop/pull/42'],
      checks: 'pending',
      approvals: 0,
      blocking_review_comments: 0,
      idle_days: 0,
    },
  },
  {
    name: 'ci-red',
    expectOutcome: 'report-evidence',
    signal: {
      signal_id: 'pr:43:ci-red',
      source: 'pull_request',
      action: 'synchronize',
      repo: 'jununfly/ZAgenticLoop',
      pr_number: 43,
      subject: 'PR #43',
      summary: 'PR #43 has failing required checks after synchronize.',
      priority: 'P1',
      state: 'none',
      risk: 'medium',
      confidence: 'high',
      evidence: ['https://github.com/jununfly/ZAgenticLoop/pull/43'],
      checks: 'failure',
      approvals: 1,
      blocking_review_comments: 0,
      idle_days: 0,
    },
  },
  {
    name: 'stale-pr',
    expectOutcome: 'report-evidence',
    signal: {
      signal_id: 'pr:44:stale',
      source: 'pull_request',
      action: 'opened',
      repo: 'jununfly/ZAgenticLoop',
      pr_number: 44,
      subject: 'PR #44',
      summary: 'PR #44 has been idle with unresolved review comments.',
      priority: 'P2',
      state: 'none',
      risk: 'medium',
      confidence: 'medium',
      evidence: ['https://github.com/jununfly/ZAgenticLoop/pull/44'],
      checks: 'success',
      approvals: 0,
      blocking_review_comments: 2,
      idle_days: 5,
    },
  },
  {
    name: 'ready-to-merge',
    expectOutcome: 'report-evidence',
    signal: {
      signal_id: 'pr:45:ready',
      source: 'pull_request',
      action: 'ready_for_review',
      repo: 'jununfly/ZAgenticLoop',
      pr_number: 45,
      subject: 'PR #45',
      summary: 'PR #45 is green and approved.',
      priority: 'P2',
      state: 'none',
      risk: 'low',
      confidence: 'high',
      evidence: ['https://github.com/jununfly/ZAgenticLoop/pull/45'],
      checks: 'success',
      approvals: 2,
      blocking_review_comments: 0,
      idle_days: 0,
    },
  },
];

export function replayPrStewardReport({ routeTableText, scenario, createdAt = '2026-07-07T00:00:00Z' }) {
  const dispatch = dispatchSignalToReportOnlyRoute({
    routeTableText,
    routeId: ROUTE_ID,
    signal: {
      ...scenario.signal,
      producer: scenario.signal?.producer ?? 'pull-request-event',
    },
    createdAt,
  });
  const steps = [
    {
      name: 'pull-request-event',
      status: 'observed',
      pr_number: scenario.signal?.pr_number,
      action: scenario.signal?.action,
    },
    {
      name: 'route-decision',
      status: dispatch.routeDecision.allowed ? 'allowed' : 'denied',
      route_id: dispatch.routeDecision.route_id,
      request_kind: dispatch.routeDecision.request_kind,
      reason: dispatch.routeDecision.reason,
    },
  ];

  if (!dispatch.routeDecision.allowed) {
    steps.push({ name: 'route-denied', status: 'denied', reason: dispatch.routeDecision.reason });
    return {
      schemaVersion: 1,
      kind: 'zj-loop-pr-steward-report-e2e-replay',
      outcome: 'route-denied',
      routeDecision: dispatch.routeDecision,
      reportEvidence: null,
      prStewardReport: null,
      steps,
    };
  }

  const prStewardReport = buildPrStewardReport({ signal: scenario.signal, createdAt });
  const reportEvidence = {
    ...dispatch.reportEvidence,
    summary: prStewardReport.summary,
    next_action: prStewardReport.next_action,
    pr_steward_report: prStewardReport,
    side_effects: {
      ...dispatch.reportEvidence.side_effects,
      pr_comment_created: false,
      label_changed: false,
      rebase_started: false,
      merge_started: false,
    },
  };
  steps.push({ name: 'pr-steward-report', status: prStewardReport.status, next_action: prStewardReport.next_action });

  return {
    schemaVersion: 1,
    kind: 'zj-loop-pr-steward-report-e2e-replay',
    outcome: 'report-evidence',
    routeDecision: dispatch.routeDecision,
    reportEvidence,
    prStewardReport,
    steps,
  };
}

export async function runPrStewardReportReplaySuite({
  routeTablePath = DEFAULT_ROUTE_TABLE,
  routeTableText,
  scenarios = DEFAULT_PR_STEWARD_REPORT_SCENARIOS,
} = {}) {
  const resolvedRouteTableText = routeTableText ?? await readFile(routeTablePath, 'utf8');
  const results = scenarios.map((scenario) => {
    const replay = replayPrStewardReport({ routeTableText: resolvedRouteTableText, scenario });
    return {
      name: scenario.name,
      expected: scenario.expectOutcome,
      actual: replay.outcome,
      pass: replay.outcome === scenario.expectOutcome,
      replay,
    };
  });

  return {
    schemaVersion: 1,
    kind: 'zj-loop-pr-steward-report-e2e-replay-suite',
    routeTablePath,
    passed: results.every((result) => result.pass),
    results,
  };
}

function buildPrStewardReport({ signal, createdAt }) {
  const status = classifyPrStewardStatus(signal);
  return {
    schema: PR_STEWARD_REPORT_SCHEMA,
    status,
    created_at: createdAt,
    source_pr: signal?.pr_number ?? null,
    source_action: signal?.action ?? '',
    summary: signal?.summary ?? signal?.subject ?? '',
    next_action: nextActionForStatus(status),
    observations: {
      checks: signal?.checks ?? 'unknown',
      approvals: signal?.approvals ?? 0,
      blocking_review_comments: signal?.blocking_review_comments ?? 0,
      idle_days: signal?.idle_days ?? 0,
    },
    side_effects_executed: false,
  };
}

function classifyPrStewardStatus(signal) {
  if (signal?.checks === 'failure') return 'candidate-fix-request';
  if ((signal?.blocking_review_comments ?? 0) > 0 || (signal?.idle_days ?? 0) >= 3) return 'needs-human-review';
  if (signal?.checks === 'success' && (signal?.approvals ?? 0) > 0 && (signal?.blocking_review_comments ?? 0) === 0) {
    return 'ready-to-merge-notice';
  }
  return 'watch';
}

function nextActionForStatus(status) {
  if (status === 'candidate-fix-request') return 'consider-issue-fix-request';
  if (status === 'needs-human-review') return 'human-review';
  if (status === 'ready-to-merge-notice') return 'notify-human-ready-to-merge';
  return 'record-pr-steward-state';
}

async function main() {
  const routeTablePath = process.env.ROUTE_TABLE_PATH || DEFAULT_ROUTE_TABLE;
  const suite = await runPrStewardReportReplaySuite({ routeTablePath });
  console.log(JSON.stringify(suite, null, 2));
  if (!suite.passed) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
