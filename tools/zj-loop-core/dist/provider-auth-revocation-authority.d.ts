import { type SqliteStateStore } from './sqlite-state-store.js';
import { type ProviderAuthAuthorityRevokeRequest, type ProviderAuthAuthorityRevokeResponse } from './provider-auth-authority-ipc-protocol.js';
export declare const PROVIDER_AUTH_REF_REVOKED_EVENT_SCHEMA: "zj-loop.provider_auth_ref_revoked.v1";
export declare function createProviderAuthStateStoreRevocationAuthority(input: {
    state_store: SqliteStateStore;
    network_id: string;
    authority_identity_digest: string;
    max_revision_retries?: number;
    now?: () => string;
}): {
    revoke(request: ProviderAuthAuthorityRevokeRequest): Promise<ProviderAuthAuthorityRevokeResponse>;
};
