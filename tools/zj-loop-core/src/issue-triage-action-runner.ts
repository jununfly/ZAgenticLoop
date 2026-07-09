import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import {
  buildLiveRunnerEvidence,
  validateLiveRunnerEvidence,
} from './live-runner-contract.js';
import { RouteStatus } from './route.js';

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

export async function readIssueTriageActionRequest(path: string) {
  return JSON.parse(await readFile(path, 'utf8'));
}

export function buildIssueTriageActionRequest(overrides: Record<string, unknown> = {}) {
  const request: any = {
    schema: ISSUE_TRIAGE_ACTION_REQUEST_SCHEMA,
    request_id: 'itar_issue_123_needs_info',
    source_report_id: 'issue-triage:jununfly/ZAgenticLoop:open-issues:last-24h:missing-info-observation:issue-123',
    repo: 'jununfly/ZAgenticLoop',
    issue: 123,
    source: 'issue-triage-report',
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

export function runIssueTriageActionRunner(input: {
  route: RouteStatus;
  request?: any;
  live?: boolean;
  createdAt?: string;
}) {
  const normalizedRequest = buildIssueTriageActionRequest(input.request ?? {});
  const decision = decideIssueTriageAction({
    route: input.route,
    request: normalizedRequest,
    live: input.live === true,
  });
  const evidence = buildEvidence({
    request: normalizedRequest,
    decision,
    live: input.live === true,
    createdAt: input.createdAt ?? '2026-07-08T00:00:00Z',
  });
  const validation = validateLiveRunnerEvidence(evidence);

  return {
    kind: 'zj-loop.issue-triage-action-runner-result',
    route_id: ROUTE_ID,
    dry_run: input.live !== true,
    decision,
    evidence,
    validation,
    run_id: stableHash(JSON.stringify({ decision, evidence })),
  };
}

function decideIssueTriageAction(input: { route?: RouteStatus; request: any; live: boolean }) {
  const routeValid = input.route?.enabled === true
    && input.route?.consumer_kind === CONSUMER_KIND
    && input.route?.execution_mode === 'dry-run'
    && input.route?.request_kind === 'triage-action-request';
  const requestValid = input.request?.schema === ISSUE_TRIAGE_ACTION_REQUEST_SCHEMA;
  const actionAllowed = actionMatchesAllowlist(input.request);
  const humanGuard = requiresHumanReview(input.request);
  const verifierMissing = missingVerifier(input.route, input.request);

  if (!input.route) return decision('rejected', 'route-not-found');
  if (!routeValid) return decision('rejected', 'route-contract-invalid');
  if (!requestValid) return decision('rejected', 'request-schema-invalid');
  if (input.live) return decision('rejected', 'live-side-effects-not-enabled');
  if (humanGuard) return decision('escalated', 'human-guard-matched');
  if (verifierMissing) return decision('rejected', `missing-verifier:${verifierMissing}`);
  if (!actionAllowed.allowed) return decision('rejected', actionAllowed.reason);
  return decision('dry-run-completed', 'triage-action-dry-run-completed');
}

function decision(status: string, reason: string) {
  return { status, reason };
}

function buildEvidence(input: { request: any; decision: { status: string; reason: string }; live: boolean; createdAt: string }) {
  const completion = completionFor({ request: input.request, decision: input.decision });
  return buildLiveRunnerEvidence({
    runner_id: RUNNER_ID,
    route_id: ROUTE_ID,
    consumer_kind: CONSUMER_KIND,
    execution_mode: input.live ? 'live' : 'dry-run',
    completion_form: completion.form,
    status: completion.status,
    dedupe_key: input.request.dedupe_key,
    created_at: input.createdAt,
    source: {
      kind: 'triage-action-request',
      id: input.request.request_id,
      url: issueUrl(input.request),
    },
    verifier_evidence: [
      { kind: 'route-table', route_id: ROUTE_ID, status: 'matched' },
      { kind: 'allowlist', requested_action: input.request.requested_action, status: input.decision.status },
      { kind: 'forbidden-side-effect-check', status: input.decision.status === 'dry-run-completed' ? 'passed' : 'not-executed' },
    ],
    side_effects: {
      executed: input.live && input.decision.status === 'dry-run-completed',
      level: sideEffectLevelFor(input.request),
      actions: actionsFor(input.request, input.decision, input.live),
    },
  });
}

function completionFor(input: { request: any; decision: { status: string } }) {
  if (input.decision.status === 'escalated') return { form: 'escalation-issue', status: 'escalated' };
  if (input.decision.status === 'rejected') return { form: 'triage-action-skipped', status: 'skipped' };
  if (input.request.requested_action === 'post-fixed-triage-comment') {
    return { form: 'triage-comment-posted', status: 'completed' };
  }
  return { form: 'triage-label-applied', status: 'completed' };
}

function actionsFor(request: any, decisionResult: { status: string }, live: boolean) {
  if (decisionResult.status !== 'dry-run-completed') return [];
  if (request.requested_action === 'post-fixed-triage-comment') {
    return [{ kind: 'issue-comment', template: request.action_value, mode: live ? 'live' : 'dry-run' }];
  }
  return [{ kind: 'label', label: request.action_value, mode: live ? 'live' : 'dry-run' }];
}

function sideEffectLevelFor(request: any) {
  return request?.requested_action === 'post-fixed-triage-comment' ? 'issue-comment' : 'label';
}

function actionMatchesAllowlist(request: any) {
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

function requiresHumanReview(request: any) {
  if (request?.risk === 'high' || request?.risk === 'unknown') return true;
  return HUMAN_GUARD_FIELDS.some((field) => request?.[field] === true);
}

function missingVerifier(route: RouteStatus | undefined, request: any) {
  const routeVerifiers = new Set(route?.capability_verifiers ?? []);
  return (request?.verifier_requirements ?? []).find((verifier: string) => !routeVerifiers.has(verifier)) ?? '';
}

function issueUrl(request: any) {
  return request?.repo && request?.issue ? `https://github.com/${request.repo}/issues/${request.issue}` : '';
}

function buildIssueTriageActionDedupeKey(request: any) {
  return [
    'issue-triage-action',
    request?.repo ?? 'unknown-repo',
    request?.issue ?? 'unknown-issue',
    request?.requested_action ?? 'unknown-action',
    request?.action_value ?? 'unknown-value',
  ].join(':');
}

function stableHash(value: string) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 12);
}
