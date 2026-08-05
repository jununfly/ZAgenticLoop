import { type ProviderAuthAuthorityExternalProcessLauncher } from './provider-auth-authority-external-process-launcher.js';
import { type ProviderAuthAuthorityBinding } from './provider-auth-authority-binding.js';
import type { ProviderAuthAuthorityStartConfig } from './provider-auth-authority-start-config.js';
export type ProviderAuthAuthorityExternalStartController = {
    start(): Promise<{
        status: 'started';
        binding: ProviderAuthAuthorityBinding;
    }>;
    stop(): Promise<{
        status: 'stopped';
    } | {
        status: 'outcome-uncertain';
        reason: 'provider-auth-authority-external-close-failed' | 'provider-auth-authority-binding-residue';
    }>;
};
export declare function createProviderAuthAuthorityExternalStartController(input: {
    config_path: string;
    create_launcher?: (input: {
        config_path: string;
        config: ProviderAuthAuthorityStartConfig;
    }) => Promise<ProviderAuthAuthorityExternalProcessLauncher> | ProviderAuthAuthorityExternalProcessLauncher;
    startup_timeout_ms?: number;
    poll_interval_ms?: number;
}): Promise<ProviderAuthAuthorityExternalStartController>;
