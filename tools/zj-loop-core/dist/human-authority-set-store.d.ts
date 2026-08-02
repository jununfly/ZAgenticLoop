import type { HumanSigner, HumanSignerIdentity, HumanSignature } from './human-signer.js';
import type { SqliteStateStore, StateEvent } from './sqlite-state-store.js';
export declare const HUMAN_AUTHORITY_SET_SCHEMA: "zj-loop.human_authority_set.v1";
export declare const HUMAN_AUTHORITY_SET_AGGREGATE_TYPE: "human-authority-set";
export declare const HUMAN_AUTHORITY_SET_AGGREGATE_ID: "network";
export declare const HUMAN_AUTHORITY_SET_EVENT_TYPE: "human-authority-set.initialized";
export declare const HUMAN_AUTHORITY_SET_MUTATION_EVENT_TYPE: "human-authority-set.mutation";
export type HumanAuthoritySetMutationAction = 'add' | 'rotate' | 'revoke';
export type HumanAuthoritySetInitialization = {
    schema: typeof HUMAN_AUTHORITY_SET_SCHEMA;
    network_id: string;
    mutation_id: string;
    action: 'initialize';
    owner: HumanSignerIdentity;
    signer_fingerprint: string;
    reason: string;
    occurred_at: string;
    expected_revision: number;
    canonical_payload_digest: string;
    signature: HumanSignature;
};
export type HumanAuthoritySetMutation = {
    schema: typeof HUMAN_AUTHORITY_SET_SCHEMA;
    network_id: string;
    mutation_id: string;
    action: HumanAuthoritySetMutationAction;
    authority: HumanSignerIdentity;
    replacement?: HumanSignerIdentity;
    previous_authority_set_digest: string;
    target_authority_set_digest: string;
    signer_fingerprint: string;
    human_id: string;
    reason: string;
    occurred_at: string;
    expected_revision: number;
    canonical_payload_digest: string;
    signature: HumanSignature;
};
export type HumanAuthoritySetSnapshot = {
    network_id: string;
    revision: number;
    digest: string;
    active: HumanSignerIdentity[];
};
export type HumanAuthoritySetMutationBuildResult = {
    status: 'ready';
    mutation: HumanAuthoritySetMutation;
    snapshot: HumanAuthoritySetSnapshot;
} | {
    status: 'blocked' | 'conflict';
    snapshot: HumanAuthoritySetSnapshot;
    reason: string;
};
export type HumanAuthoritySetInitializationBuildResult = {
    status: 'ready';
    initialization: HumanAuthoritySetInitialization;
    snapshot: HumanAuthoritySetSnapshot;
} | {
    status: 'blocked' | 'conflict';
    snapshot: HumanAuthoritySetSnapshot;
    reason: string;
};
export declare function humanAuthoritySetDigest(active: HumanSignerIdentity[]): string;
export declare function createHumanAuthoritySetInitializationFromStore(input: {
    stateStore: SqliteStateStore;
    signer: HumanSigner;
    network_id: string;
    mutation_id: string;
    expected_revision: number;
    reason: string;
    occurred_at: string;
}): Promise<HumanAuthoritySetInitializationBuildResult>;
export declare function createHumanAuthoritySetMutationFromStore(input: {
    stateStore: SqliteStateStore;
    signer: HumanSigner;
    network_id: string;
    mutation_id: string;
    action: HumanAuthoritySetMutationAction;
    authority: HumanSignerIdentity;
    replacement?: HumanSignerIdentity;
    expected_revision: number;
    reason: string;
    occurred_at: string;
}): Promise<HumanAuthoritySetMutationBuildResult>;
export declare function replayHumanAuthoritySet(input: {
    network_id: string;
    revision: number;
    events: StateEvent[];
}): HumanAuthoritySetSnapshot;
export declare function readHumanAuthoritySet(input: {
    stateStore: SqliteStateStore;
    network_id: string;
}): Promise<HumanAuthoritySetSnapshot>;
export declare function recordHumanAuthoritySetInitialization(input: {
    stateStore: SqliteStateStore;
    initialization: HumanAuthoritySetInitialization;
    now?: string;
}): Promise<{
    status: 'recorded' | 'duplicate' | 'conflict' | 'blocked';
    snapshot: HumanAuthoritySetSnapshot;
    reason?: string;
}>;
export declare function recordHumanAuthoritySetMutation(input: {
    stateStore: SqliteStateStore;
    mutation: HumanAuthoritySetMutation;
    expected_revision: number;
    now?: string;
}): Promise<{
    status: 'recorded' | 'duplicate' | 'conflict' | 'blocked';
    snapshot: HumanAuthoritySetSnapshot;
    reason?: string;
}>;
