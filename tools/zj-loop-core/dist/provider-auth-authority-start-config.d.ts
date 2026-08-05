export declare const PROVIDER_AUTH_AUTHORITY_START_CONFIG_SCHEMA: "zj-loop.provider_auth_authority_start_config.v1";
export type ProviderAuthAuthorityStartConfig = {
    schema: typeof PROVIDER_AUTH_AUTHORITY_START_CONFIG_SCHEMA;
    network_id: string;
    socket_path: string;
    correlation_id: string;
    expected_peer_identity_digest: string;
    authority_contract_digest: string;
    authority_identity_digest: string;
    state_store_identity_digest: string;
    state_store_path: string;
    binding_path: string;
    process_identity_digest: string;
    macos_helper_path?: string;
    macos_helper_digest?: string;
};
export declare function validateProviderAuthAuthorityStartConfig(value: unknown): {
    status: 'valid';
    config: ProviderAuthAuthorityStartConfig;
} | {
    status: 'blocked';
    reason: 'provider-auth-authority-start-config-invalid' | 'provider-auth-authority-start-config-secret-field';
};
