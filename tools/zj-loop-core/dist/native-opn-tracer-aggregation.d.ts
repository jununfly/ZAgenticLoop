import type { SqliteStateStore } from './sqlite-state-store.js';
export declare const NATIVE_OPN_TRACER_AGGREGATION_SCHEMA: "zj-loop.native_opn_tracer_aggregation.v1";
export declare const NATIVE_OPN_TRACER_AGGREGATION_RECORDED_SCHEMA: "zj-loop.native_opn_tracer_aggregation_recorded.v1";
export type NativeOpnTracerMergeAuthorization = {
    source_commit_sha: string;
    target_ref: string;
    target_worktree_ref: string;
    strategy: 'fast-forward-only';
    scope_digest: string;
    deterministic_gate_digest: string;
};
export type NativeOpnTracerGraphAggregation = {
    responsibility_unit: 'human' | 'human+agent';
    human_id: string;
    lifecycle_status: 'review-pending';
    execution_bindings: Array<{
        execution_id: string;
        node_id: string;
        task_id: string;
        commit_sha: string;
        worktree_ref: string;
    }>;
    resource_isolation: Array<{
        node_id: string;
        resource_id: string;
        strategy: string;
        isolation_ref: string;
    }>;
    merge_authorization?: NativeOpnTracerMergeAuthorization;
};
export type NativeOpnTracerAggregation = {
    schema: typeof NATIVE_OPN_TRACER_AGGREGATION_SCHEMA;
    network_id: string;
    event_id: string;
    plan_id: string;
    plan_revision: number;
    plan_digest: string;
    aggregation_id: string;
    status: 'passed';
    execution_ids: string[];
    input_evidence_digests: string[];
    output_evidence_digest: string;
    aggregated_at: string;
    side_effects_executed: false;
    aggregation_digest: string;
    graph?: NativeOpnTracerGraphAggregation;
};
export type NativeOpnTracerAggregationFactResult = {
    schema: typeof NATIVE_OPN_TRACER_AGGREGATION_RECORDED_SCHEMA;
    status: 'recorded' | 'duplicate' | 'conflict' | 'blocked';
    event_id: string;
    side_effects_executed: false;
    revision?: number;
    current_revision?: number;
    reason?: string;
};
type Input = Omit<NativeOpnTracerAggregation, 'schema' | 'status' | 'side_effects_executed' | 'aggregation_digest'>;
export declare function createNativeOpnTracerAggregation(input: Input): NativeOpnTracerAggregation;
export declare function nativeOpnTracerAggregationDigest(aggregation: NativeOpnTracerAggregation): string;
export declare function recordNativeOpnTracerAggregation(input: {
    stateStore: SqliteStateStore;
    expected_revision: number;
    aggregation: NativeOpnTracerAggregation;
    now: string;
}): Promise<NativeOpnTracerAggregationFactResult>;
export {};
