#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { dispatchSignalToReportOnlyRoute } from './report-only-route-dispatcher.mjs';
import {
  DEFAULT_CHANGELOG_DRAFTER_REPORT_SCENARIOS,
  replayChangelogDrafterReport,
} from './changelog-drafter-report-e2e-replay.mjs';

const DEFAULT_ROUTE_TABLE = 'zj-loop/zj-loop-route-table.yaml';
const ROUTE_ID = 'changelog-drafter-draft-request';
const REPORT_ROUTE_ID = 'changelog-drafter-report';
const DRAFT_REQUEST_SCHEMA = 'zj-loop.changelog_draft_request.v1';

export const DEFAULT_CHANGELOG_DRAFTER_DRAFT_REQUEST_SCENARIOS = [
  {
    name: 'reported-window-becomes-draft-request-candidate',
    expectOutcome: 'draft-request-candidate',
    reportScenarioName: 'merged-pr-release-window',
  },
  {
    name: 'human-gated-window-records-human-gate',
    expectOutcome: 'human-gate-required',
    reportScenarioName: 'breaking-change-human-gate',
  },
  {
    name: 'duplicate-draft-request-candidate',
    expectOutcome: 'duplicate',
    reportScenarioName: 'merged-pr-release-window',
    existingDraftRequests: [{
      decision_id: 'rd_existing_changelog_draft_request',
      status: 'draft-request-candidate',
      dedupe_key: 'draft-request:changelog:jununfly/ZAgenticLoop:main:v1.5.0:HEAD',
      evidence_url: 'zj-loop/changelog-drafter-state.md#draft-request-candidates',
    }],
  },
  {
    name: 'missing-report-rejected',
    expectOutcome: 'rejected',
    reportScenarioName: 'merged-pr-release-window',
    mutateReport() {
      return null;
    },
  },
  {
    name: 'publish-adjacent-signal-denied',
    expectOutcome: 'route-denied',
    directSignal: {
      source: 'release',
      action: 'published',
      repo: 'jununfly/ZAgenticLoop',
      base_branch: 'main',
      signal_id: 'release:v1.6.0:published',
      subject: 'release v1.6.0 published',
      summary: 'Release publishing must not enter Changelog Drafter draft request.',
      dedupe_key: 'draft-request:release:v1.6.0',
      priority: 'P1',
      state: 'none',
      risk: 'high',
      confidence: 'high',
      evidence: ['https://github.com/jununfly/ZAgenticLoop/releases/tag/v1.6.0'],
    },
  },
];

