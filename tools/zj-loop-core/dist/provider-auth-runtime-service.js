import { createInMemoryProviderAuthRuntime } from './provider-auth-runtime.js';
export function createProviderAuthRuntimeServiceAdapter(input) {
    if (!input.resolver || typeof input.resolver.resolve !== 'function')
        throw new Error('provider-auth-runtime-service-resolver-required');
    if (typeof input.revoke_ref !== 'function')
        throw new Error('provider-auth-runtime-service-revoke-required');
    const runtime = createInMemoryProviderAuthRuntime({ runtime_id: input.runtime_id, provider_ids: input.provider_ids, runtime_binding: input.runtime_binding, ref_resolver: async (ref_digest) => input.resolver.resolve({ auth_ref_digest: ref_digest }), revoke_ref: input.revoke_ref });
    return {
        ...runtime,
        async issueRef() { return { status: 'blocked', reason: 'provider-auth-runtime-service-issue-not-permitted' }; },
        async consumeSecret() { return { status: 'blocked', reason: 'provider-auth-runtime-service-secret-not-permitted' }; },
    };
}
