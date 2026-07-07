#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { ROUTE_DECISION_SCHEMA } from './issue-fix-request-contract.mjs';
import { findRoute } from './route-ci-failure.mjs';

const DEFAULT_ROUTE_TABLE = 'zj-loop/zj-loop-route-table.yaml';
const ROUTE_ID = 'issue-triage-report';
const EVIDENCE_STORE = 'zj-loop/issue-triage-state.md';
const ISSUE_TRIAGE_REPORT_SCHEMA = 'zj-loop.issue_triage_report.v1';

export const ALLOWED_ISSUE_TRIAGE_SIGNAL_KINDS = Object.freeze([
  'missing-info-observation',
  'possible-duplicate-observation',
  'label-suggestion-observation',
  'human-attention-candidate',
  'issue-backlog-summary',
]);

const FORBIDDEN_PROTOCOL_FIELDS = Object.freeze([
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
]);

const HUMAN_REVIEW_GUARD_FIELDS = Object.freeze([
  'security_or_privacy_related',
  'auth_billing_legal_related',
  'destructive_action_required',
  'formal_issue_lifecycle_transition_required',
  'public_issue_comment_required',
  'label_mutation_required',
]);

export const DEFAULT_ISSUE_TRIAGE_REPORT_SCENARIOS = [
  {
    name: 'missing-info-recorded',
    expectStatus: 'recorded',
    signal: {
      signal_id: 'issue:123:missing-info',
      source: 'issue',
      repo: 'jununfly/ZAgenticLoop',
      scan_window: 'open-issues:last-24h',
      signal_kind: 'missing-info-observation',
      subject: 'issue-123',
      summary: 'Issue #123 lacks reproduction and environment details.',
      priority: 'P2',
      risk: 'medium',
      confidence: 'high',
      missing: ['reproduction', 'environment'],
      evidence: ['https://github.com/jununfly/ZAgenticLoop/issues/123'],
    },
  },
  {
    name: 'already-recorded',
    expectStatus: 'already-recorded',
    existingReportsFrom: 'missing-info-recorded',
    signal: {
      signal_id: 'issue:123:missing-info',
      source: 'issue',
      repo: 'jununfly/ZAgenticLoop',
      scan_window: 'open-issues:last-24h',
      signal_kind: 'missing-info-observation',
      subject: 'issue-123',
      summary: 'Issue #123 lacks reproduction and environment details.',
      priority: 'P2',
      risk: 'medium',
      confidence: 'high',
      missing: ['reproduction', 'environment'],
      evidence: ['https://github.com/jununfly/ZAgenticLoop/issues/123'],
    },
  },
  {
    name: 'unsupported-signal-kind',
    expectStatus: 'rejected',
    signal: {
      signal_id: 'issue:124:needs-info',
      source: 'issue',
      repo: 'jununfly/ZAgenticLoop',
      scan_window: 'open-issues:last-24h',
      signal_kind: 'needs-info',
      subject: 'issue-124',
      summary: 'Unsupported legacy issue triage term should be rejected.',
      priority: 'P2',
      risk: 'medium',
      confidence: 'medium',
      evidence: ['https://github.com/jununfly/ZAgenticLoop/issues/124'],
    },
  },
  {
    name: 'human-review-required',
    expectStatus: 'routed-to-human-review',
    signal: {
      signal_id: 'issue:125:security',
      source: 'issue',
      repo: 'jununfly/ZAgenticLoop',
      scan_window: 'open-issues:last-24h',
      signal_kind: 'human-attention-candidate',
      subject: 'issue-125',
      summary: 'Issue #125 includes security-sensitive reproduction details.',
      priority: 'P0',
      risk: 'high',
      confidence: 'medium',
      security_or_privacy_related: true,
      evidence: ['https://github.com/jununfly/ZAgenticLoop/issues/125'],
    },
  },
  {
    name: 'backlog-summary-recorded',
    expectStatus: 'recorded',
    signal: {
      signal_id: 'issue-backlog:open-issues:last-24h',
      source: 'issue',
      repo: 'jununfly/ZAgenticLoop',
      scan_window: 'open-issues:last-24h',
      signal_kind: 'issue-backlog-summary',
      subject: 'open-issues:last-24h',
      summary: 'Backlog scan summary for open issues in the last 24 hours.',
      priority: 'P3',
      risk: 'low',
      confidence: 'high',
      observed_counts: {
        'missing-info-observation': 3,
        'possible-duplicate-observation': 1,
        'label-suggestion-observation': 5,
        'human-attention-candidate': 1,
      },
      evidence: ['https://github.com/jununfly/ZAgenticLoop/issues'],
    },
  },
];

