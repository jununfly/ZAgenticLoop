import type { SqliteStateStore } from './sqlite-state-store.js';
import { createTrustedRunnerRegistryMutation, type TrustedRunnerRegistryEntry, type TrustedRunnerRegistryMutation, type TrustedRunnerRegistryMutationAction } from './trusted-runner-registry.js';
export declare const TRUSTED_RUNNER_REGISTRY_AGGREGATE_TYPE: "trusted-runner-registry";
export declare const TRUSTED_RUNNER_REGISTRY_AGGREGATE_ID: "network";
export declare const TRUSTED_RUNNER_REGISTRY_EVENT_TYPE: "trusted-runner-registry.mutation";
export type TrustedRunnerRegistrySnapshot = {
    network_id: string;
    revision: number;
    digest: string;
    registry: TrustedRunnerRegistryEntry[];
};
export type TrustedRunnerRegistryRead = {
    snapshot: TrustedRunnerRegistrySnapshot;
    history: TrustedRunnerRegistryMutation[];
};
export type TrustedRunnerRegistryRecordResult = TrustedRunnerRegistryRead & {
    status: 'recorded' | 'duplicate' | 'conflict' | 'blocked';
    revision?: number;
    reason?: string;
};
export type TrustedRunnerRegistryMutationBuildResult = {
    status: 'ready';
    mutation: TrustedRunnerRegistryMutation;
    snapshot: TrustedRunnerRegistrySnapshot;
} | {
    status: 'blocked' | 'conflict';
    snapshot: TrustedRunnerRegistrySnapshot;
    reason: string;
};
export type TrustedRunnerAdmissionBinding = {
    network_id: string;
    runner_id: string;
    registry_revision: number;
    registry_snapshot_digest: string;
    required_capabilities: string[];
    capabilities: string[];
    capabilities_digest: string;
};
export type TrustedRunnerExecutionAdmissionResult = {
    status: 'admitted';
    binding: TrustedRunnerAdmissionBinding;
} | {
    status: 'blocked';
    reason: string;
};
export declare function trustedRunnerRegistrySnapshotDigest(registry: TrustedRunnerRegistryEntry[]): string;
export declare function createTrustedRunnerRegistryMutationFromStore(input: {
    stateStore: SqliteStateStore;
    signer: Parameters<typeof createTrustedRunnerRegistryMutation>[0]['signer'];
    network_id: string;
    mutation_id: string;
    action: TrustedRunnerRegistryMutationAction;
    runner_id: string;
    new_public_key_fingerprint?: string;
    capabilities?: string[];
    reason: string;
    occurred_at: string;
}): Promise<TrustedRunnerRegistryMutationBuildResult>;
export declare function admitTrustedRunnerExecution(input: {
    snapshot: TrustedRunnerRegistrySnapshot;
    runner_id: string;
    required_capabilities: string[];
    expected_registry_revision?: number;
    expected_registry_snapshot_digest?: string;
}): TrustedRunnerExecutionAdmissionResult;
export declare function readTrustedRunnerRegistry(input: {
    stateStore: SqliteStateStore;
    network_id: string;
}): Promise<TrustedRunnerRegistryRead>;
export declare function recordTrustedRunnerRegistryMutation(input: {
    stateStore: SqliteStateStore;
    mutation: TrustedRunnerRegistryMutation;
    expected_revision: number;
    now?: string;
}): Promise<TrustedRunnerRegistryRecordResult>;
