import type { ContentAddressedArtifactStore } from './content-addressed-artifact-store.js';
import { type RecoveryPlanRevisionRecord } from './recovery-plan-revision.js';
import type { SqliteStateStore } from './sqlite-state-store.js';
export declare const RECOVERY_PLAN_REVISION_FACT_SCHEMA: "zj-loop.recovery_plan_revision_fact.v1";
export type RecoveryPlanRevisionPersistenceResult = {
    status: 'recorded' | 'duplicate' | 'conflict';
    artifact_id: string;
    artifact_sha256: string;
    state_revision?: number;
    current_revision: number;
    reason?: string;
};
export declare function persistRecoveryPlanRevisionRecord(input: {
    stateStore: SqliteStateStore;
    artifactStore: ContentAddressedArtifactStore;
    network_id: string;
    expected_revision: number;
    record: RecoveryPlanRevisionRecord;
    now?: string;
}): Promise<RecoveryPlanRevisionPersistenceResult>;