export function replayIssueTriageReport({
  routeTableText,
  scenario,
  existingReports = [],
  createdAt = '2026-07-07T00:00:00Z',
}) {
  const route = findRoute(routeTableText, ROUTE_ID);
  const signal = {
    ...scenario.signal,
    producer: scenario.signal?.producer ?? 'issue-triage',
  };
  const routeDecision = buildIssueTriageReportRouteDecision({
    route,
    signal,
    existingReports,
    createdAt,
  });
  const steps = [
    {
      name: 'issue-triage-signal',
      status: 'observed',
      signal_kind: signal.signal_kind,
      subject: signal.subject,
    },
    {
      name: 'route-decision',
      status: routeDecision.status,
      route_id: routeDecision.route_id,
      reason: routeDecision.reason,
    },
  ];

  if (routeDecision.status === 'rejected') {
    steps.push({ name: 'issue-triage-report', status: 'not-recorded', reason: routeDecision.reason });
    return buildReplayResult({ routeDecision, issueTriageReport: null, steps });
  }

  const issueTriageReport = buildIssueTriageReport({ signal, routeDecision, createdAt });
  steps.push({
    name: 'issue-triage-report',
    status: routeDecision.status === 'already-recorded' ? 'not-recorded' : 'recorded',
    evidence_store: EVIDENCE_STORE,
  });

  return buildReplayResult({ routeDecision, issueTriageReport, steps });
}

export async function runIssueTriageReportReplaySuite({
  routeTablePath = DEFAULT_ROUTE_TABLE,
  routeTableText,
  scenarios = DEFAULT_ISSUE_TRIAGE_REPORT_SCENARIOS,
} = {}) {
  const resolvedRouteTableText = routeTableText ?? await readFile(routeTablePath, 'utf8');
  const reportByScenario = new Map();
  const results = scenarios.map((scenario) => {
    const existingReports = scenario.existingReportsFrom
      ? [reportByScenario.get(scenario.existingReportsFrom)?.issueTriageReport].filter(Boolean)
      : [];
    const replay = replayIssueTriageReport({
      routeTableText: resolvedRouteTableText,
      scenario,
      existingReports,
    });
    reportByScenario.set(scenario.name, replay);
    return {
      name: scenario.name,
      expected: scenario.expectStatus,
      actual: replay.routeDecision.status,
      pass: replay.routeDecision.status === scenario.expectStatus,
      replay,
    };
  });

  return {
    schemaVersion: 1,
    kind: 'zj-loop-issue-triage-report-e2e-replay-suite',
    routeTablePath,
    passed: results.every((result) => result.pass),
    results,
  };
}

