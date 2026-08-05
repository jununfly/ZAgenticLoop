import { type ProviderAuthAuthorityBinding } from './provider-auth-authority-binding.js';
export type ProviderAuthAuthorityForegroundLauncher = {
    start(): Promise<void>;
    readiness(): Promise<{
        status: 'ready';
        socket_path: string;
    } | {
        status: 'blocked';
        reason: string;
    }>;
    close(): Promise<void>;
};
export type ProviderAuthAuthorityForegroundService = {
    start(): Promise<{
        status: 'started';
        binding: ProviderAuthAuthorityBinding;
    }>;
    stop(): Promise<{
        status: 'stopped';
    } | {
        status: 'outcome-uncertain';
        reason: 'provider-auth-authority-close-failed';
    }>;
};
export declare function createProviderAuthAuthorityForegroundService(input: {
    launcher: ProviderAuthAuthorityForegroundLauncher;
    binding_path: string;
    binding: Omit<ProviderAuthAuthorityBinding, 'schema' | 'binding_digest' | 'pid' | 'started_at'>;
    process_id?: number;
    now?: () => string;
}): ProviderAuthAuthorityForegroundService;
