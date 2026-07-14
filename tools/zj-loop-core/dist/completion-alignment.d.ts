import type { RouteTableDocument } from './route.js';
export declare const COMPLETION_ALIGNMENT_LEDGER_SCHEMA = "zj-loop.completion-alignment-ledger.v1";
export type CompletionGateStatus = 'pass' | 'missing' | 'blocked' | 'stale' | 'fail';
export type CompletionCellStatus = 'complete' | 'incomplete' | 'blocked' | 'stale' | 'unsupported' | 'not-applicable-with-reason';
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
    next_actions: Array<{
        type: string;
        target: string;
        label: string;
    }>;
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
export declare function buildCompletionAlignmentLedger(input: {
    table: RouteTableDocument;
    routeTableText?: string;
    evidence?: CompletionEvidence[];
}): CompletionAlignmentLedger;
