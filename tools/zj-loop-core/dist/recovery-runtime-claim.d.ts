import type { ContentAddressedArtifactStore } from './content-addressed-artifact-store.js';
import type { OrchestrationPlan } from './orchestration-plan.js';
import { type RuntimeClaimResult } from './orchestration-runtime-claim.js';
import { type RecoveryPlanRevisionRecord } from './recovery-plan-revision.js';
import type { SqliteStateStore } from './sqlite-state-store.js';
export declare function claimRecoveryTask(input: {
    recovery_record: RecoveryPlanRevisionRecord;
    parent_execution_id: string;
    network_id: string;
    stateStore?: SqliteStateStore;
    artifactStore?: ContentAddressedArtifactStore;
    expected_revision?: number;
    preflight_artifact_id?: string;
    plan?: OrchestrationPlan;
    task_id?: string;
    node_id?: string;
    enrollment?: {
        node_id: string;
        network_id: string;
        status: 'approved' | 'pending' | 'revoked';
        capability_ceiling: string[];
    };
    now?: string;
}): Promise<RuntimeClaimResult>;
