export declare const RECOVERY_PLAN_REVISION_SCHEMA: "zj-loop.recovery_plan_revision.v1";
export type RecoveryPlanRevisionRecord = {
    schema: typeof RECOVERY_PLAN_REVISION_SCHEMA;
    recovery_plan_id: string;
    event_id: string;
    plan_id: string;
    plan_revision: number;
    parent_plan_id: string;
    parent_plan_revision: number;
    parent_execution_id: string;
    recovery_decision_id: string;
    uncertainty_evidence_id: string;
    orchestration_plan_artifact_id: string;
    plan_digest: string;
    grant_digest: string;
    resource_isolation_profile: string;
    status: 'recovery-planned';
    repreflight_artifact_id: string | null;
    created_by: string;
    created_at: string;
    side_effects_executed: false;
};
export type RecoveryPlanRevisionReadiness = {
    status: 'execution-ready' | 'blocked';
    side_effects_executed: false;
    reason?: string;
};
export declare function createRecoveryPlanRevisionRecord(input: Omit<RecoveryPlanRevisionRecord, 'schema' | 'status' | 'repreflight_artifact_id' | 'side_effects_executed'> & {
    side_effects_executed?: false;
}): RecoveryPlanRevisionRecord;
export declare function evaluateRecoveryPlanRevisionReadiness(input: {
    record: RecoveryPlanRevisionRecord;
    artifact_id?: string;
    preflight?: {
        schema?: unknown;
        status?: unknown;
        side_effects_executed?: unknown;
        plan_id?: unknown;
        plan_revision?: unknown;
        plan_digest?: unknown;
        grant_digest?: unknown;
    };
}): RecoveryPlanRevisionReadiness;
