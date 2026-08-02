import canonicalize from 'canonicalize';
import { createHash, randomUUID } from 'node:crypto';
export const PROVIDER_AUTH_REF_SCHEMA = 'zj-loop.provider_auth_ref.v1';
export const PROVIDER_LAUNCH_HANDLE_SCHEMA = 'zj-loop.provider_launch_handle.v1';
export const PROVIDER_CLEANUP_PROOF_SCHEMA = 'zj-loop.provider_cleanup_proof.v1';
const PROVIDER_AUTH_REF_KEYS = new Set(['schema', 'auth_ref_id', 'network_id', 'node_id', 'provider_runtime_id', 'provider_id', 'execution_id', 'attempt', 'issuer', 'audience', 'scope', 'issued_at', 'expires_at', 'status', 'ref_digest']);
function canonical(value) {
    const json = canonicalize(value);
    if (typeof json !== 'string')
        throw new Error('provider-auth-canonicalization-invalid');
    return json;
}
function digest(value) {
    return `sha256:${createHash('sha256').update(canonical(value), 'utf8').digest('hex')}`;
}
function handleDigest(value) { return `sha256:${createHash('sha256').update(canonical(value), 'utf8').digest('hex')}`; }
function cleanupDigest(value) { return `sha256:${createHash('sha256').update(canonical(value), 'utf8').digest('hex')}`; }
function normalizeScope(scope) {
    return [...new Set(scope)].sort();
}
function validRef(ref) {
    const { ref_digest: _, ...unsigned } = ref;
    return Object.keys(ref).every((key) => PROVIDER_AUTH_REF_KEYS.has(key))
        && ref.schema === PROVIDER_AUTH_REF_SCHEMA
        && ref.status === 'active'
        && ref.auth_ref_id.trim() !== ''
        && ref.network_id.trim() !== ''
        && ref.node_id.trim() !== ''
        && ref.provider_runtime_id.trim() !== ''
        && ref.provider_id.trim() !== ''
        && ref.execution_id.trim() !== ''
        && Number.isInteger(ref.attempt) && ref.attempt >= 1
        && ref.issuer.trim() !== ''
        && ref.audience.trim() !== ''
        && JSON.stringify(ref.scope) === JSON.stringify(normalizeScope(ref.scope))
        && Number.isFinite(Date.parse(ref.issued_at))
        && Number.isFinite(Date.parse(ref.expires_at))
        && Date.parse(ref.issued_at) < Date.parse(ref.expires_at)
        && ref.ref_digest === digest(unsigned);
}
export function validateProviderAuthRef(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return { status: 'blocked', reason: 'provider-auth-ref-invalid' };
    const ref = value;
    if (!validRef(ref))
        return { status: 'blocked', reason: 'provider-auth-ref-invalid' };
    return { status: 'valid' };
}
export function providerAuthRefDigest(ref) {
    const { ref_digest: _, ...unsigned } = ref;
    return digest(unsigned);
}
export function createInMemoryProviderAuthRuntime(input) {
    const secrets = new Map();
    const refs = new Map();
    const handles = new Map();
    const now = input.now ?? (() => new Date().toISOString());
    const runtime_id = input.runtime_id;
    const provider_ids = [...new Set(input.provider_ids)].sort();
    return {
        async inspect() {
            return runtime_id.trim() && provider_ids.length > 0
                ? { status: 'available', runtime_id, provider_ids }
                : { status: 'blocked', reason: 'provider-auth-runtime-not-configured' };
        },
        async issueRef(request) {
            if (!request.human_authorized)
                return { status: 'blocked', reason: 'provider-auth-human-authorization-required' };
            if (!provider_ids.includes(request.provider_id))
                return { status: 'blocked', reason: 'provider-auth-provider-not-supported' };
            if (!request.secret || request.secret.includes('\0'))
                return { status: 'blocked', reason: 'provider-auth-secret-invalid' };
            const scope = normalizeScope(request.scope);
            if (!request.execution_id.trim() || !Number.isInteger(request.attempt) || request.attempt < 1)
                return { status: 'blocked', reason: 'provider-auth-execution-binding-invalid' };
            const unsigned = { schema: PROVIDER_AUTH_REF_SCHEMA, auth_ref_id: `auth-${randomUUID()}`, network_id: request.network_id, node_id: request.node_id, provider_runtime_id: runtime_id, provider_id: request.provider_id, execution_id: request.execution_id, attempt: request.attempt, issuer: runtime_id, audience: request.audience, scope, issued_at: request.issued_at, expires_at: request.expires_at, status: 'active' };
            const ref = { ...unsigned, ref_digest: digest(unsigned) };
            refs.set(ref.auth_ref_id, ref);
            secrets.set(ref.auth_ref_id, request.secret);
            return { status: 'issued', ref };
        },
        async verify(request) {
            const current = refs.get(request.ref.auth_ref_id);
            if (!current || !validRef(current) || current.ref_digest !== request.ref.ref_digest)
                return { status: 'blocked', reason: 'provider-auth-ref-invalid' };
            if (current.network_id !== request.network_id || current.node_id !== request.node_id || current.provider_id !== request.provider_id || current.execution_id !== request.execution_id || current.attempt !== request.attempt)
                return { status: 'blocked', reason: 'provider-auth-ref-binding-mismatch' };
            if (Date.parse(request.now ?? now()) < Date.parse(current.issued_at) || Date.parse(request.now ?? now()) >= Date.parse(current.expires_at))
                return { status: 'blocked', reason: 'provider-auth-ref-expired' };
            return { status: 'valid', ref: current };
        },
        async revoke(request) {
            const current = refs.get(request.auth_ref_id);
            if (!current)
                return { status: 'blocked', reason: 'provider-auth-ref-not-found' };
            const revoked = { ...current, status: 'revoked' };
            const { ref_digest: _, ...unsigned } = revoked;
            refs.set(revoked.auth_ref_id, { ...revoked, ref_digest: digest(unsigned) });
            secrets.delete(revoked.auth_ref_id);
            return { status: 'revoked' };
        },
        async launch(request) {
            const verified = await this.verify({ ref: request.ref, network_id: request.network_id, node_id: request.node_id, provider_id: request.provider_id, execution_id: request.execution_id, attempt: request.attempt, now: request.issued_at });
            if (verified.status === 'blocked')
                return verified;
            if (!request.contract_digest || !/^sha256:[0-9a-f]{64}$/.test(request.contract_digest) || !Number.isFinite(Date.parse(request.issued_at)) || !Number.isFinite(Date.parse(request.expires_at)) || Date.parse(request.issued_at) >= Date.parse(request.expires_at))
                return { status: 'blocked', reason: 'provider-launch-contract-invalid' };
            if ([...handles.values()].some((handle) => handle.auth_ref_id === request.ref.auth_ref_id && handle.status === 'active'))
                return { status: 'blocked', reason: 'provider-launch-handle-already-issued' };
            const unsigned = { schema: PROVIDER_LAUNCH_HANDLE_SCHEMA, handle_id: `handle-${randomUUID()}`, auth_ref_id: request.ref.auth_ref_id, network_id: request.network_id, node_id: request.node_id, provider_runtime_id: request.ref.provider_runtime_id, provider_id: request.provider_id, execution_id: request.execution_id, attempt: request.attempt, endpoint_digest: `sha256:${createHash('sha256').update(randomUUID(), 'utf8').digest('hex')}`, contract_digest: request.contract_digest, issued_at: request.issued_at, expires_at: request.expires_at, status: 'active' };
            const handle = { ...unsigned, handle_digest: handleDigest(unsigned) };
            handles.set(handle.handle_id, handle);
            return { status: 'launched', handle };
        },
        async cleanup(request) {
            const current = handles.get(request.handle.handle_id);
            if (!current || current.handle_digest !== request.handle.handle_digest || current.status !== 'active')
                return { status: 'blocked', reason: 'provider-launch-handle-invalid' };
            if (current.network_id !== request.network_id || current.node_id !== request.node_id || current.provider_id !== request.provider_id || current.execution_id !== request.execution_id || current.attempt !== request.attempt)
                return { status: 'blocked', reason: 'provider-launch-handle-binding-mismatch' };
            const ref = refs.get(current.auth_ref_id);
            if (!ref)
                return { status: 'blocked', reason: 'provider-auth-ref-not-found' };
            const revoked = await this.revoke({ auth_ref_id: ref.auth_ref_id });
            if (revoked.status === 'blocked')
                return revoked;
            const closed = { ...current, status: 'closed' };
            handles.set(closed.handle_id, { ...closed, handle_digest: handleDigest(closed) });
            const unsigned = { schema: PROVIDER_CLEANUP_PROOF_SCHEMA, status: 'cleaned', auth_ref_id: current.auth_ref_id, handle_digest: current.handle_digest, endpoint_digest: current.endpoint_digest, network_id: current.network_id, node_id: current.node_id, provider_runtime_id: current.provider_runtime_id, provider_id: current.provider_id, execution_id: current.execution_id, attempt: current.attempt, revoked: true, secret_cleared: true, cleaned_at: request.cleaned_at };
            return { status: 'cleaned', proof: { ...unsigned, cleanup_digest: cleanupDigest(unsigned) } };
        },
        async consumeSecret(request) {
            const verified = await this.verify(request);
            if (verified.status === 'blocked')
                return verified;
            const secret = secrets.get(request.ref.auth_ref_id);
            return secret ? { status: 'authorized', secret } : { status: 'blocked', reason: 'provider-auth-secret-unavailable' };
        },
    };
}
