import { type LocalExecutionPreflight } from './local-execution-preflight.js';
export declare const EXECUTION_POLICY_DECISION_SCHEMA: "zj-loop.execution_policy_decision.v1";
declare const REASONS: readonly ["preflight-invalid", "approval-invalid", "approval-expired", "preflight-expired", "policy-drift", "artifact-persistence-failed", "artifact-ref-invalid", "provider-protocol-invalid", "outcome-uncertain"];
export type ExecutionPolicyFailureReason = typeof REASONS[number];
export type ExecutionPolicyDecision = {
    schema: typeof EXECUTION_POLICY_DECISION_SCHEMA;
    status: 'provider-completed' | 'outcome-uncertain' | 'blocked';
    outcome: 'confirmed-success' | 'outcome-uncertain';
    network_id: string;
    execution_id: string;
    attempt: number;
    preflight_digest: string;
    approval_digest: string;
    artifact_refs: string[];
    reason_codes: ExecutionPolicyFailureReason[];
    side_effects_executed: false;
};
type PolicyInput = {
    preflight: LocalExecutionPreflight;
    approval: {
        status: 'accepted' | 'blocked';
        preflight_digest: string;
        approval_digest: string;
        expires_at: string;
    };
    now: string;
    artifacts: {
        status: 'persisted' | 'blocked';
        refs: string[];
    };
    process: {
        status: 'completed' | 'failed' | 'cancelled' | 'timed-out';
        success: boolean;
        exit_code: number | null;
        signal: string | null;
    };
};
export declare function evaluateExecutionPolicy(input: PolicyInput): ExecutionPolicyDecision;
export {};
