import { createHash } from 'node:crypto';

import type { RouteTableDocument, RouteTableRoute } from './route.js';

export const COMPLETION_ALIGNMENT_LEDGER_SCHEMA = 'zj-loop.completion-alignment-ledger.v1';

export type CompletionGateStatus = 'pass' | 'missing' | 'blocked' | 'stale' | 'fail';
export type CompletionCellStatus =
  | 'complete'
  | 'incomplete'
  | 'blocked'
  | 'stale'
  | 'unsupported'
  | 'not-applicable-with-reason';

export type CompletionEvidence = {
  route_id: string;
  adapter_id: string;
  architecture_integrity?: CompletionGateStatus;
  live_capability?: CompletionGateStatus;
  stop_recovery?: CompletionGateStatus;
  experience_continuity?: CompletionGateStatus;
  automatic_progression?: CompletionGateStatus;
  verification?: CompletionGateStatus;
  evidence?: string[];
};

export type CompletionAlignmentCell = {
  route_id: string;
  adapter_id: string;
  status: CompletionCellStatus;
  signal_initiation_mode?: string;
  not_applicable_reason?: string;
  gates: {
    architecture_integrity: CompletionGateStatus;
    live_capability: CompletionGateStatus;
    stop_recovery: CompletionGateStatus;
    experience_continuity: CompletionGateStatus;
    automatic_progression: CompletionGateStatus;
    verification: CompletionGateStatus;
  };
  evidence: string[];
  next_actions: Array<{ type: string; target: string; label: string }>;
};

export type CompletionAlignmentLedger = {
  schema: typeof COMPLETION_ALIGNMENT_LEDGER_SCHEMA;
  schema_version: 1;
  target: {
    id: string;
    digest: string;
    route_table_digest: string;
  };
  summary: Record<CompletionCellStatus, number>;
  cells: CompletionAlignmentCell[];
};

export function buildCompletionAlignmentLedger(input: {
  table: RouteTableDocument;
  routeTableText?: string;
  evidence?: CompletionEvidence[];
}): CompletionAlignmentLedger {
  const target = input.table.metadata?.completion_target;
  if (!target?.id || target.schema_version !== 1) {
    throw new Error('Route Table completion_target metadata is required to build a completion ledger');
  }

  const evidenceByCell = new Map((input.evidence ?? []).map((item) => [`${item.route_id}:${item.adapter_id}`, item]));
  const cells = allRoutes(input.table).flatMap((route) => Object.entries(route.completion_target?.adapters ?? {}).map(([adapterId, adapter]) => {
    const supplied = evidenceByCell.get(`${route.route_id}:${adapterId}`);
    if (adapter.applicability === 'not-applicable-with-reason') {
      return {
        route_id: route.route_id ?? 'unknown',
        adapter_id: adapterId,
        status: 'not-applicable-with-reason' as const,
        not_applicable_reason: adapter.not_applicable_reason,
        gates: unavailableGates(),
        evidence: supplied?.evidence ?? [],
        next_actions: [],
      };
    }

    const gates = {
      architecture_integrity: supplied?.architecture_integrity ?? 'pass',
      live_capability: supplied?.live_capability ?? liveCapabilityFor(route, adapterId),
      stop_recovery: supplied?.stop_recovery ?? 'missing',
      experience_continuity: supplied?.experience_continuity ?? 'missing',
      automatic_progression: supplied?.automatic_progression ?? 'missing',
      verification: supplied?.verification ?? 'missing',
    };
    const status = statusFor(gates);
    return {
      route_id: route.route_id ?? 'unknown',
      adapter_id: adapterId,
      status,
      signal_initiation_mode: adapter.signal_initiation_mode,
      gates,
      evidence: supplied?.evidence ?? route.execution?.recent_success_evidence ?? [],
      next_actions: nextActionsFor({ routeId: route.route_id ?? 'unknown', adapterId, status, gates }),
    };
  }));

  const summary = emptySummary();
  for (const cell of cells) summary[cell.status] += 1;
  return {
    schema: COMPLETION_ALIGNMENT_LEDGER_SCHEMA,
    schema_version: 1,
    target: {
      id: target.id,
      digest: digest(stableStringify(target)),
      route_table_digest: digest(input.routeTableText ?? stableStringify(input.table)),
    },
    summary,
    cells,
  };
}

function allRoutes(table: RouteTableDocument): RouteTableRoute[] {
  return [...(table.routes ?? []), ...(table.disabled_dispatch_routes ?? [])];
}

function unavailableGates(): CompletionAlignmentCell['gates'] {
  return {
    architecture_integrity: 'missing',
    live_capability: 'missing',
    stop_recovery: 'missing',
    experience_continuity: 'missing',
    automatic_progression: 'missing',
    verification: 'missing',
  };
}

function liveCapabilityFor(route: RouteTableRoute, adapterId: string): CompletionGateStatus {
  if (adapterId === 'workspace') return 'missing';
  const support = route.provider_support?.[adapterId];
  const hasRecentSuccess = (route.execution?.recent_success_evidence ?? []).length > 0;
  return support?.status === 'live-supported' && hasRecentSuccess ? 'pass' : 'missing';
}

function statusFor(gates: CompletionAlignmentCell['gates']): CompletionCellStatus {
  if (Object.values(gates).includes('stale')) return 'stale';
  if (Object.values(gates).includes('blocked')) return 'blocked';
  if (gates.live_capability === 'missing') return 'unsupported';
  return Object.values(gates).every((gate) => gate === 'pass') ? 'complete' : 'incomplete';
}

function nextActionsFor(input: {
  routeId: string;
  adapterId: string;
  status: CompletionCellStatus;
  gates: CompletionAlignmentCell['gates'];
}): CompletionAlignmentCell['next_actions'] {
  if (input.status === 'complete') return [];
  const missingGate = Object.entries(input.gates).find(([, status]) => status !== 'pass')?.[0] ?? 'completion';
  return [{
    type: input.status === 'unsupported' ? 'implement_adapter_capability' : 'supply_completion_evidence',
    target: `${input.routeId}:${input.adapterId}:${missingGate}`,
    label: `Resolve ${missingGate} for ${input.routeId} on ${input.adapterId}.`,
  }];
}

function emptySummary(): Record<CompletionCellStatus, number> {
  return {
    complete: 0,
    incomplete: 0,
    blocked: 0,
    stale: 0,
    unsupported: 0,
    'not-applicable-with-reason': 0,
  };
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`);
  return `{${entries.join(',')}}`;
}
