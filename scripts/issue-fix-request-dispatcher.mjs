import { createHash } from 'node:crypto';

import { parseRouteTable } from './route-ci-failure.mjs';
import {
  ISSUE_FIX_REQUEST_SCHEMA,
  ROUTE_DECISION_SCHEMA,
  resolveIssueFixRequestDedupe,
} from './issue-fix-request-contract.mjs';

export function dispatchSignalToIssueFixRequest({
  routeTableText,
  routeId,
  signal,
  existingRequests = [],
  createdAt = new Date().toISOString(),
} = {}) {
  const route = parseRouteTable(routeTableText).routes.find((item) => item?.route_id === routeId);
  const routeDecision = buildRouteDecision({ route, routeId, signal, createdAt });

  if (!routeDecision.allowed) {
    return {
      action: 'denied',
      routeDecision,
      issueFixRequest: null,
    };
  }

  const duplicate = resolveIssueFixRequestDedupe({
    existingRequests,
    dedupeKey: routeDecision.dedupe_key,
  });
  if (duplicate.action === 'duplicate') {
    return {
      action: 'duplicate',
      routeDecision,
      issueFixRequest: buildIssueFixRequestFromDecision({
        signal,
        routeDecision,
        createdAt,
        status: 'duplicate',
        lifecycle: {
          linked_pr: null,
          consumed_by: null,
          closed_at: null,
          existing_request_id: duplicate.existing_request_id,
        },
      }),
    };
  }

  return {
    action: 'create-request',
    routeDecision,
    issueFixRequest: buildIssueFixRequestFromDecision({ signal, routeDecision, createdAt }),
  };
}

export function buildRouteDecision({ route, routeId, signal, createdAt = new Date().toISOString() }) {
  const base = {
    schema: ROUTE_DECISION_SCHEMA,
    decision_id: `rd_${stableHash([signal?.repo, routeId, signal?.signal_id].join(':'))}`,
    source_signal_id: signal?.signal_id ?? '',
    route_id: routeId,
    request_kind: route?.request_kind ?? '',
    target_consumer: route?.consumer ?? '',
    allowed: false,
    guards: {
      branch_allowed: false,
      consumer_allowed: false,
      route_enabled: route?.enabled === true,
    },
    dedupe_key: buildDedupeKey({ routeId, signal }),
    reason: '',
    source_run_id: signal?.source_run_id ?? '',
    created_at: createdAt,
  };

  if (!route) return { ...base, reason: 'route-not-found' };
  if (route.enabled !== true) return { ...base, reason: 'route-disabled' };
  if (route.request_kind !== 'issue-fix-request') {
    return { ...base, reason: 'route-kind-not-issue-fix-request' };
  }
  if (!signalMatchesRoute(route, signal)) {
    return { ...base, reason: 'signal-does-not-match-route' };
  }

  const branchAllowed = branchAllowedByRoute(route, signal?.head_branch);
  const consumerAllowed = consumerAllowedByRoute(route, route.consumer);
  const allowed = branchAllowed && consumerAllowed;

  return {
    ...base,
    allowed,
    guards: {
      ...base.guards,
      branch_allowed: branchAllowed,
      consumer_allowed: consumerAllowed,
    },
    reason: allowed ? 'route matched and guards passed' : 'route guard failed',
  };
}

export function buildIssueFixRequestFromDecision({
  signal,
  routeDecision,
  createdAt = new Date().toISOString(),
  status = 'requested',
  lifecycle = { linked_pr: null, consumed_by: null, closed_at: null },
}) {
  const consumerId = routeDecision.target_consumer;
  return {
    schema: ISSUE_FIX_REQUEST_SCHEMA,
    request_id: `ifr_${stableHash(routeDecision.dedupe_key)}`,
    status,
    created_at: createdAt,
    source_signal: {
      signal_id: signal?.signal_id ?? '',
      source: signal?.source ?? '',
      summary: signal?.summary ?? '',
      source_url: signal?.source_url ?? '',
    },
    route_decision: routeDecision,
    dedupe_key: routeDecision.dedupe_key,
    requested_consumer: {
      consumer_id: consumerId,
      capability: consumerCapability(consumerId),
    },
    fix_scope: {
      repo: signal?.repo ?? '',
      files_or_areas: signal?.fix_scope?.files_or_areas ?? [],
      non_goals: signal?.fix_scope?.non_goals ?? ['auto-merge'],
    },
    acceptance_criteria: signal?.acceptance_criteria ?? [
      'Open a verifier-backed Fix PR or produce failed/escalation evidence.',
    ],
    verification_gate: {
      commands: signal?.verification_commands ?? ['node --test scripts/issue-fix-request-contract.test.mjs'],
    },
    failure_policy: {
      on_failure: 'failed_requires_new_request',
      retry: 'new_request_only',
    },
    lifecycle,
  };
}

function signalMatchesRoute(route, signal) {
  const match = route?.match ?? {};
  const entries = Object.entries(match);
  if (entries.length === 0) return true;

  return entries.every(([key, allowedValues]) => {
    if (!Array.isArray(allowedValues) || allowedValues.length === 0) return true;
    return allowedValues.includes(signal?.[key]);
  });
}

function branchAllowedByRoute(route, branchName) {
  const allowlist = route?.guards?.branch_allowlist;
  if (!Array.isArray(allowlist) || allowlist.length === 0) return true;
  return allowlist.includes(branchName);
}

function consumerAllowedByRoute(route, consumer) {
  const allowlist = route?.guards?.fix_consumer_allowlist;
  if (!Array.isArray(allowlist) || allowlist.length === 0) return true;
  return allowlist.includes(consumer);
}

function buildDedupeKey({ routeId, signal }) {
  return [
    signal?.repo ?? 'unknown-repo',
    routeId ?? 'unknown-route',
    signal?.signal_id ?? 'unknown-signal',
    scopeHash(signal?.fix_scope),
  ].join(':');
}

function scopeHash(fixScope) {
  const areas = fixScope?.files_or_areas ?? [];
  const raw = Array.isArray(areas) && areas.length > 0 ? areas.join('-') : 'general';
  return raw
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'general';
}

function consumerCapability(consumerId) {
  const capabilities = {
    'ci-sweeper': 'deterministic-ci-repair',
    'pr-steward': 'pr-review-and-readiness-fix',
    'dependency-sweeper': 'patch-dependency-fix',
  };
  return capabilities[consumerId] ?? 'allowlisted-fix-consumer';
}

function stableHash(value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 12);
}
