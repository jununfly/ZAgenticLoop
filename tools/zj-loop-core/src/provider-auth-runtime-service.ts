import { createInMemoryProviderAuthRuntime, type ProviderAuthRef, type ProviderAuthRuntime, type ProviderRuntimeIdentityBinding } from './provider-auth-runtime.js';
import type { ProviderAuthRefResolver } from './provider-auth-ref-store.js';

export function createProviderAuthRuntimeServiceAdapter(input: {
  runtime_id: string;
  provider_ids: string[];
  runtime_binding: ProviderRuntimeIdentityBinding;
  resolver: ProviderAuthRefResolver;
  revoke_ref: (input: { auth_ref_id: string }) => Promise<{ status: 'revoked' } | { status: 'blocked'; reason: string }>;
}): ProviderAuthRuntime {
  if (!input.resolver || typeof input.resolver.resolve !== 'function') throw new Error('provider-auth-runtime-service-resolver-required');
  if (typeof input.revoke_ref !== 'function') throw new Error('provider-auth-runtime-service-revoke-required');
  const runtime = createInMemoryProviderAuthRuntime({ runtime_id: input.runtime_id, provider_ids: input.provider_ids, runtime_binding: input.runtime_binding, ref_resolver: async (ref_digest) => input.resolver.resolve({ auth_ref_digest: ref_digest }), revoke_ref: input.revoke_ref });
  return {
    ...runtime,
    async issueRef() { return { status: 'blocked', reason: 'provider-auth-runtime-service-issue-not-permitted' }; },
    async consumeSecret() { return { status: 'blocked', reason: 'provider-auth-runtime-service-secret-not-permitted' }; },
  };
}