export function replayChangelogDrafterDraftRequest({
  routeTableText,
  scenario,
  createdAt = '2026-07-07T00:00:00Z',
} = {}) {
  if (scenario.directSignal) {
    const dispatch = dispatchSignalToReportOnlyRoute({
      routeTableText,
      routeId: ROUTE_ID,
      signal: scenario.directSignal,
      createdAt,
    });
    const steps = buildInitialSteps({ signal: scenario.directSignal, dispatch });
    steps.push({ name: 'changelog-draft-request', status: 'not-created', reason: dispatch.routeDecision.reason });
    return buildReplay({
      scenario,
      outcome: 'route-denied',
      reportReplay: null,
      dispatch,
      changelogDraftRequest: null,
      steps,
    });
  }

  const sourceScenario = findChangelogReportScenario(scenario.reportScenarioName);
  const reportReplay = replayChangelogDrafterReport({
    routeTableText,
    scenario: sourceScenario,
    createdAt,
  });
  const report = scenario.mutateReport
    ? scenario.mutateReport(reportReplay.changelogDrafterReport)
    : reportReplay.changelogDrafterReport;
  const signal = buildDraftRequestSignal({ report, reportReplay });
  const dispatch = dispatchSignalToReportOnlyRoute({
    routeTableText,
    routeId: ROUTE_ID,
    signal,
    createdAt,
  });
  const steps = [
    {
      name: 'changelog-drafter-report',
      status: report?.status ?? 'missing',
      route_id: report?.route_id ?? '',
      dedupe_key: report?.dedupe_key ?? '',
    },
    ...buildInitialSteps({ signal, dispatch }),
  ];

  if (!dispatch.routeDecision.allowed) {
    steps.push({ name: 'changelog-draft-request', status: 'not-created', reason: dispatch.routeDecision.reason });
    return buildReplay({
      scenario,
      outcome: 'route-denied',
      reportReplay,
      dispatch,
      changelogDraftRequest: null,
      steps,
    });
  }

  const validation = validateChangelogDraftRequestInput(report);
  if (!validation.ok) {
    steps.push({ name: 'changelog-draft-request', status: 'rejected', reason: validation.errors.join(', ') });
    return buildReplay({
      scenario,
      outcome: 'rejected',
      reportReplay,
      dispatch,
      changelogDraftRequest: buildChangelogDraftRequestEvidence({
        report,
        routeDecision: dispatch.routeDecision,
        createdAt,
        status: 'rejected',
        validation,
      }),
      validation,
      steps,
    });
  }

  const duplicate = findDuplicateDraftRequest({
    existingDraftRequests: scenario.existingDraftRequests,
    dedupeKey: dispatch.routeDecision.dedupe_key,
  });
  if (duplicate) {
    steps.push({
      name: 'changelog-draft-request',
      status: 'duplicate',
      existing_evidence_url: duplicate.evidence_url ?? '',
    });
    return buildReplay({
      scenario,
      outcome: 'duplicate',
      reportReplay,
      dispatch,
      changelogDraftRequest: buildChangelogDraftRequestEvidence({
        report,
        routeDecision: dispatch.routeDecision,
        createdAt,
        status: 'duplicate',
        duplicate,
      }),
      validation,
      steps,
    });
  }

  const status = report.human_gate?.required ? 'human-gate-required' : 'draft-request-candidate';
  const changelogDraftRequest = buildChangelogDraftRequestEvidence({
    report,
    routeDecision: dispatch.routeDecision,
    createdAt,
    status,
  });
  steps.push({
    name: 'changelog-draft-request',
    status,
    next_action: changelogDraftRequest.next_action,
  });

  return buildReplay({
    scenario,
    outcome: status,
    reportReplay,
    dispatch: {
      ...dispatch,
      reportEvidence: {
        ...dispatch.reportEvidence,
        summary: changelogDraftRequest.summary,
        next_action: changelogDraftRequest.next_action,
        changelog_draft_request: changelogDraftRequest,
        side_effects: {
          ...dispatch.reportEvidence.side_effects,
          draft_consumer_started: false,
          release_notes_draft_created: false,
          changelog_edited: false,
          changelog_pr_created: false,
          tag_created: false,
          release_created: false,
          package_published: false,
        },
      },
    },
    changelogDraftRequest,
    validation,
    steps,
  });
}

