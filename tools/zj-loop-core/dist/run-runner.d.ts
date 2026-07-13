import { LOOP_HARNESS_SCHEMA_VERSION, LoopHarnessProtocolOutput } from './harness-protocol-contract.js';
export type LoopRunStatusReason = 'review-artifact-ready' | 'report-evidence-ready' | 'missing-runner-capability' | 'ambiguous-route' | 'needs-protocol-repair' | 'runtime-preflight-hard-stop';
export type LoopRunStateRecord = {
    schema: 'zj-loop.run_state.v1';
    schema_version: typeof LOOP_HARNESS_SCHEMA_VERSION;
    run_id: string;
    created_at: string;
    updated_at: string;
    goal: string;
    route_id: string;
    status: string;
    machine_envelope: LoopHarnessProtocolOutput['machine_envelope'];
    stop_signal?: unknown;
    confirmation_request?: unknown;
    resume_command?: string;
    review_artifacts: unknown[];
    evidence: unknown[];
};
export type LoopRunGoalInput = {
    root?: string;
    goal?: string;
    route?: string;
    planOnly?: boolean;
    source?: string;
    signalId?: string;
    runId?: string;
    now?: string;
};
export declare function runLoopGoal(input: LoopRunGoalInput): Promise<LoopHarnessProtocolOutput>;
export declare function resolveLoopRunRoute(input: {
    goal?: string;
    explicitRoute?: string;
}): {
    ok: true;
    route_id: string;
    reason: string;
    candidate_routes: string[];
} | {
    ok: false;
    reason: LoopRunStatusReason;
    candidate_routes: string[];
    recommended_route?: string;
};
export declare function getLoopRunStatePath(runId: string): string;
export declare function buildLoopRunStateRecord(input: {
    goal: string;
    output: LoopHarnessProtocolOutput;
    createdAt?: string;
    updatedAt?: string;
}): LoopRunStateRecord;
export declare function writeLoopRunState(input: {
    root?: string;
    goal: string;
    output: LoopHarnessProtocolOutput;
    now?: string;
}): Promise<{
    path: string;
    record: LoopRunStateRecord;
}>;
export declare function readLoopRunState(input: {
    root?: string;
    runId: string;
}): Promise<LoopRunStateRecord>;
