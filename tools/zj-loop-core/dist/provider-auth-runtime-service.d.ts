import { type ProviderAuthRuntime, type ProviderRuntimeIdentityBinding } from './provider-auth-runtime.js';
import type { ProviderAuthRefResolver } from './provider-auth-ref-store.js';
export declare function createProviderAuthRuntimeServiceAdapter(input: {
    runtime_id: string;
    provider_ids: string[];
    runtime_binding: ProviderRuntimeIdentityBinding;
    resolver: ProviderAuthRefResolver;
    revoke_ref: (input: {
        auth_ref_id: string;
    }) => Promise<{
        status: 'revoked';
    } | {
        status: 'blocked';
        reason: string;
    }>;
}): ProviderAuthRuntime;
