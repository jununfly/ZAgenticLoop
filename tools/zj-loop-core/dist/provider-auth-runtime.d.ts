export declare const PROVIDER_AUTH_REF_SCHEMA: "zj-loop.provider_auth_ref.v1";
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
export declare function createInMemoryProviderAuthRuntime(input: {
    runtime_id: string;
    provider_ids: string[];
    now?: () => string;
}): ProviderAuthRuntime;
