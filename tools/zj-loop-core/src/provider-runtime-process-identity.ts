import type { ProviderRuntimeServiceBinding } from './provider-runtime-service-binding.js';

export type ProviderRuntimeProcessIdentityFacts = {
  service_id: string;
  pid: number;
  started_at: string;
  process_identity_digest: string;
};

export type ProviderRuntimeProcessIdentityVerifier = {
  verify(input: { binding: ProviderRuntimeServiceBinding }): Promise<{ status: 'verified'; facts: ProviderRuntimeProcessIdentityFacts } | { status: 'blocked'; reason: 'provider-runtime-process-identity-mismatch' | 'provider-runtime-process-identity-unavailable' }>;
};

export function createInMemoryProviderRuntimeProcessIdentityVerifier(input: { facts?: ProviderRuntimeProcessIdentityFacts; available?: boolean }): ProviderRuntimeProcessIdentityVerifier {
  return {
    async verify({ binding }) {
      if (input.available === false || !input.facts) return { status: 'blocked', reason: 'provider-runtime-process-identity-unavailable' };
      const facts = input.facts;
      return facts.service_id === binding.service_id && facts.pid === binding.pid && facts.started_at === binding.started_at && facts.process_identity_digest === binding.process_identity_digest
        ? { status: 'verified', facts }
        : { status: 'blocked', reason: 'provider-runtime-process-identity-mismatch' };
    },
  };
}
