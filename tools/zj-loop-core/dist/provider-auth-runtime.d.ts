export declare const PROVIDER_AUTH_REF_SCHEMA: "zj-loop.provider_auth_ref.v1";
export declare const PROVIDER_LAUNCH_HANDLE_SCHEMA: "zj-loop.provider_launch_handle.v1";
export declare const PROVIDER_CLEANUP_PROOF_SCHEMA: "zj-loop.provider_cleanup_proof.v1";
export type ProviderAuthRef = {
    schema: typeof PROVIDER_AUTH_REF_SCHEMA;
    auth_ref_id: string;
    network_id: string;
    node_id: string;
    provider_runtime_id: string;
    provider_id: string;
    execution_id: string;
    attempt: number;
    issuer: string;
    audience: string;
    scope: string[];
    issued_at: string;
    expires_at: string;
    status: 'active' | 'revoked';
    ref_digest: string;
};
export type ProviderLaunchHandle = {
    schema: typeof PROVIDER_LAUNCH_HANDLE_SCHEMA;
    handle_id: string;
    auth_ref_id: string;
    network_id: string;
    node_id: string;
    provider_runtime_id: string;
    provider_id: string;
    execution_id: string;
    attempt: number;
    endpoint_digest: string;
    contract_digest: string;
    adapter_contract_digest: string;
    issued_at: string;
    expires_at: string;
    status: 'active' | 'closed';
    handle_digest: string;
};
export type ProviderCleanupProof = {
    schema: typeof PROVIDER_CLEANUP_PROOF_SCHEMA;
    status: 'cleaned' | 'uncertain';
    auth_ref_id: string;
    handle_digest: string;
    endpoint_digest: string;
    network_id: string;
    node_id: string;
    provider_runtime_id: string;
    provider_id: string;
    execution_id: string;
    attempt: number;
    adapter_contract_digest: string;
    revoked: boolean;
    secret_cleared: boolean;
    cleaned_at: string;
    cleanup_digest: string;
};
export type ProviderAuthRuntime = {
    inspect(): Promise<{
        status: 'available';
        runtime_id: string;
        provider_ids: string[];
    } | {
        status: 'blocked';
        reason: string;
    }>;
    issueRef(input: {
        network_id: string;
        node_id: string;
        provider_id: string;
        execution_id: string;
        attempt: number;
        audience: string;
        scope: string[];
        secret: string;
        issued_at: string;
        expires_at: string;
        human_authorized: boolean;
    }): Promise<{
        status: 'issued';
        ref: ProviderAuthRef;
    } | {
        status: 'blocked';
        reason: string;
    }>;
    verify(input: {
        ref: ProviderAuthRef;
        network_id: string;
        node_id: string;
        provider_id: string;
        execution_id: string;
        attempt: number;
        now?: string;
    }): Promise<{
        status: 'valid';
        ref: ProviderAuthRef;
    } | {
        status: 'blocked';
        reason: string;
    }>;
    revoke(input: {
        auth_ref_id: string;
    }): Promise<{
        status: 'revoked';
    } | {
        status: 'blocked';
        reason: string;
    }>;
    launch(input: {
        ref: ProviderAuthRef;
        network_id: string;
        node_id: string;
        provider_id: string;
        execution_id: string;
        attempt: number;
        contract_digest: string;
        adapter_contract_digest: string;
        issued_at: string;
        expires_at: string;
    }): Promise<{
        status: 'launched';
        handle: ProviderLaunchHandle;
    } | {
        status: 'blocked';
        reason: string;
    }>;
    cleanup(input: {
        handle: ProviderLaunchHandle;
        network_id: string;
        node_id: string;
        provider_id: string;
        execution_id: string;
        attempt: number;
        cleaned_at: string;
    }): Promise<{
        status: 'cleaned';
        proof: ProviderCleanupProof;
    } | {
        status: 'blocked';
        reason: string;
    }>;
    consumeSecret(input: {
        ref: ProviderAuthRef;
        network_id: string;
        node_id: string;
        provider_id: string;
        execution_id: string;
        attempt: number;
        now?: string;
    }): Promise<{
        status: 'authorized';
        secret: string;
    } | {
        status: 'blocked';
        reason: string;
    }>;
};
export declare function validateProviderAuthRef(value: unknown): {
    status: 'valid';
} | {
    status: 'blocked';
    reason: string;
};
export declare function providerAuthRefDigest(ref: ProviderAuthRef): string;
export declare function validateProviderLaunchHandle(value: unknown): {
    status: 'valid';
    handle: ProviderLaunchHandle;
} | {
    status: 'blocked';
    reason: string;
};
export declare function createProviderRuntimeCleanupCoordinator(input: {
    runtime: ProviderAuthRuntime;
    handle: ProviderLaunchHandle;
    network_id: string;
    node_id: string;
    provider_id: string;
    execution_id: string;
    attempt: number;
    cleaned_at?: () => string;
}): () => Promise<{
    status: 'cleaned';
    proof_digest: string;
} | {
    status: 'uncertain';
    reason: string;
}>;
export declare function createInMemoryProviderAuthRuntime(input: {
    runtime_id: string;
    provider_ids: string[];
    now?: () => string;
}): ProviderAuthRuntime;
