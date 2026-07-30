import type { ContentAddressedArtifactStore } from './content-addressed-artifact-store.js';
import type { OrchestrationPreflightResult } from './orchestration-preflight.js';
import type { SqliteStateStore } from './sqlite-state-store.js';
export declare const ORCHESTRATION_PREFLIGHT_FACT_SCHEMA: "zj-loop.orchestration_preflight_fact.v1";
export type OrchestrationPreflightPersistenceResult = {
    status: 'recorded' | 'duplicate' | 'conflict';
    artifact_id: string;
    artifact_sha256: string;
    state_revision?: number;
    current_revision: number;
    reason?: string;
};
export declare function persistOrchestrationPreflight(input: {
    stateStore: SqliteStateStore;
    artifactStore: ContentAddressedArtifactStore;
    network_id: string;
    expected_revision: number;
    event_id: string;
    result: OrchestrationPreflightResult;
    now?: string;
}): Promise<OrchestrationPreflightPersistenceResult>;
