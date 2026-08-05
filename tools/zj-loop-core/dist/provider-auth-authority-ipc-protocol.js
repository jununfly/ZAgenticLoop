import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
import { validateProviderRuntimeIdentityBinding } from './provider-auth-runtime.js';
export const PROVIDER_AUTH_AUTHORITY_IPC_FRAME_SCHEMA = 'zj-loop.provider_auth_authority_ipc_frame.v1';
export const PROVIDER_AUTH_AUTHORITY_REVOKE_REQUEST_SCHEMA = 'zj-loop.provider_auth_authority_revoke_request.v1';
export const PROVIDER_AUTH_AUTHORITY_REVOKE_RESPONSE_SCHEMA = 'zj-loop.provider_auth_authority_revoke_response.v1';
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const ID = /^[^\s\0]{1,256}$/;
const KINDS = ['challenge', 'revoke-request', 'revoke-response', 'error'];
const FRAME_KEYS = new Set(['schema', 'version', 'kind', 'correlation_id', 'sequence', 'nonce', 'payload']);
const REQUEST_KEYS = new Set(['schema', 'request_id', 'network_id', 'runtime_id', 'runtime_binding', 'auth_ref_id', 'auth_ref_digest', 'authority_contract_digest', 'revoke_reason', 'request_digest']);
const RESPONSE_KEYS = new Set(['schema', 'status', 'request_id', 'network_id', 'runtime_id', 'request_digest', 'event_digest', 'reason']);
const STATUSES = ['revoked', 'duplicate', 'blocked', 'outcome-uncertain'];
function canonical(value) { const result = canonicalize(value); if (typeof result !== 'string')
    throw new Error('provider-auth-authority-canonicalization-invalid'); return result; }
function digest(value) { return `sha256:${createHash('sha256').update(canonical(value), 'utf8').digest('hex')}`; }
function validId(value) { return typeof value === 'string' && ID.test(value); }
function validDigest(value) { return typeof value === 'string' && DIGEST.test(value); }
function validateRequest(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return false;
    const item = value;
    if (Object.keys(item).some((key) => !REQUEST_KEYS.has(key)) || item.schema !== PROVIDER_AUTH_AUTHORITY_REVOKE_REQUEST_SCHEMA || !validId(item.request_id) || !validId(item.network_id) || !validId(item.runtime_id) || validateProviderRuntimeIdentityBinding(item.runtime_binding).status === 'blocked' || !validId(item.auth_ref_id) || !validDigest(item.auth_ref_digest) || !validDigest(item.authority_contract_digest) || !validId(item.revoke_reason) || !validDigest(item.request_digest))
        return false;
    const { request_digest: _, ...unsigned } = item;
    return digest(unsigned) === item.request_digest;
}
function validateResponse(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return false;
    const item = value;
    return Object.keys(item).some((key) => !RESPONSE_KEYS.has(key)) === false && item.schema === PROVIDER_AUTH_AUTHORITY_REVOKE_RESPONSE_SCHEMA && STATUSES.includes(item.status) && validId(item.request_id) && validId(item.network_id) && validId(item.runtime_id) && validDigest(item.request_digest) && (item.event_digest === undefined || validDigest(item.event_digest)) && (item.reason === undefined || validId(item.reason));
}
export function createProviderAuthAuthorityRevokeRequest(input) {
    const unsigned = { schema: PROVIDER_AUTH_AUTHORITY_REVOKE_REQUEST_SCHEMA, ...structuredClone(input) };
    const request = { ...unsigned, request_digest: digest(unsigned) };
    if (!validateRequest(request))
        throw new Error('provider-auth-authority-revoke-request-invalid');
    return request;
}
export function createProviderAuthAuthorityRevokeResponse(input) {
    const response = { schema: PROVIDER_AUTH_AUTHORITY_REVOKE_RESPONSE_SCHEMA, ...structuredClone(input) };
    if (!validateResponse(response))
        throw new Error('provider-auth-authority-revoke-response-invalid');
    if (['revoked', 'duplicate'].includes(response.status) && !response.event_digest)
        throw new Error('provider-auth-authority-revoke-event-digest-required');
    return response;
}
export function createProviderAuthAuthorityIpcFrame(input) {
    const frame = { schema: PROVIDER_AUTH_AUTHORITY_IPC_FRAME_SCHEMA, version: 1, ...structuredClone(input) };
    if (validateProviderAuthAuthorityIpcFrame(frame).status === 'blocked')
        throw new Error('provider-auth-authority-frame-invalid');
    return frame;
}
export function validateProviderAuthAuthorityIpcFrame(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return { status: 'blocked', reason: 'provider-auth-authority-frame-invalid' };
    const item = value;
    if (Object.keys(item).some((key) => !FRAME_KEYS.has(key)) || item.schema !== PROVIDER_AUTH_AUTHORITY_IPC_FRAME_SCHEMA || item.version !== 1 || !KINDS.includes(item.kind) || !validId(item.correlation_id) || !Number.isInteger(item.sequence) || item.sequence < 1)
        return { status: 'blocked', reason: 'provider-auth-authority-frame-invalid' };
    if (item.nonce !== undefined && !validId(item.nonce))
        return { status: 'blocked', reason: 'provider-auth-authority-frame-nonce-invalid' };
    if (item.kind === 'challenge' && !validId(item.nonce))
        return { status: 'blocked', reason: 'provider-auth-authority-challenge-nonce-required' };
    if (item.kind === 'revoke-request' && !validateRequest(item.payload))
        return { status: 'blocked', reason: 'provider-auth-authority-revoke-request-invalid' };
    if (item.kind === 'revoke-response' && !validateResponse(item.payload))
        return { status: 'blocked', reason: 'provider-auth-authority-revoke-response-invalid' };
    if (item.kind === 'error' && (!item.payload || typeof item.payload !== 'object' || Array.isArray(item.payload) || !validId(item.payload.reason)))
        return { status: 'blocked', reason: 'provider-auth-authority-error-invalid' };
    return { status: 'valid' };
}
