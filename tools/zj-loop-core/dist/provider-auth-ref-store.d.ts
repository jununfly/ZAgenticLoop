import type { ProviderAuthRef } from './provider-auth-runtime.js';
import type { SqliteStateStore } from './sqlite-state-store.js';
export declare const PROVIDER_AUTH_REF_ISSUED_EVENT_TYPE: "provider-auth-ref.issued";
export declare const PROVIDER_AUTH_REF_REVOKED_EVENT_TYPE: "provider-auth-ref.revoked";
export type ProviderAuthRefResolver = {
    resolve(input: {
        auth_ref_digest: string;
    }): Promise<ProviderAuthRef | undefined>;
};
export declare function createProviderAuthRefStateStoreResolver(input: {
    stateStore: SqliteStateStore;
    network_id: string;
}): ProviderAuthRefResolver;
