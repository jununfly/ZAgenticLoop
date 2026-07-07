import { createHash } from 'node:crypto';

export function stableHash(value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 12);
}

export function normalizeEvidence(evidence) {
  if (Array.isArray(evidence)) return evidence;
  if (evidence === undefined || evidence === null) return [];
  return [evidence];
}

export function routeMatchesSignal(route, signal) {
  if (!route) return false;
  const match = route.match ?? {};
  const entries = Object.entries(match);
  if (entries.length === 0) return true;

  return entries.every(([key, allowedValues]) => {
    if (!Array.isArray(allowedValues) || allowedValues.length === 0) return true;
    return allowedValues.includes(signal?.[key]);
  });
}

export function buildRouteDecisionId({ prefix, parts }) {
  return `${prefix}_${stableHash((parts ?? []).join(':'))}`;
}

export function buildRouteMatchDiagnostics({ route, signal, expectedRequestKind }) {
  return {
    route_enabled: route?.enabled === true,
    request_kind_allowed: route?.request_kind === expectedRequestKind,
    route_matched: routeMatchesSignal(route, signal),
  };
}

export function buildSideEffects(flagNames, overrides = {}) {
  return Object.fromEntries((flagNames ?? []).map((flag) => [flag, overrides[flag] === true]));
}

export function buildDuplicateEvidence({ status, existingId, existingUrl }) {
  return {
    status,
    existing_request_id: existingId ?? '',
    existing_request_url: existingUrl ?? '',
  };
}

export function buildReportEvidenceBase({
  schema,
  status,
  createdAt,
  routeDecision,
  evidenceStore,
  summary,
  nextAction,
  sideEffects,
}) {
  return {
    schema,
    status,
    created_at: createdAt,
    route_decision: routeDecision,
    evidence_store: evidenceStore,
    summary,
    next_action: nextAction,
    side_effects: sideEffects,
  };
}
