#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import {
  buildLiveRunnerEvidence,
  validateLiveRunnerEvidence,
} from './live-runner-contract.mjs';
import { findRoute } from './route-ci-failure.mjs';

const DEFAULT_ROUTE_TABLE = 'zj-loop/zj-loop-route-table.yaml';
const ROUTE_ID = 'issue-triage-action';
const RUNNER_ID = 'issue-triage-action';
const CONSUMER_KIND = 'triage-action-consumer';

export const ISSUE_TRIAGE_ACTION_REQUEST_SCHEMA = 'zj-loop.issue_triage_action_request.v1';

export const ALLOWED_TRIAGE_LABELS = Object.freeze([
  'needs-info',
  'duplicate-candidate',
  'ready-for-roadmap-review',
]);

export const FIXED_COMMENT_TEMPLATES = Object.freeze([
  'needs-info-request',
  'duplicate-candidate-note',
  'roadmap-review-ready-note',
]);

const HUMAN_GUARD_FIELDS = Object.freeze([
  'security_or_privacy_related',
  'auth_billing_legal_related',
  'destructive_action_required',
  'formal_issue_lifecycle_transition_required',
  'assignment_required',
  'milestone_required',
  'close_reopen_required',
  'batch_mutation_required',
]);

export function buildIssueTriageActionRequest(overrides = {}) {
  const request = {
    schema: ISSUE_TRIAGE_ACTION_REQUEST_SCHEMA,
    request_id: 'itar_issue_123_needs_info',
    source_report_id: 'issue-backlog-triage:jununfly/ZAgenticLoop:open-issues:last-24h:missing-info-observation:issue-123',
    repo: 'jununfly/ZAgenticLoop',
    issue: 123,
    source: 'issue-backlog-triage',
    requested_action: 'apply-allowlisted-label',
    action_value: 'needs-info',
    risk: 'low',
    confidence: 'high',
    verifier_requirements: ['route-replay', 'allowlisted-triage-action', 'forbidden-side-effect-check'],
    evidence: ['https://github.com/jununfly/ZAgenticLoop/issues/123'],
    created_at: '2026-07-08T00:00:00Z',
    ...overrides,
  };
  request.dedupe_key ??= buildIssueTriageActionDedupeKey(request);
  return request;
}

export function runIssueTriageActionRunner({
  routeTableText,
  request,
  live = false,
  createdAt = '2026-07-08T00:00:00Z',
} = {}) {
  const route = findRoute(routeTableText, ROUTE_ID);
  const normalizedRequest = buildIssueTriageActionRequest(request ?? {});
  const decision = decideIssueTriageAction({ route, request: normalizedRequest, live });
  const evidence = buildEvidence({ request: normalizedRequest, decision, live, createdAt });
  const validation = validateLiveRunnerEvidence(evidence);

  return {
    kind: 'zj-loop.issue-triage-action-runner-result',
    route_id: ROUTE_ID,
    dry_run: !live,
    decision,
    evidence,
    validation,
  };
}

export async function runIssueTriageActionReplaySuite({
  routeTablePath = DEFAULT_ROUTE_TABLE,
  routeTableText,
  scenarios = DEFAULT_ISSUE_TRIAGE_ACTION_SCENARIOS,
} = {}) {
  const resolvedRouteTableText = routeTableText ?? await readFile(routeTablePath, 'utf8');
  const results = scenarios.map((scenario) => {
    const result = runIssueTriageActionRunner({
      routeTableText: resolvedRouteTableText,
      request: scenario.request,
      live: scenario.live ?? false,
    });
    return {
      name: scenario.name,
      expected: scenario.expectStatus,
      actual: result.decision.status,
      pass: result.decision.status === scenario.expectStatus && result.validation.ok,
      result,
    };
  });

  return {
    schemaVersion: 1,
    kind: 'zj-loop-issue-triage-action-replay-suite',
    routeTablePath,
    passed: results.every((result) => result.pass),
    results,
  };
}

export const DEFAULT_ISSUE_TRIAGE_ACTION_SCENARIOS = Object.freeze([
  {
    name: 'allowlisted-label-dry-run',
    expectStatus: 'dry-run-completed',
    request: buildIssueTriageActionRequest(),
  },
  {
    name: 'fixed-comment-dry-run',
    expectStatus: 'dry-run-completed',
    request: buildIssueTriageActionRequest({
      request_id: 'itar_issue_124_comment',
      issue: 124,
      requested_action: 'post-fixed-triage-comment',
      action_value: 'needs-info-request',
    }),
  },
  {
    name: 'unsupported-label-rejected',
    expectStatus: 'rejected',
    request: buildIssueTriageActionRequest({
      request_id: 'itar_issue_125_bad_label',
      issue: 125,
      action_value: 'bug',
    }),
  },
  {
    name: 'freeform-comment-rejected',
    expectStatus: 'rejected',
    request: buildIssueTriageActionRequest({
      request_id: 'itar_issue_126_freeform_comment',
      issue: 126,
      requested_action: 'post-fixed-triage-comment',
      action_value: 'Please paste logs and screenshots.',
    }),
  },
  {
    name: 'human-guard-escalated',
    expectStatus: 'escalated',
    request: buildIssueTriageActionRequest({
      request_id: 'itar_issue_127_security',
      issue: 127,
      risk: 'high',
      security_or_privacy_related: true,
    }),
  },
]);