export function buildIssueTriageReportRouteDecision({ route, signal, existingReports = [], createdAt }) {
  const routeEnabled = route?.enabled === true;
  const requestKindAllowed = route?.request_kind === 'report-only';
  const routeMatched = routeMatchesSignal(route, signal);
  const evidencePathFixed = route?.evidence_store === EVIDENCE_STORE;
  const signalKindAllowed = ALLOWED_ISSUE_TRIAGE_SIGNAL_KINDS.includes(signal?.signal_kind);
  const forbiddenField = firstForbiddenProtocolField(signal);
  const humanReviewRequired = requiresHumanReview(signal);
  const dedupeKey = signal?.dedupe_key ?? buildIssueTriageReportDedupeKey(signal);
  const existingReport = findExistingReport(existingReports, dedupeKey);
  const baseAllowed = Boolean(route && routeEnabled && requestKindAllowed && routeMatched && evidencePathFixed);
  const accepted = baseAllowed && signalKindAllowed && !forbiddenField;
  const status = statusForDecision({ accepted, signalKindAllowed, forbiddenField, humanReviewRequired, existingReport });
  const reason = reasonForDecision({
    route,
    routeEnabled,
    requestKindAllowed,
    routeMatched,
    evidencePathFixed,
    signalKindAllowed,
    forbiddenField,
    humanReviewRequired,
    existingReport,
  });

  return {
    schema: ROUTE_DECISION_SCHEMA,
    decision_id: `rd_issue_triage_${stableHash([ROUTE_ID, dedupeKey, status].join(':'))}`,
    source_signal_id: signal?.signal_id ?? '',
    signal_id: signal?.signal_id ?? '',
    source: signal?.source ?? '',
    subject: signal?.subject ?? '',
    priority: signal?.priority ?? 'unknown',
    route: ROUTE_ID,
    route_id: ROUTE_ID,
    request_kind: route?.request_kind ?? '',
    requested_action: status === 'recorded' || status === 'routed-to-human-review' ? 'record-issue-triage-report' : 'no-op',
    target_consumer: route?.consumer ?? '',
    allowed: accepted,
    status,
    reason,
    guards: {
      route_enabled: routeEnabled,
      request_kind_allowed: requestKindAllowed,
      route_matched: routeMatched,
      evidence_path_fixed: evidencePathFixed,
      signal_kind_allowed: signalKindAllowed,
      forbidden_protocol_field_absent: !forbiddenField,
      no_public_issue_comment: true,
      no_label_mutation: true,
      no_assignment: true,
      no_milestone_change: true,
      no_close_or_reopen: true,
      no_formal_issue_lifecycle_transition: true,
      batch_mutation_allowed: false,
    },
    risk: signal?.risk ?? 'unknown',
    confidence: signal?.confidence ?? 'medium',
    evidence: normalizeEvidence(signal?.evidence),
    producer: signal?.producer ?? 'issue-triage',
    dedupe_key: dedupeKey,
    existing_report_id: existingReport?.report_id ?? '',
    public_action_allowed: false,
    label_mutation_allowed: false,
    human_route_required: humanReviewRequired,
    created_at: createdAt,
  };
}

function buildIssueTriageReport({ signal, routeDecision, createdAt }) {
  const triageObservation = buildTriageObservation(signal, routeDecision);
  return {
    schema: ISSUE_TRIAGE_REPORT_SCHEMA,
    report_id: routeDecision.dedupe_key,
    status: routeDecision.status,
    created_at: createdAt,
    evidence_store: EVIDENCE_STORE,
    source: {
      provider: 'github',
      repo: signal?.repo ?? '',
      issue: signal?.issue ?? issueNumberFromSubject(signal?.subject),
      comment: null,
    },
    route_decision: routeDecision,
    triage_observation: triageObservation,
    side_effects: {
      public_issue_comment_created: false,
      label_changed: false,
      assignment_changed: false,
      milestone_changed: false,
      issue_closed_or_reopened: false,
      formal_lifecycle_transitioned: false,
      consumer_work_started: false,
    },
  };
}

function buildTriageObservation(signal, routeDecision) {
  const signalKind = signal?.signal_kind ?? '';
  const common = {
    signal_kind: signalKind,
    subject: signal?.subject ?? '',
    summary: signal?.summary ?? '',
    confidence: signal?.confidence ?? 'medium',
    suggested_next_step: 'record-in-issue-triage-state',
    public_action_allowed: false,
  };

  if (signalKind === 'missing-info-observation') {
    return {
      ...common,
      missing: Array.isArray(signal?.missing) ? signal.missing : [],
    };
  }
  if (signalKind === 'possible-duplicate-observation') {
    return {
      ...common,
      possible_related_subjects: Array.isArray(signal?.possible_related_subjects) ? signal.possible_related_subjects : [],
    };
  }
  if (signalKind === 'label-suggestion-observation') {
    return {
      ...common,
      observed_label_candidates: Array.isArray(signal?.observed_label_candidates) ? signal.observed_label_candidates : [],
      label_mutation_allowed: false,
    };
  }
  if (signalKind === 'human-attention-candidate') {
    return {
      ...common,
      reason: signal?.reason ?? routeDecision.reason,
      human_route_required: routeDecision.human_route_required,
    };
  }
  if (signalKind === 'issue-backlog-summary') {
    return {
      ...common,
      scan_window: signal?.scan_window ?? '',
      observed_counts: signal?.observed_counts ?? {},
      batch_mutation_allowed: false,
    };
  }
  return common;
}

