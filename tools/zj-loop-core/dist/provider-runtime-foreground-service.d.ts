import { type ProviderRuntimeServiceBinding } from './provider-runtime-service-binding.js';
import type { ProviderAuthRuntimeIpcLauncher } from './provider-auth-runtime-ipc-launcher.js';
export type ProviderRuntimeForegroundService = {
    start(): Promise<{
        status: 'started';
        binding: ProviderRuntimeServiceBinding;
    }>;
    stop(): Promise<{
        status: 'stopped';
    } | {
        status: 'outcome-uncertain';
        reason: 'provider-runtime-close-failed';
    }>;
};
export declare function createProviderRuntimeForegroundService(input: {
    launcher: ProviderAuthRuntimeIpcLauncher;
    binding_path: string;
    binding: Omit<ProviderRuntimeServiceBinding, 'schema' | 'binding_digest' | 'pid' | 'started_at'>;
    process_id?: number;
    now?: () => string;
}): ProviderRuntimeForegroundService;
