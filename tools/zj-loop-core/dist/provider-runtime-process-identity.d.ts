import type { ProviderRuntimeServiceBinding } from './provider-runtime-service-binding.js';
export type ProviderRuntimeProcessIdentityFacts = {
    service_id: string;
    pid: number;
    started_at: string;
    process_identity_digest: string;
};
export type ProviderRuntimeProcessIdentityVerifier = {
    verify(input: {
        binding: ProviderRuntimeServiceBinding;
    }): Promise<{
        status: 'verified';
        facts: ProviderRuntimeProcessIdentityFacts;
    } | {
        status: 'blocked';
        reason: 'provider-runtime-process-identity-mismatch' | 'provider-runtime-process-identity-unavailable';
    }>;
};
export declare function createInMemoryProviderRuntimeProcessIdentityVerifier(input: {
    facts?: ProviderRuntimeProcessIdentityFacts;
    available?: boolean;
}): ProviderRuntimeProcessIdentityVerifier;
