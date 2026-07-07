#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { dispatchSignalToReportOnlyRoute } from './report-only-route-dispatcher.mjs';

const DEFAULT_ROUTE_TABLE = 'zj-loop/zj-loop-route-table.yaml';
const ROUTE_ID = 'changelog-drafter-report';
const CHANGELOG_DRAFTER_REPORT_SCHEMA = 'zj-loop.changelog_drafter_report.v1';
const LARGE_WINDOW_THRESHOLD = 50;

const BASE_SIGNAL = {
  source: 'pull_request',
  action: 'merged_batch',
  repo: 'jununfly/ZAgenticLoop',
  base_branch: 'main',
  since_ref: 'v1.5.0',
  until_ref: 'HEAD',
  window_kind: 'release-window',
  item_count: 8,
  has_breaking_or_security: false,
  priority: 'P2',
  state: 'none',
  risk: 'low',
  confidence: 'high',
  evidence: ['https://github.com/jununfly/ZAgenticLoop/pulls?q=is%3Apr+is%3Amerged+base%3Amain'],
  summary: 'Merged PRs since v1.5.0 should be considered for release notes.',
};

export const DEFAULT_CHANGELOG_DRAFTER_REPORT_SCENARIOS = [
  {
    name: 'merged-pr-release-window',
    expectOutcome: 'report-evidence',
    signal: buildChangelogSignal({
      ...BASE_SIGNAL,
      signal_id: 'changelog:jununfly/ZAgenticLoop:main:v1.5.0:HEAD',
      subject: 'release notes window v1.5.0...HEAD',
    }),
  },
  {
    name: 'manual-release-prep',
    expectOutcome: 'report-evidence',
    signal: buildChangelogSignal({
      ...BASE_SIGNAL,
      source: 'human',
      action: 'release_prep',
      signal_id: 'changelog:jununfly/ZAgenticLoop:main:last-state-run:HEAD:manual',
      since_ref: 'last-state-run',
      window_kind: 'state-window',
      subject: 'manual changelog release prep',
      summary: 'Maintainer requested release-prep evidence for recent merges.',
      evidence: ['https://github.com/jununfly/ZAgenticLoop/issues/29'],
    }),
  },
  {
    name: 'breaking-change-human-gate',
    expectOutcome: 'human-gate-required',
    signal: buildChangelogSignal({
      ...BASE_SIGNAL,
      signal_id: 'changelog:jununfly/ZAgenticLoop:main:v1.5.0:breaking-head',
      until_ref: 'breaking-head',
      subject: 'release notes window with breaking change',
      has_breaking_or_security: true,
      breaking_change: true,
      risk: 'high',
      summary: 'The release window contains a breaking change and needs human review before drafting.',
    }),
  },
  {
    name: 'large-window-human-gate',
    expectOutcome: 'human-gate-required',
    signal: buildChangelogSignal({
      ...BASE_SIGNAL,
      signal_id: 'changelog:jununfly/ZAgenticLoop:main:v1.5.0:large-window',
      until_ref: 'large-window',
      subject: 'large release notes window',
      item_count: 75,
      risk: 'medium',
      summary: 'The release window is too large for automatic drafting without curation.',
    }),
  },
  {
    name: 'duplicate-release-window',
    expectOutcome: 'duplicate',
    signal: buildChangelogSignal({
      ...BASE_SIGNAL,
      signal_id: 'changelog:jununfly/ZAgenticLoop:main:v1.5.0:HEAD',
      subject: 'release notes window v1.5.0...HEAD',
    }),
    existingReports: [{
      decision_id: 'rd_existing_changelog',
      status: 'reported',
      dedupe_key: 'changelog:jununfly/ZAgenticLoop:main:v1.5.0:HEAD',
      evidence_url: 'zj-loop/changelog-drafter-state.md#route-decisions',
    }],
  },
  {
    name: 'tag-event-denied',
    expectOutcome: 'route-denied',
    signal: buildChangelogSignal({
      ...BASE_SIGNAL,
      source: 'tag',
      action: 'pushed',
      signal_id: 'tag:v1.6.0',
      subject: 'tag v1.6.0 pushed',
      until_ref: 'v1.6.0',
      evidence: ['https://github.com/jununfly/ZAgenticLoop/releases/tag/v1.6.0'],
    }),
  },
];