function decideIssueTriageAction({ route, request, live }) {
  const routeValid = route?.enabled === true
    && route?.consumer_kind === CONSUMER_KIND
    && route?.execution?.mode === 'dry-run'
    && route?.request_kind === 'triage-action-request';
  const requestValid = request?.schema === ISSUE_TRIAGE_ACTION_REQUEST_SCHEMA;
  const actionAllowed = actionMatchesAllowlist(request);
  const humanGuard = requiresHumanReview(request);
  const verifierMissing = missingVerifier(route, request);

  if (!route) return decision('rejected', 'route-not-found');
  if (!routeValid) return decision('rejected', 'route-contract-invalid');
  if (!requestValid) return decision('rejected', 'request-schema-invalid');
  if (live) return decision('rejected', 'live-side-effects-not-enabled');
  if (humanGuard) return decision('escalated', 'human-guard-matched');
  if (verifierMissing) return decision('rejected', `missing-verifier:${verifierMissing}`);
  if (!actionAllowed.allowed) return decision('rejected', actionAllowed.reason);
  return decision('dry-run-completed', 'triage-action-dry-run-completed');
}

function decision(status, reason) {
  return { status, reason };
}

function buildEvidence({ request, decision, live, createdAt }) {
  const completion = completionFor({ request, decision });
  return buildLiveRunnerEvidence({
    runner_id: RUNNER_ID,
    route_id: ROUTE_ID,
    consumer_kind: CONSUMER_KIND,
    execution_mode: live ? 'live' : 'dry-run',
    completion_form: completion.form,
    status: completion.status,
    dedupe_key: request.dedupe_key,
    created_at: createdAt,
    source: {
      kind: 'triage-action-request',
      id: request.request_id,
      url: issueUrl(request),
    },
    verifier_evidence: [
      { kind: 'route-table', route_id: ROUTE_ID, status: 'matched' },
      { kind: 'allowlist', requested_action: request.requested_action, status: decision.status },
      { kind: 'forbidden-side-effect-check', status: decision.status === 'dry-run-completed' ? 'passed' : 'not-executed' },
    ],
    side_effects: {
      executed: live && decision.status === 'dry-run-completed',
      level: sideEffectLevelFor(request),
      actions: actionsFor(request, decision, live),
    },
  });
}

function completionFor({ request, decision }) {
  if (decision.status === 'escalated') return { form: 'escalation-issue', status: 'escalated' };
  if (decision.status === 'rejected') return { form: 'triage-action-skipped', status: 'skipped' };
  if (request.requested_action === 'post-fixed-triage-comment') {
    return { form: 'triage-comment-posted', status: 'completed' };
  }
  return { form: 'triage-label-applied', status: 'completed' };
}

function actionsFor(request, decision, live) {
  if (decision.status !== 'dry-run-completed') return [];
  if (request.requested_action === 'post-fixed-triage-comment') {
    return [{ kind: 'issue-comment', template: request.action_value, mode: live ? 'live' : 'dry-run' }];
  }
  return [{ kind: 'label', label: request.action_value, mode: live ? 'live' : 'dry-run' }];
}

function sideEffectLevelFor(request) {
  return request?.requested_action === 'post-fixed-triage-comment' ? 'issue-comment' : 'label';
}

function actionMatchesAllowlist(request) {
  if (request?.requested_action === 'apply-allowlisted-label') {
    return ALLOWED_TRIAGE_LABELS.includes(request.action_value)
      ? { allowed: true, reason: 'label-allowlisted' }
      : { allowed: false, reason: 'label-not-allowlisted' };
  }
  if (request?.requested_action === 'post-fixed-triage-comment') {
    return FIXED_COMMENT_TEMPLATES.includes(request.action_value)
      ? { allowed: true, reason: 'comment-template-fixed' }
      : { allowed: false, reason: 'comment-template-not-fixed' };
  }
  return { allowed: false, reason: 'unsupported-requested-action' };
}

function requiresHumanReview(request) {
  if (request?.risk === 'high' || request?.risk === 'unknown') return true;
  return HUMAN_GUARD_FIELDS.some((field) => request?.[field] === true);
}

function missingVerifier(route, request) {
  const routeVerifiers = new Set(route?.capabilities?.verifiers ?? []);
  return (request?.verifier_requirements ?? []).find((verifier) => !routeVerifiers.has(verifier)) ?? '';
}

function issueUrl(request) {
  return request?.repo && request?.issue ? `https://github.com/${request.repo}/issues/${request.issue}` : '';
}

function buildIssueTriageActionDedupeKey(request) {
  return [
    'issue-triage-action',
    request?.repo ?? 'unknown-repo',
    request?.issue ?? 'unknown-issue',
    request?.requested_action ?? 'unknown-action',
    request?.action_value ?? 'unknown-value',
  ].join(':');
}

function stableHash(value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 12);
}

async function main() {
  const args = process.argv.slice(2);
  const requestPath = args.find((arg) => !arg.startsWith('--'));
  const live = args.includes('--live');
  const routeTablePath = process.env.ROUTE_TABLE_PATH || DEFAULT_ROUTE_TABLE;
  const routeTableText = await readFile(routeTablePath, 'utf8');
  const request = requestPath ? JSON.parse(await readFile(requestPath, 'utf8')) : undefined;
  const result = request
    ? runIssueTriageActionRunner({ routeTableText, request, live })
    : await runIssueTriageActionReplaySuite({ routeTableText });
  console.log(JSON.stringify({ run_id: stableHash(JSON.stringify(result)), ...result }, null, 2));
  if (result.passed === false || result.validation?.ok === false) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
