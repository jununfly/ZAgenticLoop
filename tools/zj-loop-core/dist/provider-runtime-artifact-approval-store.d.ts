import { type ProviderRuntimeArtifactApproval } from './provider-runtime-artifact-approval.js';
import type { ProviderRuntimeArtifactManifest } from './provider-runtime-artifact-manifest.js';
import type { SqliteStateStore } from './sqlite-state-store.js';
export declare const PROVIDER_RUNTIME_ARTIFACT_APPROVAL_RECORDED_SCHEMA: "zj-loop.provider_runtime_artifact_approval_recorded.v1";
export declare const PROVIDER_RUNTIME_ARTIFACT_APPROVAL_AGGREGATE_TYPE: "provider-runtime-artifact-approval";
export declare const PROVIDER_RUNTIME_ARTIFACT_APPROVAL_EVENT_TYPE: "provider-runtime-artifact.approved";
type Expected = {
    network_id: string;
    node_id: string;
    device_id: string;
    manifest: Pick<ProviderRuntimeArtifactManifest, 'artifact_id' | 'manifest_digest' | 'profile' | 'platform'>;
};
export type ProviderRuntimeArtifactApprovalFactResult = {
    schema: typeof PROVIDER_RUNTIME_ARTIFACT_APPROVAL_RECORDED_SCHEMA;
    status: 'recorded' | 'duplicate' | 'conflict' | 'blocked';
    approval_id: string;
    side_effects_executed: false;
    revision?: number;
    current_revision?: number;
    reason?: string;
};
export type ProviderRuntimeArtifactApprovalReadResult = {
    status: 'valid';
    approval: ProviderRuntimeArtifactApproval;
    state_revision: number;
} | {
    status: 'blocked';
    reason: string;
    state_revision?: number;
};
export declare function recordProviderRuntimeArtifactApproval(input: {
    stateStore: SqliteStateStore;
    approval: ProviderRuntimeArtifactApproval;
    expected_revision: number;
    now?: string;
}): Promise<ProviderRuntimeArtifactApprovalFactResult>;
export declare function readProviderRuntimeArtifactApproval(input: {
    stateStore: SqliteStateStore;
    expected: Expected;
    now?: string;
}): Promise<ProviderRuntimeArtifactApprovalReadResult>;
export {};
