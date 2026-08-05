import { type SqliteStateStore } from './sqlite-state-store.js';
import { type ProviderAuthAuthorityForegroundService } from './provider-auth-authority-foreground-service.js';
import type { Socket } from 'node:net';
import { type ProviderAuthAuthorityStartConfig } from './provider-auth-authority-start-config.js';
export type ProviderAuthAuthorityStartAssembly = {
    service: ProviderAuthAuthorityForegroundService;
    state_store: SqliteStateStore;
    close(): Promise<void>;
};
export declare function createProviderAuthAuthorityStartAssembly(input: {
    socket_path: string;
    correlation_id: string;
    authority_contract_digest: string;
    network_id: string;
    authority_identity_digest: string;
    state_store_identity_digest: string;
    state_store_path: string;
    binding_path: string;
    process_identity_digest: string;
    verify_peer: (socket: Socket) => Promise<boolean> | boolean;
    process_id?: number;
    now?: () => string;
    max_revision_retries?: number;
}): ProviderAuthAuthorityStartAssembly;
export declare function createProviderAuthAuthorityStartAssemblyFromConfig(input: {
    config: ProviderAuthAuthorityStartConfig;
    verify_peer: (socket: Socket) => Promise<boolean> | boolean;
    process_id?: number;
    now?: () => string;
    max_revision_retries?: number;
}): ProviderAuthAuthorityStartAssembly;
