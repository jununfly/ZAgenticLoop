import type { SqliteStateStore } from './sqlite-state-store.js';
import { type TrustedRunnerRegistryEntry, type TrustedRunnerRegistryMutation } from './trusted-runner-registry.js';
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
export declare function trustedRunnerRegistrySnapshotDigest(registry: TrustedRunnerRegistryEntry[]): string;
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
