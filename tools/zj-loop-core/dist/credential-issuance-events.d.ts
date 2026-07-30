import type { StateEventInput } from './sqlite-state-store.js';
export declare function createCredentialIssueIntentEvent(input: {
    request_id: string;
    network_id: string;
    node_id: string;
    credential_id: string;
    issuance_digest: string;
    capabilities: string[];
    issued_at: string;
    expires_at: string;
    intent_expires_at: string;
}): StateEventInput;
export declare function createCredentialClaimEvent(input: {
    request_id: string;
    credential_id: string;
    claimed_at: string;
}): StateEventInput;
export declare function createCredentialRevokeEvent(input: {
    request_id: string;
    credential_id: string;
    revoked_at: string;
    reason: string;
}): StateEventInput;
export declare function createCredentialExpireEvent(input: {
    request_id: string;
    credential_id: string;
    expired_at: string;
}): StateEventInput;
export declare function createNodeRevokeEvent(input: {
    request_id: string;
    network_id: string;
    node_id: string;
    revoked_at: string;
    reason: string;
}): StateEventInput;
