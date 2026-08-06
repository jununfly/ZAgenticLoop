import type { ProviderRuntimeIdentityBinding } from './provider-auth-runtime.js';
export declare const PROVIDER_RUNTIME_START_CONFIG_SCHEMA: "zj-loop.provider_runtime_start_config.v1";
export type ProviderRuntimeStartConfig = {
    schema: typeof PROVIDER_RUNTIME_START_CONFIG_SCHEMA;
    network_id: string;
    runtime_id: string;
    provider_ids: string[];
    socket_path: string;
    correlation_id: string;
    expected_peer_identity_digest: string;
    provider_executable: string;
    working_directory: string;
    contract_digest: string;
    adapter_contract_digest: string;
    runtime_binding: ProviderRuntimeIdentityBinding;
    state_store_path: string;
    binding_path: string;
    macos_helper_path?: string;
    macos_helper_digest?: string;
    artifact_manifest_path?: string;
    runtime_artifact_path?: string;
    helper_artifact_path?: string;
    artifact_profile?: 'development-local' | 'production';
};
export declare function validateProviderRuntimeStartConfig(value: unknown): {
    status: 'valid';
    config: ProviderRuntimeStartConfig;
} | {
    status: 'blocked';
    reason: 'provider-runtime-start-config-invalid' | 'provider-runtime-start-config-secret-field';
};
