import type { ProviderAuthAuthorityBinding } from './provider-auth-authority-binding.js';
export type ProviderAuthAuthorityProcessIdentityFacts = {
    service_id: string;
    pid: number;
    started_at: string;
    process_identity_digest: string;
};
export type ProviderAuthAuthorityProcessIdentityVerifier = {
    verify(input: {
        binding: ProviderAuthAuthorityBinding;
    }): Promise<{
        status: 'verified';
        facts: ProviderAuthAuthorityProcessIdentityFacts;
    } | {
        status: 'blocked';
        reason: 'provider-auth-authority-process-identity-mismatch' | 'provider-auth-authority-process-identity-unavailable';
    }>;
};
export declare function createInMemoryProviderAuthAuthorityProcessIdentityVerifier(input: {
    facts?: ProviderAuthAuthorityProcessIdentityFacts;
    available?: boolean;
}): ProviderAuthAuthorityProcessIdentityVerifier;
