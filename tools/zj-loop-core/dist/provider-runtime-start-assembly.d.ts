import { type SqliteStateStore } from './sqlite-state-store.js';
import { type ProviderRuntimeForegroundService } from './provider-runtime-foreground-service.js';
import type { ProviderAuthRuntimeIpcLauncher } from './provider-auth-runtime-ipc-launcher.js';
import type { ProviderAuthRuntime } from './provider-auth-runtime.js';
import { type ProviderRuntimeStartConfig } from './provider-runtime-start-config.js';
import type { ProviderAuthRefResolver } from './provider-auth-ref-store.js';
export type ProviderRuntimeStartAssembly = {
    service: ProviderRuntimeForegroundService;
    state_store: SqliteStateStore;
    runtime: ProviderAuthRuntime;
    close(): Promise<void>;
};
export declare function createProviderRuntimeStartAssembly(input: {
    config: ProviderRuntimeStartConfig;
    process_identity_digest: string;
    revoke_ref: (input: {
        auth_ref_id: string;
    }) => Promise<{
        status: 'revoked';
    } | {
        status: 'blocked';
        reason: string;
    }>;
    create_launcher: (input: {
        runtime: ProviderAuthRuntime;
        resolver: ProviderAuthRefResolver;
        config: ProviderRuntimeStartConfig;
    }) => ProviderAuthRuntimeIpcLauncher;
    process_id?: number;
    now?: () => string;
}): ProviderRuntimeStartAssembly;
