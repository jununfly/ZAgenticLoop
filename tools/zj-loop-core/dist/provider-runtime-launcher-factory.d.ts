import { type ProviderAuthRuntimeIpcLauncher } from './provider-auth-runtime-ipc-launcher.js';
import type { ProviderAuthRuntime } from './provider-auth-runtime.js';
import type { ProviderAuthRefResolver } from './provider-auth-ref-store.js';
import type { ProviderRuntimeStartConfig } from './provider-runtime-start-config.js';
import type { LocalProcessAdapter } from './local-process-adapter.js';
import { createProviderRuntimeArtifactVerifier } from './provider-runtime-artifact-verifier.js';
import type { SqliteStateStore } from './sqlite-state-store.js';
export declare function verifyProviderRuntimeTrustBeforeLaunch(input: {
    verify_artifact: () => Promise<Awaited<ReturnType<ReturnType<typeof createProviderRuntimeArtifactVerifier>['verify']>>>;
    state_store: SqliteStateStore;
    config: ProviderRuntimeStartConfig;
    now?: string;
}): Promise<{
    status: 'verified';
    manifest: NonNullable<Extract<Awaited<ReturnType<ReturnType<typeof createProviderRuntimeArtifactVerifier>['verify']>>, {
        status: 'verified';
    }>>['manifest'];
} | {
    status: 'blocked';
    reason: string;
}>;
export declare function createMacOSProviderRuntimeLauncher(input: {
    config: ProviderRuntimeStartConfig;
    runtime: ProviderAuthRuntime;
    resolver: ProviderAuthRefResolver;
    macos_helper_path: string;
    macos_helper_digest: string;
    state_store?: SqliteStateStore;
    now?: () => string;
    process_adapter?: LocalProcessAdapter;
}): ProviderAuthRuntimeIpcLauncher;
