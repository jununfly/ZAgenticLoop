import { sha256CanonicalJson } from './sqlite-state-store.js';
import { validateProviderAuthAuthorityRevokeRequest } from './provider-auth-authority-ipc-protocol.js';
import { PROVIDER_AUTH_REF_REVOKED_EVENT_TYPE } from './provider-auth-ref-store.js';
export const PROVIDER_AUTH_REF_REVOKED_EVENT_SCHEMA = 'zj-loop.provider_auth_ref_revoked.v1';
function digest(value) { return `sha256:${sha256CanonicalJson(value)}`; }
export function createProviderAuthStateStoreRevocationAuthority(input) {
    if (!input.state_store || typeof input.state_store.appendEvent !== 'function' || typeof input.state_store.getRevision !== 'function')
        throw new Error('provider-auth-revocation-state-store-required');
    if (!/^sha256:[0-9a-f]{64}$/.test(input.authority_identity_digest))
        throw new Error('provider-auth-revocation-authority-identity-invalid');
    const maxRetries = input.max_revision_retries ?? 3;
    if (!Number.isInteger(maxRetries) || maxRetries < 1 || maxRetries > 10)
        throw new Error('provider-auth-revocation-retry-limit-invalid');
    const now = input.now ?? (() => new Date().toISOString());
    return {
        async revoke(request) {
            const checked = validateProviderAuthAuthorityRevokeRequest(request);
            if (checked.status === 'blocked')
                return { schema: 'zj-loop.provider_auth_authority_revoke_response.v1', status: 'blocked', request_id: request?.request_id ?? 'invalid', network_id: input.network_id, runtime_id: request?.runtime_id ?? 'invalid', request_digest: request?.request_digest ?? 'sha256:' + '0'.repeat(64), reason: checked.reason };
            const value = checked.request;
            if (value.network_id !== input.network_id)
                return { schema: 'zj-loop.provider_auth_authority_revoke_response.v1', status: 'blocked', request_id: value.request_id, network_id: value.network_id, runtime_id: value.runtime_id, request_digest: value.request_digest, reason: 'provider-auth-revocation-network-mismatch' };
            const event_id = `provider-auth-ref.revoked:${value.auth_ref_id}:${value.request_id}`;
            const occurred_at = now();
            const payload = { schema: PROVIDER_AUTH_REF_REVOKED_EVENT_SCHEMA, auth_ref_id: value.auth_ref_id, auth_ref_digest: value.auth_ref_digest, request_id: value.request_id, request_digest: value.request_digest, network_id: value.network_id, runtime_id: value.runtime_id, runtime_binding: value.runtime_binding, authority_identity_digest: input.authority_identity_digest, reason: value.revoke_reason };
            const event_digest = digest(payload);
            for (let attempt = 0; attempt < maxRetries; attempt += 1) {
                try {
                    const expected_revision = await input.state_store.getRevision(input.network_id);
                    const result = await input.state_store.appendEvent({ network_id: input.network_id, expected_revision, event: { event_id, aggregate_type: 'provider-auth-ref', aggregate_id: value.auth_ref_id, event_type: PROVIDER_AUTH_REF_REVOKED_EVENT_TYPE, occurred_at, payload } });
                    if (result.status === 'recorded')
                        return { schema: 'zj-loop.provider_auth_authority_revoke_response.v1', status: 'revoked', request_id: value.request_id, network_id: value.network_id, runtime_id: value.runtime_id, request_digest: value.request_digest, event_digest };
                    if (result.status === 'duplicate')
                        return { schema: 'zj-loop.provider_auth_authority_revoke_response.v1', status: 'duplicate', request_id: value.request_id, network_id: value.network_id, runtime_id: value.runtime_id, request_digest: value.request_digest, event_digest };
                    if (result.reason !== 'revision-mismatch')
                        return { schema: 'zj-loop.provider_auth_authority_revoke_response.v1', status: 'blocked', request_id: value.request_id, network_id: value.network_id, runtime_id: value.runtime_id, request_digest: value.request_digest, reason: result.reason ?? 'provider-auth-revocation-conflict' };
                }
                catch {
                    return { schema: 'zj-loop.provider_auth_authority_revoke_response.v1', status: 'outcome-uncertain', request_id: value.request_id, network_id: value.network_id, runtime_id: value.runtime_id, request_digest: value.request_digest, reason: 'provider-auth-revocation-state-store-failed' };
                }
            }
            return { schema: 'zj-loop.provider_auth_authority_revoke_response.v1', status: 'outcome-uncertain', request_id: value.request_id, network_id: value.network_id, runtime_id: value.runtime_id, request_digest: value.request_digest, reason: 'provider-auth-revocation-revision-retry-exhausted' };
        },
    };
}
