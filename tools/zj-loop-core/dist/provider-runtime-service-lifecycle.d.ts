import { type ProviderRuntimeServiceBinding } from './provider-runtime-service-binding.js';
import type { ProviderRuntimeProcessIdentityVerifier } from './provider-runtime-process-identity.js';
export type ProviderRuntimeServiceStatus = {
    status: 'ready' | 'outcome-uncertain';
    service_id: string;
    pid: number;
    socket_path: string;
    reason?: 'provider-runtime-process-identity-unavailable' | 'provider-runtime-process-identity-mismatch' | 'provider-runtime-ipc-unavailable';
};
export type ProviderRuntimeServiceLifecycle = {
    status(input: {
        binding: ProviderRuntimeServiceBinding;
    }): Promise<ProviderRuntimeServiceStatus>;
    stop(input: {
        binding: ProviderRuntimeServiceBinding;
        terminate: (pid: number) => Promise<void>;
        wait_for_exit?: (binding: ProviderRuntimeServiceBinding) => Promise<boolean>;
    }): Promise<{
        status: 'stopped';
        service_id: string;
        pid: number;
    } | {
        status: 'blocked';
        reason: 'provider-runtime-process-identity-unavailable' | 'provider-runtime-process-identity-mismatch';
    } | {
        status: 'outcome-uncertain';
        reason: 'provider-runtime-stop-timeout' | 'provider-runtime-ipc-still-ready';
    }>;
};
export declare function createProviderRuntimeServiceLifecycle(input: {
    verifier: ProviderRuntimeProcessIdentityVerifier;
    probe_socket?: (socketPath: string) => Promise<boolean>;
}): ProviderRuntimeServiceLifecycle;
export declare function readProviderRuntimeServiceStatus(input: {
    binding_path: string;
    lifecycle: ProviderRuntimeServiceLifecycle;
}): Promise<ProviderRuntimeServiceStatus>;
