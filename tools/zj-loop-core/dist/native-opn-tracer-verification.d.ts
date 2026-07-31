import type { SqliteStateStore } from './sqlite-state-store.js';
export declare const NATIVE_OPN_TRACER_VERIFICATION_SCHEMA: "zj-loop.native_opn_tracer_verification.v1";
export declare const NATIVE_OPN_TRACER_VERIFICATION_RECORDED_SCHEMA: "zj-loop.native_opn_tracer_verification_recorded.v1";
export type NativeOpnTracerVerification = {
    schema: typeof NATIVE_OPN_TRACER_VERIFICATION_SCHEMA;
    network_id: string;
    event_id: string;
    plan_id: string;
    plan_revision: number;
    plan_digest: string;
    aggregation_id: string;
    aggregation_digest: string;
    verifier_id: string;
    excluded_node_ids: string[];
    status: 'passed' | 'failed';
    conditions: string[];
    satisfied_conditions: string[];
    failed_conditions: string[];
    evidence_digest: string;
    checked_at: string;
    side_effects_executed: false;
    verification_digest: string;
};
export type NativeOpnTracerVerificationFactResult = {
    schema: typeof NATIVE_OPN_TRACER_VERIFICATION_RECORDED_SCHEMA;
    status: 'recorded' | 'duplicate' | 'conflict' | 'blocked';
    event_id: string;
    side_effects_executed: false;
    revision?: number;
    current_revision?: number;
    reason?: string;
};
type Input = Omit<NativeOpnTracerVerification, 'schema' | 'side_effects_executed' | 'verification_digest'>;
export declare function createNativeOpnTracerVerification(input: Input): NativeOpnTracerVerification;
export declare function nativeOpnTracerVerificationDigest(verification: NativeOpnTracerVerification): string;
export declare function validateNativeOpnTracerVerification(verification: NativeOpnTracerVerification): {
    status: 'valid' | 'blocked';
    errors: string[];
};
export declare function recordNativeOpnTracerVerification(input: {
    stateStore: SqliteStateStore;
    expected_revision: number;
    verification: NativeOpnTracerVerification;
    now: string;
}): Promise<NativeOpnTracerVerificationFactResult>;
export {};