function statusForDecision({ accepted, signalKindAllowed, forbiddenField, humanReviewRequired, existingReport }) {
  if (!accepted || !signalKindAllowed || forbiddenField) return 'rejected';
  if (humanReviewRequired) return 'routed-to-human-review';
  if (existingReport) return 'already-recorded';
  return 'recorded';
}

function reasonForDecision({
  route,
  routeEnabled,
  requestKindAllowed,
  routeMatched,
  evidencePathFixed,
  signalKindAllowed,
  forbiddenField,
  humanReviewRequired,
  existingReport,
}) {
  if (!route) return 'route-not-found';
  if (!routeEnabled) return 'route-disabled';
  if (!requestKindAllowed) return 'route-kind-not-report-only';
  if (!routeMatched) return 'signal-does-not-match-route';
  if (!evidencePathFixed) return 'evidence-path-not-fixed';
  if (!signalKindAllowed) return 'unsupported_signal_kind';
  if (forbiddenField) return `forbidden_protocol_field:${forbiddenField}`;
  if (humanReviewRequired) return 'human_review_guard_matched';
  if (existingReport) return 'report-already-recorded';
  return 'issue-triage-report-recorded';
}

function routeMatchesSignal(route, signal) {
  if (!route) return false;
  const match = route.match ?? {};
  return Object.entries(match).every(([key, allowedValues]) => {
    if (key === 'signal_kind') return true;
    if (!Array.isArray(allowedValues) || allowedValues.length === 0) return true;
    return allowedValues.includes(signal?.[key]);
  });
}

function firstForbiddenProtocolField(signal) {
  if (!signal || typeof signal !== 'object') return '';
  return FORBIDDEN_PROTOCOL_FIELDS.find((field) => Object.hasOwn(signal, field)) ?? '';
}

function requiresHumanReview(signal) {
  if (signal?.risk === 'high' || signal?.risk === 'unknown') return true;
  return HUMAN_REVIEW_GUARD_FIELDS.some((field) => signal?.[field] === true);
}

function findExistingReport(existingReports, dedupeKey) {
  return (Array.isArray(existingReports) ? existingReports : [])
    .find((report) => report?.report_id === dedupeKey || report?.route_decision?.dedupe_key === dedupeKey);
}

function buildIssueTriageReportDedupeKey(signal) {
  return [
    'issue-triage',
    signal?.repo ?? 'unknown-repo',
    signal?.scan_window ?? 'unknown-window',
    signal?.signal_kind ?? 'unknown-kind',
    signal?.subject ?? 'unknown-subject',
  ].join(':');
}

function buildReplayResult({ routeDecision, issueTriageReport, steps }) {
  return {
    schemaVersion: 1,
    kind: 'zj-loop-issue-triage-report-e2e-replay',
    outcome: routeDecision.status,
    routeDecision,
    issueTriageReport,
    evidenceDocument: issueTriageReport ? renderIssueTriageEvidenceDocument(issueTriageReport) : null,
    steps,
  };
}

function renderIssueTriageEvidenceDocument(report) {
  return [
    '# Issue Triage State',
    '',
    'This file is report evidence for `issue-triage-report` Route Decisions.',
    '',
    `- Report id: \`${report.report_id}\``,
    `- Status: \`${report.status}\``,
    `- Signal kind: \`${report.triage_observation.signal_kind}\``,
    `- Public action allowed: \`${report.triage_observation.public_action_allowed}\``,
    `- Evidence store: \`${report.evidence_store}\``,
    '',
  ].join('\n');
}

function normalizeEvidence(evidence) {
  if (Array.isArray(evidence)) return evidence;
  if (evidence) return [evidence];
  return [];
}

function issueNumberFromSubject(subject) {
  const match = String(subject ?? '').match(/issue-(\d+)/);
  return match ? Number(match[1]) : null;
}

function stableHash(value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 12);
}

async function main() {
  const routeTablePath = process.env.ROUTE_TABLE_PATH || DEFAULT_ROUTE_TABLE;
  const suite = await runIssueTriageReportReplaySuite({ routeTablePath });
  console.log(JSON.stringify(suite, null, 2));
  if (!suite.passed) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
