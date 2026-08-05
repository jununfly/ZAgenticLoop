import type { ProviderAuthAuthorityBinding } from './provider-auth-authority-binding.js';

export type ProviderAuthAuthorityProcessIdentityFacts = {
  service_id: string;
  pid: number;
  started_at: string;
  process_identity_digest: string;
};

export type ProviderAuthAuthorityProcessIdentityVerifier = {
  verify(input: { binding: ProviderAuthAuthorityBinding }): Promise<{ status: 'verified'; facts: ProviderAuthAuthorityProcessIdentityFacts } | { status: 'blocked'; reason: 'provider-auth-authority-process-identity-mismatch' | 'provider-auth-authority-process-identity-unavailable' }>;
};

export function createInMemoryProviderAuthAuthorityProcessIdentityVerifier(input: { facts?: ProviderAuthAuthorityProcessIdentityFacts; available?: boolean }): ProviderAuthAuthorityProcessIdentityVerifier {
  return {
    async verify({ binding }) {
      if (input.available === false || !input.facts) return { status: 'blocked', reason: 'provider-auth-authority-process-identity-unavailable' };
      const facts = input.facts;
      return facts.service_id === binding.service_id && facts.pid === binding.pid && facts.started_at === binding.started_at && facts.process_identity_digest === binding.process_identity_digest
        ? { status: 'verified', facts }
        : { status: 'blocked', reason: 'provider-auth-authority-process-identity-mismatch' };
    },
  };
}
