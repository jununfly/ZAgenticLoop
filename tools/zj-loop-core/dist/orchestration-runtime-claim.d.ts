import type { ContentAddressedArtifactStore } from './content-addressed-artifact-store.js';
import type { OrchestrationPlan } from './orchestration-plan.js';
import type { SqliteStateStore } from './sqlite-state-store.js';
export declare const ORCHESTRATION_TASK_CLAIM_SCHEMA: "zj-loop.orchestration_task_claim.v1";
export type RuntimeClaimResult = {
    schema: typeof ORCHESTRATION_TASK_CLAIM_SCHEMA;
    status: 'claimed' | 'duplicate' | 'blocked';
    event_id: string;
    side_effects_executed: false;
    reason?: string;
    revision?: number;
    current_revision?: number;
};
declare function claimIdentity(input: {
    network_id: string;
    event_id: string;
    plan_id: string;
    plan_revision: number;
    execution_id: string;
    task_id: string;
    node_id: string;
}): string;
declare function claimEventId(input: {
    network_id: string;
    event_id: string;
    plan_id: string;
    plan_revision: number;
    execution_id: string;
    task_id: string;
    node_id: string;
}): string;
export declare function claimOrchestrationTask(input: {
    stateStore: SqliteStateStore;
    artifactStore: ContentAddressedArtifactStore;
    network_id: string;
    execution_id: string;
    expected_revision: number;
    preflight_artifact_id: string;
    plan: OrchestrationPlan;
    task_id: string;
    node_id: string;
    enrollment: {
        node_id: string;
        network_id: string;
        status: 'approved' | 'pending' | 'revoked';
        capability_ceiling: string[];
    };
    now: string;
}): Promise<RuntimeClaimResult>;
export { claimEventId as orchestrationTaskClaimEventId, claimIdentity as orchestrationTaskClaimIdentity };
