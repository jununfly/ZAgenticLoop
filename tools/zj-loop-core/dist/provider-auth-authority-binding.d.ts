export declare const PROVIDER_AUTH_AUTHORITY_BINDING_SCHEMA: "zj-loop.provider_auth_authority_binding.v1";
export type ProviderAuthAuthorityBinding = {
    schema: typeof PROVIDER_AUTH_AUTHORITY_BINDING_SCHEMA;
    service_id: string;
    network_id: string;
    socket_path: string;
    authority_contract_digest: string;
    state_store_identity_digest: string;
    state_store_path: string;
    process_identity_digest: string;
    pid: number;
    started_at: string;
    binding_digest: string;
};
export declare function createProviderAuthAuthorityBinding(input: Omit<ProviderAuthAuthorityBinding, 'schema' | 'binding_digest'>): ProviderAuthAuthorityBinding;
export declare function validateProviderAuthAuthorityBinding(value: unknown): {
    status: 'valid';
    binding: ProviderAuthAuthorityBinding;
} | {
    status: 'blocked';
    reason: 'provider-auth-authority-binding-invalid' | 'provider-auth-authority-binding-digest-invalid';
};
export declare function persistProviderAuthAuthorityBinding(filePath: string, binding: ProviderAuthAuthorityBinding): Promise<void>;
export declare function readProviderAuthAuthorityBinding(filePath: string): Promise<ProviderAuthAuthorityBinding>;
