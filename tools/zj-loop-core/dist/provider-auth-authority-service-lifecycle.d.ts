import { type ProviderAuthAuthorityBinding } from './provider-auth-authority-binding.js';
import type { ProviderAuthAuthorityProcessIdentityVerifier } from './provider-auth-authority-process-identity.js';
export type ProviderAuthAuthorityServiceStatus = {
    status: 'ready' | 'outcome-uncertain';
    service_id: string;
    pid: number;
    socket_path: string;
    reason?: 'provider-auth-authority-process-identity-unavailable' | 'provider-auth-authority-process-identity-mismatch' | 'provider-auth-authority-ipc-unavailable';
};
export type ProviderAuthAuthorityServiceLifecycle = {
    status(input: {
        binding: ProviderAuthAuthorityBinding;
    }): Promise<ProviderAuthAuthorityServiceStatus>;
    stop(input: {
        binding: ProviderAuthAuthorityBinding;
        terminate: (pid: number) => Promise<void>;
        wait_for_exit?: (binding: ProviderAuthAuthorityBinding) => Promise<boolean>;
    }): Promise<{
        status: 'stopped';
        service_id: string;
        pid: number;
    } | {
        status: 'blocked';
        reason: 'provider-auth-authority-process-identity-unavailable' | 'provider-auth-authority-process-identity-mismatch';
    } | {
        status: 'outcome-uncertain';
        reason: 'provider-auth-authority-stop-timeout' | 'provider-auth-authority-ipc-still-ready';
    }>;
};
export declare function createProviderAuthAuthorityServiceLifecycle(input: {
    verifier: ProviderAuthAuthorityProcessIdentityVerifier;
    probe_socket?: (socketPath: string) => Promise<boolean>;
}): ProviderAuthAuthorityServiceLifecycle;
export declare function readProviderAuthAuthorityServiceStatus(input: {
    binding_path: string;
    lifecycle: ProviderAuthAuthorityServiceLifecycle;
}): Promise<ProviderAuthAuthorityServiceStatus>;
