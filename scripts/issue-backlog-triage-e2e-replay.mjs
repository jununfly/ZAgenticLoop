#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { ROUTE_DECISION_SCHEMA } from './issue-fix-request-contract.mjs';
import { findRoute } from './route-ci-failure.mjs';
import { normalizeEvidence } from './route-decision-contract.mjs';

const DEFAULT_ROUTE_TABLE = 'zj-loop/zj-loop-route-table.yaml';
const ROUTE_ID = 'issue-backlog-triage';
const EVIDENCE_STORE = 'zj-loop/issue-triage-state.md';
const ISSUE_BACKLOG_TRIAGE_SCHEMA = 'zj-loop.issue_backlog_triage.v1';
const RECOMMENDED_TRIAGE_TRANSITION_SCHEMA = 'zj-loop.recommended_triage_transition.v1';
const CONFIRM_COMMAND_PREFIX = '/zj-loop confirm-triage-transition';

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

export const ALLOWED_TRIAGE_CATEGORY_ROLES = Object.freeze(['bug', 'enhancement']);
export const ALLOWED_TRIAGE_STATE_ROLES = Object.freeze([
  'needs-info',
  'ready-for-agent',
  'ready-for-human',
  'wontfix',
]);

export const DEFAULT_ISSUE_BACKLOG_TRIAGE_SCENARIOS = [
  {
    name: 'missing-info-recorded',
    expectStatus: 'recorded',
    signal: {
      signal_id: 'issue:123:missing-info',
      source: 'issue',
      repo: 'jununfly/ZAgenticLoop',
      issue: 123,
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
      issue: 123,
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
      issue: 124,
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
      issue: 125,
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
    name: 'ready-for-agent-recommended',
    expectStatus: 'recorded',
    signal: {
      signal_id: 'issue:126:agent-ready',
      source: 'issue',
      repo: 'jununfly/ZAgenticLoop',
      issue: 126,
      scan_window: 'open-issues:last-24h',
      signal_kind: 'label-suggestion-observation',
      subject: 'issue-126',
      summary: 'Issue #126 includes a narrow bug report, reproduction, and verification command.',
      category_role: 'bug',
      recommended_state: 'ready-for-agent',
      priority: 'P2',
      risk: 'medium',
      confidence: 'high',
      observed_label_candidates: ['bug', 'ready-for-agent'],
      evidence: ['https://github.com/jununfly/ZAgenticLoop/issues/126'],
    },
  },
  {
    name: 'wontfix-candidate-requires-human-confirmation',
    expectStatus: 'recorded',
    signal: {
      signal_id: 'issue:127:wontfix-candidate',
      source: 'issue',
      repo: 'jununfly/ZAgenticLoop',
      issue: 127,
      scan_window: 'open-issues:last-24h',
      signal_kind: 'human-attention-candidate',
      subject: 'issue-127',
      summary: 'Issue #127 appears outside the project scope.',
      category_role: 'enhancement',
      recommended_state: 'wontfix',
      priority: 'P3',
      risk: 'medium',
      confidence: 'medium',
      reason: 'outside documented project scope',
      evidence: ['https://github.com/jununfly/ZAgenticLoop/issues/127'],
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

export function replayIssueBacklogTriage({
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
  const routeDecision = buildIssueBacklogTriageRouteDecision({
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
    steps.push({ name: 'issue-backlog-triage', status: 'not-recorded', reason: routeDecision.reason });
    return buildReplayResult({ routeDecision, issueBacklogTriage: null, steps });
  }

  const issueBacklogTriage = buildIssueBacklogTriage({ signal, routeDecision, createdAt });
  steps.push({
    name: 'issue-backlog-triage',
    status: routeDecision.status === 'already-recorded' ? 'not-recorded' : 'recorded',
    evidence_store: EVIDENCE_STORE,
  });

  return buildReplayResult({ routeDecision, issueBacklogTriage, steps });
}

export async function runIssueBacklogTriageReplaySuite({
  routeTablePath = DEFAULT_ROUTE_TABLE,
  routeTableText,
  scenarios = DEFAULT_ISSUE_BACKLOG_TRIAGE_SCENARIOS,
} = {}) {
  const resolvedRouteTableText = routeTableText ?? await readFile(routeTablePath, 'utf8');
  const reportByScenario = new Map();
  const results = scenarios.map((scenario) => {
    const existingReports = scenario.existingReportsFrom
      ? [reportByScenario.get(scenario.existingReportsFrom)?.issueTriageReport].filter(Boolean)
      : [];
    const replay = replayIssueBacklogTriage({
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
    kind: 'zj-loop-issue-backlog-triage-e2e-replay-suite',
    routeTablePath,
    passed: results.every((result) => result.pass),
    results,
  };
}

export function buildIssueBacklogTriageRouteDecision({ route, signal, existingReports = [], createdAt }) {
  const routeEnabled = route?.enabled === true;
  const requestKindAllowed = route?.request_kind === 'report-only';
  const routeMatched = routeMatchesSignal(route, signal);
  const evidencePathFixed = route?.evidence_store === EVIDENCE_STORE;
  const signalKindAllowed = ALLOWED_ISSUE_TRIAGE_SIGNAL_KINDS.includes(signal?.signal_kind);
  const forbiddenField = firstForbiddenProtocolField(signal);
  const humanReviewRequired = requiresHumanReview(signal);
  const dedupeKey = signal?.dedupe_key ?? buildIssueBacklogTriageDedupeKey(signal);
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
    requested_action: status === 'recorded' || status === 'routed-to-human-review' ? 'record-issue-backlog-triage' : 'no-op',
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

function buildIssueBacklogTriage({ signal, routeDecision, createdAt }) {
  const triageObservation = buildTriageObservation(signal, routeDecision);
  const recommendedTransition = buildRecommendedTriageTransition({
    signal,
    routeDecision,
    triageObservation,
    createdAt,
  });
  return {
    schema: ISSUE_BACKLOG_TRIAGE_SCHEMA,
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
    recommended_transition: recommendedTransition,
    side_effects: {
      public_issue_comment_created: false,
      tracker_state_changed: false,
      label_changed: false,
      assignment_changed: false,
      milestone_changed: false,
      issue_closed_or_reopened: false,
      formal_lifecycle_transitioned: false,
      issue_fix_request_created: false,
      consumer_work_started: false,
    },
  };
}

function buildRecommendedTriageTransition({ signal, routeDecision, triageObservation, createdAt }) {
  const issue = signal?.issue ?? issueNumberFromSubject(signal?.subject);
  const recommendedState = recommendedStateForSignal(signal);
  const categoryRole = categoryRoleForSignal(signal);
  const contentHash = stableHash([
    signal?.summary ?? '',
    recommendedState,
    categoryRole,
    triageObservation.signal_kind,
  ].join(':'));
  const requestId = `triage-transition-${stableHash([
    signal?.repo ?? 'unknown-repo',
    issue ?? 'unknown-issue',
    recommendedState,
    contentHash,
  ].join(':'))}`;

  return {
    schema: RECOMMENDED_TRIAGE_TRANSITION_SCHEMA,
    request_id: requestId,
    source: {
      tracker: signal?.tracker ?? 'github',
      repo: signal?.repo ?? '',
      issue,
      issue_url: issueUrlForSignal(signal, issue),
      scan_window: signal?.scan_window ?? 'open-issues',
    },
    route_decision: {
      route_id: ROUTE_ID,
      status: 'recommended',
      decision_id: routeDecision.decision_id,
    },
    category_role: categoryRole,
    recommended_state: recommendedState,
    confidence: signal?.confidence ?? 'medium',
    reason: signal?.reason ?? reasonForRecommendedState(recommendedState, triageObservation),
    risk_flags: riskFlagsForSignal(signal),
    brief_draft: {
      kind: briefKindForState(recommendedState),
      body: briefBodyForState({ signal, recommendedState, triageObservation }),
    },
    dedupe_key: [
      ROUTE_ID,
      signal?.repo ?? 'unknown-repo',
      issue ?? 'unknown-issue',
      recommendedState,
      contentHash,
    ].join(':'),
    confirm_command: `${CONFIRM_COMMAND_PREFIX} ${requestId}`,
    required_actor_permission: 'maintainer-or-collaborator',
    side_effects_if_confirmed: {
      set_tracker_state: recommendedState !== 'wontfix',
      write_triage_comment: recommendedState !== 'wontfix',
      create_issue_fix_request: recommendedState === 'ready-for-agent' ? 'ready-for-agent-only' : false,
    },
    confirmation: {
      enabled_by_default: false,
      wontfix_requires_human_review: recommendedState === 'wontfix',
      allowed_sources: [
        'maintainer-or-collaborator slash command',
        'workflow_dispatch with request id and fixed confirmation phrase',
      ],
    },
    stale_after: staleAfter(createdAt),
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
  return 'issue-backlog-triage-recorded';
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

function buildIssueBacklogTriageDedupeKey(signal) {
  return [
    ROUTE_ID,
    signal?.repo ?? 'unknown-repo',
    signal?.scan_window ?? 'unknown-window',
    signal?.signal_kind ?? 'unknown-kind',
    signal?.subject ?? 'unknown-subject',
  ].join(':');
}

function buildReplayResult({ routeDecision, issueBacklogTriage, steps }) {
  return {
    schemaVersion: 1,
    kind: 'zj-loop-issue-backlog-triage-e2e-replay',
    outcome: routeDecision.status,
    routeDecision,
    issueBacklogTriage,
    issueTriageReport: issueBacklogTriage,
    recommendedTriageTransition: issueBacklogTriage?.recommended_transition ?? null,
    evidenceDocument: issueBacklogTriage ? renderIssueTriageEvidenceDocument(issueBacklogTriage) : null,
    steps,
  };
}

function renderIssueTriageEvidenceDocument(report) {
  return [
    '# Issue Triage State',
    '',
    'This file is report evidence for `issue-backlog-triage` Route Decisions.',
    '',
    `- Report id: \`${report.report_id}\``,
    `- Status: \`${report.status}\``,
    `- Signal kind: \`${report.triage_observation.signal_kind}\``,
    `- Recommended state: \`${report.recommended_transition.recommended_state}\``,
    `- Confirm command: \`${report.recommended_transition.confirm_command}\``,
    `- Public action allowed: \`${report.triage_observation.public_action_allowed}\``,
    `- Evidence store: \`${report.evidence_store}\``,
    '',
  ].join('\n');
}

function recommendedStateForSignal(signal) {
  if (ALLOWED_TRIAGE_STATE_ROLES.includes(signal?.recommended_state)) return signal.recommended_state;
  if (signal?.signal_kind === 'missing-info-observation') return 'needs-info';
  if (signal?.signal_kind === 'label-suggestion-observation') return 'ready-for-agent';
  if (signal?.signal_kind === 'human-attention-candidate') return 'ready-for-human';
  return 'needs-info';
}

function categoryRoleForSignal(signal) {
  if (ALLOWED_TRIAGE_CATEGORY_ROLES.includes(signal?.category_role)) return signal.category_role;
  return signal?.signal_kind === 'label-suggestion-observation' ? 'bug' : 'enhancement';
}

function briefKindForState(state) {
  if (state === 'ready-for-agent') return 'agent-brief';
  if (state === 'ready-for-human') return 'human-handoff';
  if (state === 'wontfix') return 'wontfix-note';
  return 'triage-notes';
}

function reasonForRecommendedState(state, observation) {
  if (state === 'needs-info') return 'issue lacks enough actionable detail for implementation';
  if (state === 'ready-for-agent') return 'issue appears bounded enough for an AFK agent after confirmed transition';
  if (state === 'ready-for-human') return 'issue needs human judgment or ownership before delegation';
  if (state === 'wontfix') return 'candidate appears outside current scope and requires maintainer review';
  return observation.summary;
}

function briefBodyForState({ signal, recommendedState, triageObservation }) {
  const subject = signal?.subject ?? 'issue';
  if (recommendedState === 'ready-for-agent') {
    return [
      `Agent brief draft for ${subject}: ${signal?.summary ?? ''}`,
      'Confirm only when reproduction/context and verification expectations are durable enough for an AFK agent.',
    ].join('\n');
  }
  if (recommendedState === 'ready-for-human') {
    return [
      `Human handoff draft for ${subject}: ${signal?.summary ?? ''}`,
      'Reason: human judgment, ownership, or risk review is needed before agent delegation.',
    ].join('\n');
  }
  if (recommendedState === 'wontfix') {
    return [
      `Wontfix candidate note for ${subject}: ${signal?.summary ?? ''}`,
      'This recommendation must not auto-close or auto-label. A maintainer must review it explicitly.',
    ].join('\n');
  }
  return [
    `Triage notes draft for ${subject}: ${signal?.summary ?? ''}`,
    `Missing: ${(triageObservation.missing ?? []).join(', ') || 'specific reporter details'}.`,
  ].join('\n');
}

function riskFlagsForSignal(signal) {
  const flags = [];
  if (signal?.risk === 'high' || signal?.risk === 'unknown') flags.push(`risk:${signal.risk}`);
  for (const field of HUMAN_REVIEW_GUARD_FIELDS) {
    if (signal?.[field] === true) flags.push(field);
  }
  if (signal?.recommended_state === 'wontfix') flags.push('wontfix-candidate');
  return flags;
}

function issueUrlForSignal(signal, issue) {
  if (signal?.issue_url) return signal.issue_url;
  if (signal?.repo && issue) return `https://github.com/${signal.repo}/issues/${issue}`;
  return '';
}

function staleAfter(createdAt) {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return '';
  date.setUTCDate(date.getUTCDate() + 7);
  return date.toISOString();
}

export const replayIssueTriageReport = replayIssueBacklogTriage;
export const runIssueTriageReportReplaySuite = runIssueBacklogTriageReplaySuite;
export const buildIssueTriageReportRouteDecision = buildIssueBacklogTriageRouteDecision;

function issueNumberFromSubject(subject) {
  const match = String(subject ?? '').match(/issue-(\d+)/);
  return match ? Number(match[1]) : null;
}

function stableHash(value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 12);
}

async function main() {
  const routeTablePath = process.env.ROUTE_TABLE_PATH || DEFAULT_ROUTE_TABLE;
  const suite = await runIssueBacklogTriageReplaySuite({ routeTablePath });
  console.log(JSON.stringify(suite, null, 2));
  if (!suite.passed) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
