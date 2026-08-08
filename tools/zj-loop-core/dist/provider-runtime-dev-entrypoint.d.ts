import { type ProviderAuthRef } from './provider-auth-runtime.js';
import { type ProviderRuntimeServiceBinding } from './provider-runtime-service-binding.js';
export declare const PROVIDER_RUNTIME_DEV_BINDING_SCHEMA: "zj-loop.provider_runtime_dev_binding.v1";
export type DevelopmentProviderRuntimeConfig = {
    profile: 'development-local' | 'production';
    network_id: string;
    runtime_id: string;
    provider_id: string;
    node_id: string;
    execution_id: string;
    attempt: number;
    socket_path: string;
    binding_path: string;
    auth_ref_path: string;
    provider_executable: string;
    working_directory: string;
    provider_secret: string;
    provider_auth_env?: string;
    auth_ref_ttl_ms?: number;
    invocation_timeout_ms?: number;
    termination_grace_ms?: number;
};
export type ProviderRuntimeDevBinding = {
    schema: typeof PROVIDER_RUNTIME_DEV_BINDING_SCHEMA;
    profile: 'development-local';
    binding: ProviderRuntimeServiceBinding;
    auth_ref: ProviderAuthRef;
    auth_ref_path: string;
    correlation_id: string;
    dev_binding_path: string;
    warning: 'development-only-in-memory-auth-authority';
};
export type DevelopmentProviderRuntime = {
    start(): Promise<{
        status: 'started';
        binding: ProviderRuntimeServiceBinding;
        dev_binding: ProviderRuntimeDevBinding;
    }>;
    close(): Promise<void>;
};
export declare function validateProviderRuntimeDevBinding(value: unknown): {
    status: 'valid';
    binding: ProviderRuntimeDevBinding;
} | {
    status: 'blocked';
    reason: string;
};
export declare function createDevelopmentProviderRuntime(input: DevelopmentProviderRuntimeConfig, options?: {
    peer_identity_digest?: string;
    peer_process_id?: number | null;
    now?: () => string;
}): DevelopmentProviderRuntime;
