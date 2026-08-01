import type { HumanSigner, HumanSignerIdentity, HumanSignature } from './human-signer.js';
import type { SqliteStateStore } from './sqlite-state-store.js';
export declare const HUMAN_AUTHORITY_SET_SCHEMA: "zj-loop.human_authority_set.v1";
export declare const HUMAN_AUTHORITY_SET_AGGREGATE_TYPE: "human-authority-set";
export declare const HUMAN_AUTHORITY_SET_AGGREGATE_ID: "network";
export declare const HUMAN_AUTHORITY_SET_EVENT_TYPE: "human-authority-set.initialized";
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
export type HumanAuthoritySetSnapshot = {
    network_id: string;
    revision: number;
    digest: string;
    active: HumanSignerIdentity[];
};
export declare function humanAuthoritySetDigest(active: HumanSignerIdentity[]): string;
export declare function createHumanAuthoritySetInitialization(input: {
    signer: HumanSigner;
    network_id: string;
    mutation_id: string;
    expected_revision: number;
    reason: string;
    occurred_at: string;
}): Promise<HumanAuthoritySetInitialization>;
export declare function recordHumanAuthoritySetInitialization(input: {
    stateStore: SqliteStateStore;
    initialization: HumanAuthoritySetInitialization;
    now?: string;
}): Promise<{
    status: 'recorded' | 'duplicate' | 'conflict' | 'blocked';
    snapshot: HumanAuthoritySetSnapshot;
    reason?: string;
}>;
export declare function readHumanAuthoritySet(input: {
    stateStore: SqliteStateStore;
    network_id: string;
}): Promise<HumanAuthoritySetSnapshot>;
