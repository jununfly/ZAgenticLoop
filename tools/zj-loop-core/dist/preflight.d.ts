import type { RouteStatus } from './route.js';
export declare const PREFLIGHT_RESULT_SCHEMA = "zj-loop.preflight_result.v1";
export type PreflightStatus = 'pass' | 'warn' | 'hard_stop';
export type PreflightExecutionLayer = 'report-only' | 'review-artifact' | 'live-side-effect';
export type PreflightLoopStatus = 'completed' | 'in_progress' | 'resumable' | 'failed';
export type PreflightSignalFacts = {
    provider?: string;
    subject?: {
        kind?: string;
        id?: string;
    };
    intent?: string;
    signal_id?: string;
};
export type PreflightRuntimeFacts = {
    actorRole?: string;
    credentials?: Record<string, string | undefined>;
    dirtyFiles?: string[];
    targetPaths?: string[];
    workUnitsRequested?: number;
    existingLoop?: {
        status: PreflightLoopStatus;
        orchestration_id: string;
    };
};
export type RuntimePreflightCheck = {
    id: string;
    status: PreflightStatus;
    reason: string;
};
export type RuntimePreflightResult = {
    schema: typeof PREFLIGHT_RESULT_SCHEMA;
    status: PreflightStatus;
    route_id: string;
    consumer: string;
    execution_layer: PreflightExecutionLayer;
    checks: RuntimePreflightCheck[];
    repairs_applied: Array<{
        field: string;
        value: string;
        reason: string;
    }>;
    warnings: string[];
    limits: {
        max_work_units: number;
    };
    loop_key: string;
    stop_signal?: {
        stop_code: string;
        layer: 'preflight';
        reason: string;
        next_steps: string[];
    };
};
export declare function evaluateRuntimePreflight(input: {
    route: RouteStatus;
    executionLayer: PreflightExecutionLayer;
    signal?: PreflightSignalFacts;
    runtime?: PreflightRuntimeFacts;
}): RuntimePreflightResult;
export declare function buildPreflightLoopKey(input: {
    route: Pick<RouteStatus, 'route_id'>;
    signal?: PreflightSignalFacts;
}): string;
