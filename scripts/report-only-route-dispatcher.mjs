#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { ROUTE_DECISION_SCHEMA } from './issue-fix-request-contract.mjs';
import { findRoute } from './route-ci-failure.mjs';

const DEFAULT_ROUTE_TABLE = 'zj-loop/zj-loop-route-table.yaml';
const REPORT_EVIDENCE_SCHEMA = 'zj-loop.report_evidence.v1';

export function dispatchSignalToReportOnlyRoute({
  routeTableText,
  routeId,
  signal,
  createdAt = new Date().toISOString(),
} = {}) {
  const route = findRoute(routeTableText, routeId);
  const routeDecision = buildReportOnlyRouteDecision({ route, routeId, signal, createdAt });

  if (!routeDecision.allowed) {
    return {
      action: 'denied',
      routeDecision,
      reportEvidence: null,
    };
  }

  return {
    action: routeDecision.requested_action,
    routeDecision,
    reportEvidence: buildReportEvidence({ route, signal, routeDecision, createdAt }),
  };
}

export function buildReportOnlyRouteDecision({ route, routeId, signal, createdAt = new Date().toISOString() }) {
  const routeEnabled = route?.enabled === true;
  const requestKindAllowed = route?.request_kind === 'report-only';
  const routeMatched = routeMatchesSignal(route, signal);
  const sideEffectsBlocked = route?.guards?.side_effects_allowed === false || route?.request_kind === 'report-only';
  const allowed = Boolean(route && routeEnabled && requestKindAllowed && routeMatched && sideEffectsBlocked);
  const signalId = signal?.signal_id ?? `${signal?.source ?? 'unknown'}:${signal?.subject ?? 'unknown'}`;

  return {
    schema: ROUTE_DECISION_SCHEMA,
    decision_id: `rd_report_${stableHash([routeId, signalId, signal?.repo].join(':'))}`,
    source_signal_id: signalId,
    signal_id: signalId,
    source: signal?.source ?? '',
    subject: signal?.subject ?? '',
    priority: signal?.priority ?? 'unknown',
    state: signal?.state ?? 'none',
    route: routeId,
    route_id: routeId,
    request_kind: route?.request_kind ?? '',
    requested_action: reportActionFor(routeId),
    target_consumer: route?.consumer ?? '',
    allowed,
    status: allowed ? 'closed' : 'denied',
    guards: {
      route_enabled: routeEnabled,
      request_kind_allowed: requestKindAllowed,
      route_matched: routeMatched,
      side_effects_blocked: sideEffectsBlocked,
      no_request_created: true,
    },
    risk: signal?.risk ?? 'unknown',
    confidence: signal?.confidence ?? 'medium',
    evidence: normalizeEvidence(signal?.evidence),
    producer: signal?.producer ?? 'daily-triage',
    dedupe_key: signal?.dedupe_key ?? buildDedupeKey({ routeId, signalId, subject: signal?.subject }),
    reason: reportOnlyReason({ route, routeEnabled, requestKindAllowed, routeMatched, sideEffectsBlocked }),
    source_run_id: signal?.source_run_id ?? '',
    created_at: createdAt,
  };
}

function buildReportEvidence({ route, signal, routeDecision, createdAt }) {
  return {
    schema: REPORT_EVIDENCE_SCHEMA,
    status: reportStatusFor(routeDecision.route_id),
    created_at: createdAt,
    route_decision: routeDecision,
    evidence_store: route?.evidence_store ?? 'zj-loop/STATE.md',
    summary: signal?.summary ?? signal?.subject ?? '',
    next_action: nextActionFor(routeDecision),
    side_effects: {
      issue_fix_request_created: false,
      activation_request_created: false,
      workflow_dispatched: false,
      consumer_work_started: false,
    },
  };
}

function routeMatchesSignal(route, signal) {
  if (!route) return false;
  const match = route.match ?? {};
  const entries = Object.entries(match);
  if (entries.length === 0) return true;

  return entries.every(([key, allowedValues]) => {
    if (!Array.isArray(allowedValues) || allowedValues.length === 0) return true;
    return allowedValues.includes(signal?.[key]);
  });
}

function reportOnlyReason({ route, routeEnabled, requestKindAllowed, routeMatched, sideEffectsBlocked }) {
  if (!route) return 'route-not-found';
  if (!routeEnabled) return 'route-disabled';
  if (!requestKindAllowed) return 'route-kind-not-report-only';
  if (!routeMatched) return 'signal-does-not-match-route';
  if (!sideEffectsBlocked) return 'side-effects-not-blocked';
  return 'report-only route matched';
}

function reportActionFor(routeId) {
  if (routeId === 'ignore') return 'ignore';
  return 'report';
}

function reportStatusFor(routeId) {
  if (routeId === 'ignore') return 'ignored';
  return 'reported';
}

function nextActionFor(routeDecision) {
  if (routeDecision.route_id === 'human') return 'human-review';
  if (routeDecision.route_id === 'ignore') return 'record-noise-reason';
  if (routeDecision.route_id === 'daily-triage-report') return 'record-daily-triage-state';
  return 'record-report-evidence';
}

function buildDedupeKey({ routeId, signalId, subject }) {
  return [routeId ?? 'unknown-route', signalId ?? 'unknown-signal', subject ?? 'unknown-subject'].join(':');
}

function normalizeEvidence(evidence) {
  if (Array.isArray(evidence)) return evidence;
  if (evidence) return [evidence];
  return [];
}

function stableHash(value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 12);
}

async function main() {
  const routeTablePath = process.env.ROUTE_TABLE_PATH || DEFAULT_ROUTE_TABLE;
  const routeTableText = await readFile(routeTablePath, 'utf8');
  const signal = JSON.parse(process.env.ROUTE_SIGNAL_JSON || '{}');
  const result = dispatchSignalToReportOnlyRoute({
    routeTableText,
    routeId: process.env.ROUTE_ID,
    signal,
    createdAt: process.env.CREATED_AT,
  });

  if (process.env.ROUTE_DECISION_OUT) {
    await writeFile(process.env.ROUTE_DECISION_OUT, `${JSON.stringify(result.routeDecision, null, 2)}\n`);
  }
  if (process.env.REPORT_EVIDENCE_OUT && result.reportEvidence) {
    await writeFile(process.env.REPORT_EVIDENCE_OUT, `${JSON.stringify(result.reportEvidence, null, 2)}\n`);
  }
  if (process.env.GITHUB_OUTPUT) {
    const lines = [
      `action=${result.action}`,
      `route=${result.routeDecision.route ?? ''}`,
      `request_kind=${result.routeDecision.request_kind ?? ''}`,
      `target_consumer=${result.routeDecision.target_consumer ?? ''}`,
      `reason=${result.routeDecision.reason ?? ''}`,
      `report_evidence_created=${result.reportEvidence ? 'true' : 'false'}`,
    ];
    await writeFile(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`, { flag: 'a' });
  }
  console.log(JSON.stringify({
    action: result.action,
    routeDecision: result.routeDecision,
    reportEvidenceCreated: Boolean(result.reportEvidence),
  }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