export async function runChangelogDrafterDraftRequestReplaySuite({
  routeTablePath = DEFAULT_ROUTE_TABLE,
  routeTableText,
  scenarios = DEFAULT_CHANGELOG_DRAFTER_DRAFT_REQUEST_SCENARIOS,
} = {}) {
  const resolvedRouteTableText = routeTableText ?? await readFile(routeTablePath, 'utf8');
  const results = scenarios.map((scenario) => {
    const replay = replayChangelogDrafterDraftRequest({ routeTableText: resolvedRouteTableText, scenario });
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
    kind: 'zj-loop-changelog-drafter-draft-request-e2e-replay-suite',
    routeTablePath,
    passed: results.every((result) => result.pass),
    results,
  };
}

export function validateChangelogDraftRequestInput(report) {
  const errors = [];
  if (!report || typeof report !== 'object') {
    return { ok: false, errors: ['changelog-drafter-report evidence is required'] };
  }
  if (report.route_id !== REPORT_ROUTE_ID) errors.push(`report.route_id must be ${REPORT_ROUTE_ID}`);
  if (!['reported', 'human-gate-required'].includes(report.status)) {
    errors.push(`report.status must be reported or human-gate-required, got ${report.status ?? 'missing'}`);
  }
  const window = report.release_window ?? {};
  for (const field of ['repo', 'base_branch', 'since_ref', 'until_ref']) {
    if (!window[field]) errors.push(`release_window.${field} is required`);
  }
  if (!report.dedupe_key) errors.push('report.dedupe_key is required');
  if (report.status === 'reported' && report.human_gate?.required === true) {
    errors.push('reported status must not require a human gate');
  }
  return { ok: errors.length === 0, errors };
}

function buildDraftRequestSignal({ report, reportReplay }) {
  if (!report) {
    return {
      source: REPORT_ROUTE_ID,
      action: 'draft_request_candidate',
      repo: reportReplay?.routeDecision?.evidence?.[0] ?? 'unknown',
      signal_id: 'changelog-draft-request:missing-report',
      subject: 'missing changelog-drafter-report',
      dedupe_key: 'draft-request:missing-report',
      priority: 'P2',
      state: 'none',
      risk: 'medium',
      confidence: 'low',
      evidence: [],
      summary: 'Cannot create changelog draft request candidate without a report.',
    };
  }
  const window = report.release_window ?? {};
  return {
    source: REPORT_ROUTE_ID,
    action: 'draft_request_candidate',
    repo: window.repo,
    base_branch: window.base_branch,
    signal_id: `changelog-draft-request:${report.dedupe_key}`,
    subject: `changelog draft request for ${window.since_ref}...${window.until_ref}`,
    dedupe_key: `draft-request:${report.dedupe_key}`,
    priority: 'P2',
    state: 'none',
    risk: report.human_gate?.required ? 'high' : 'low',
    confidence: 'high',
    evidence: [report.dedupe_key],
    summary: report.summary,
  };
}

function buildInitialSteps({ signal, dispatch }) {
  return [
    {
      name: 'draft-request-signal',
      status: 'observed',
      source: signal?.source,
      action: signal?.action,
      dedupe_key: signal?.dedupe_key,
    },
    {
      name: 'route-decision',
      status: dispatch.routeDecision.allowed ? 'allowed' : 'denied',
      route_id: dispatch.routeDecision.route_id,
      request_kind: dispatch.routeDecision.request_kind,
      reason: dispatch.routeDecision.reason,
    },
  ];
}

function buildChangelogDraftRequestEvidence({
  report,
  routeDecision,
  createdAt,
  status,
  validation = null,
  duplicate = null,
}) {
  const window = report?.release_window ?? {};
  return {
    schema: DRAFT_REQUEST_SCHEMA,
    status,
    created_at: createdAt,
    route_id: ROUTE_ID,
    source_report: {
      route_id: report?.route_id ?? '',
      status: report?.status ?? '',
      dedupe_key: report?.dedupe_key ?? '',
    },
    release_window: {
      repo: window.repo ?? '',
      base_branch: window.base_branch ?? '',
      since_ref: window.since_ref ?? '',
      until_ref: window.until_ref ?? '',
      window_kind: window.window_kind ?? 'unknown',
      item_count: window.item_count ?? null,
    },
    dedupe_key: routeDecision?.dedupe_key ?? '',
    human_gate: {
      required: report?.human_gate?.required === true,
      reasons: report?.human_gate?.reasons ?? [],
    },
    duplicate: duplicate ? {
      decision_id: duplicate.decision_id ?? '',
      evidence_url: duplicate.evidence_url ?? '',
    } : null,
    validation,
    summary: report?.summary ?? '',
    next_action: nextActionFor(status),
    side_effects: {
      release_notes_draft_created: false,
      changelog_edited: false,
      changelog_pr_created: false,
      draft_consumer_started: false,
      workflow_dispatched: false,
      tag_created: false,
      release_created: false,
      package_published: false,
    },
  };
}

function nextActionFor(status) {
  if (status === 'draft-request-candidate') return 'run-changelog-drafter-consumer';
  if (status === 'human-gate-required') return 'human-review-before-changelog-draft-request';
  if (status === 'duplicate') return 'report-existing-changelog-draft-request-status';
  return 'fix-changelog-draft-request-input';
}

function findDuplicateDraftRequest({ existingDraftRequests = [], dedupeKey }) {
  return (existingDraftRequests ?? []).find((request) => (
    request?.dedupe_key === dedupeKey &&
    ['draft-request-candidate', 'human-gate-required', 'pending'].includes(request?.status)
  ));
}

function findChangelogReportScenario(name) {
  const scenario = DEFAULT_CHANGELOG_DRAFTER_REPORT_SCENARIOS.find((item) => item.name === name);
  if (!scenario) throw new Error(`Unknown Changelog Drafter report scenario: ${name}`);
  return scenario;
}

function buildReplay({
  scenario,
  outcome,
  reportReplay,
  dispatch,
  changelogDraftRequest,
  validation = null,
  steps,
}) {
  return {
    schemaVersion: 1,
    kind: 'zj-loop-changelog-drafter-draft-request-e2e-replay',
    scenario: scenario.name,
    outcome,
    sourceReport: reportReplay?.changelogDrafterReport ?? null,
    routeDecision: dispatch.routeDecision,
    reportEvidence: dispatch.reportEvidence ?? null,
    changelogDraftRequest,
    validation,
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
  const suite = await runChangelogDrafterDraftRequestReplaySuite({ routeTablePath });
  console.log(JSON.stringify(suite, null, 2));
  if (!suite.passed) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
