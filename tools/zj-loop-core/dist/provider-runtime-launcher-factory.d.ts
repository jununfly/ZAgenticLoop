import { type ProviderAuthRuntimeIpcLauncher } from './provider-auth-runtime-ipc-launcher.js';
import type { ProviderAuthRuntime } from './provider-auth-runtime.js';
import type { ProviderAuthRefResolver } from './provider-auth-ref-store.js';
import type { ProviderRuntimeStartConfig } from './provider-runtime-start-config.js';
import type { LocalProcessAdapter } from './local-process-adapter.js';
export declare function createMacOSProviderRuntimeLauncher(input: {
    config: ProviderRuntimeStartConfig;
    runtime: ProviderAuthRuntime;
    resolver: ProviderAuthRefResolver;
    macos_helper_path: string;
    macos_helper_digest: string;
    process_adapter?: LocalProcessAdapter;
}): ProviderAuthRuntimeIpcLauncher;
