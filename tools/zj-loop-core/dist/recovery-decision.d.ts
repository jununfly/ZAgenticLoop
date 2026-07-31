export declare const RECOVERY_DECISION_SCHEMA: "zj-loop.recovery_decision.v1";
export type RecoveryAction = 'adopt' | 'reconcile' | 'compensate' | 'abandon';
export type RecoveryLifecycleStatus = 'recovery-required' | 'recovery-decision-recorded' | 'recovery-adopted' | 'reconciliation-required' | 'recovery-planned' | 'abandoned';
export type RecoveryDecision = {
    schema: typeof RECOVERY_DECISION_SCHEMA;
    recovery_decision_id: string;
    event_id: string;
    plan_id: string;
    plan_revision: number;
    parent_execution_id: string;
    uncertainty_evidence_id: string;
    recovery_action: RecoveryAction;
    recovery_reason: string;
    decision_digest: string;
    human_id: string;
    device_id: string;
    session_id: string;
    authentication_method: string;
    decided_at: string;
    side_effects_executed: false;
    lifecycle_status: 'recovery-required';
    signature?: unknown;
};
export type RecoveryDecisionResult = {
    schema: typeof RECOVERY_DECISION_SCHEMA;
    status: 'accepted' | 'duplicate' | 'conflict' | 'stale-decision';
    lifecycle_status: 'recovery-decision-recorded';
    decision?: RecoveryDecision;
    current_decision?: RecoveryDecision;
    side_effects_executed: false;
};
export declare function createRecoveryDecision(input: Omit<RecoveryDecision, 'schema' | 'lifecycle_status'>): RecoveryDecision;
export declare function createRecoveryDecisionCoordinator(input: {
    parent_execution_id: string;
    plan_id: string;
    plan_revision: number;
}): {
    submitDecision(decision: RecoveryDecision): RecoveryDecisionResult;
    getDecision(): RecoveryDecision | null;
};