export function replayChangelogDrafterReport({
  routeTableText,
  scenario,
  createdAt = '2026-07-07T00:00:00Z',
} = {}) {
  const dispatch = dispatchSignalToReportOnlyRoute({
    routeTableText,
    routeId: ROUTE_ID,
    signal: {
      ...scenario.signal,
      producer: scenario.signal?.producer ?? 'release-prep-signal',
    },
    createdAt,
  });
  const steps = [
    {
      name: 'release-prep-signal',
      status: 'observed',
      source: scenario.signal?.source,
      action: scenario.signal?.action,
      since_ref: scenario.signal?.since_ref,
      until_ref: scenario.signal?.until_ref,
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
    return buildReplay({ scenario, dispatch, steps, outcome: 'route-denied' });
  }

  const duplicate = findDuplicateReport({
    existingReports: scenario.existingReports,
    dedupeKey: dispatch.routeDecision.dedupe_key,
  });
  if (duplicate) {
    steps.push({
      name: 'changelog-drafter-report',
      status: 'duplicate',
      existing_evidence_url: duplicate.evidence_url ?? '',
    });
    return buildReplay({
      scenario,
      dispatch,
      steps,
      outcome: 'duplicate',
      changelogDrafterReport: buildChangelogDrafterReport({
        signal: scenario.signal,
        routeDecision: dispatch.routeDecision,
        createdAt,
        duplicate,
      }),
    });
  }

  const changelogDrafterReport = buildChangelogDrafterReport({
    signal: scenario.signal,
    routeDecision: dispatch.routeDecision,
    createdAt,
  });
  const reportEvidence = {
    ...dispatch.reportEvidence,
    summary: changelogDrafterReport.summary,
    next_action: changelogDrafterReport.next_action,
    changelog_drafter_report: changelogDrafterReport,
    side_effects: {
      ...dispatch.reportEvidence.side_effects,
      release_notes_draft_created: false,
      changelog_edited: false,
      changelog_pr_created: false,
      tag_created: false,
      release_created: false,
      package_published: false,
    },
  };
  steps.push({
    name: 'changelog-drafter-report',
    status: changelogDrafterReport.status,
    next_action: changelogDrafterReport.next_action,
  });

  return buildReplay({
    scenario,
    dispatch: { ...dispatch, reportEvidence },
    steps,
    outcome: changelogDrafterReport.status === 'human-gate-required' ? 'human-gate-required' : 'report-evidence',
    changelogDrafterReport,
  });
}

export async function runChangelogDrafterReportReplaySuite({
  routeTablePath = DEFAULT_ROUTE_TABLE,
  routeTableText,
  scenarios = DEFAULT_CHANGELOG_DRAFTER_REPORT_SCENARIOS,
} = {}) {
  const resolvedRouteTableText = routeTableText ?? await readFile(routeTablePath, 'utf8');
  const results = scenarios.map((scenario) => {
    const replay = replayChangelogDrafterReport({ routeTableText: resolvedRouteTableText, scenario });
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
    kind: 'zj-loop-changelog-drafter-report-e2e-replay-suite',
    routeTablePath,
    passed: results.every((result) => result.pass),
    results,
  };
}

function buildChangelogDrafterReport({ signal, routeDecision, createdAt, duplicate = null }) {
  const humanGateReasons = humanGateReasonsFor(signal);
  const duplicateStatus = duplicate ? 'duplicate' : null;
  const status = duplicateStatus ?? (humanGateReasons.length > 0 ? 'human-gate-required' : 'reported');
  return {
    schema: CHANGELOG_DRAFTER_REPORT_SCHEMA,
    status,
    created_at: createdAt,
    route_id: ROUTE_ID,
    summary: signal?.summary ?? signal?.subject ?? '',
    release_window: {
      repo: signal?.repo ?? '',
      base_branch: signal?.base_branch ?? '',
      since_ref: signal?.since_ref ?? '',
      until_ref: signal?.until_ref ?? '',
      window_kind: signal?.window_kind ?? 'unknown',
      item_count: signal?.item_count ?? null,
    },
    dedupe_key: routeDecision?.dedupe_key ?? '',
    human_gate: {
      required: humanGateReasons.length > 0,
      reasons: humanGateReasons,
    },
    duplicate: duplicate ? {
      decision_id: duplicate.decision_id ?? '',
      evidence_url: duplicate.evidence_url ?? '',
    } : null,
    next_action: nextActionFor({ status, humanGateReasons }),
    side_effects_executed: false,
  };
}

function humanGateReasonsFor(signal) {
  const reasons = [];
  if (signal?.breaking_change === true) reasons.push('breaking_change');
  if (signal?.security === true || signal?.has_breaking_or_security === true) reasons.push('security_or_breaking_signal');
  if (signal?.major_version === true) reasons.push('major_version');
  if ((signal?.item_count ?? 0) > LARGE_WINDOW_THRESHOLD) reasons.push('scan_window_too_large');
  return [...new Set(reasons)];
}

function nextActionFor({ status, humanGateReasons }) {
  if (status === 'duplicate') return 'report-existing-changelog-drafter-status';
  if (humanGateReasons.length > 0) return 'human-review-before-changelog-drafting';
  return 'run-changelog-drafter-consumer';
}

function findDuplicateReport({ existingReports = [], dedupeKey }) {
  return (existingReports ?? []).find((report) => (
    report?.dedupe_key === dedupeKey &&
    ['reported', 'pending', 'human-gate-required'].includes(report?.status)
  ));
}

function buildChangelogSignal(signal) {
  const dedupeKey = `changelog:${signal.repo}:${signal.base_branch}:${signal.since_ref}:${signal.until_ref}`;
  return {
    ...signal,
    route: ROUTE_ID,
    dedupe_key: dedupeKey,
  };
}

function buildReplay({ scenario, dispatch, steps, outcome, changelogDrafterReport = null }) {
  return {
    schemaVersion: 1,
    kind: 'zj-loop-changelog-drafter-report-e2e-replay',
    scenario: scenario.name,
    outcome,
    routeDecision: dispatch.routeDecision,
    reportEvidence: dispatch.reportEvidence ?? null,
    changelogDrafterReport,
    sideEffects: {
      issue_fix_request_created: false,
      activation_request_created: false,
      workflow_dispatched: false,
      consumer_work_started: false,
      release_notes_draft_created: false,
      changelog_edited: false,
      changelog_pr_created: false,
      tag_created: false,
      release_created: false,
      package_published: false,
    },
    steps,
  };
}

async function main() {
  const routeTablePath = process.env.ROUTE_TABLE_PATH || DEFAULT_ROUTE_TABLE;
  const suite = await runChangelogDrafterReportReplaySuite({ routeTablePath });
  console.log(JSON.stringify(suite, null, 2));
  if (!suite.passed) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
