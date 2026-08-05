import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
import { validateProviderRuntimeIdentityBinding, type ProviderRuntimeIdentityBinding } from './provider-auth-runtime.js';
import type { FramedJsonValidation } from './framed-json-transport.js';

export const PROVIDER_AUTH_AUTHORITY_IPC_FRAME_SCHEMA = 'zj-loop.provider_auth_authority_ipc_frame.v1' as const;
export const PROVIDER_AUTH_AUTHORITY_REVOKE_REQUEST_SCHEMA = 'zj-loop.provider_auth_authority_revoke_request.v1' as const;
export const PROVIDER_AUTH_AUTHORITY_REVOKE_RESPONSE_SCHEMA = 'zj-loop.provider_auth_authority_revoke_response.v1' as const;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const ID = /^[^\s\0]{1,256}$/;
const KINDS = ['challenge', 'revoke-request', 'revoke-response', 'error'] as const;
const FRAME_KEYS = new Set(['schema', 'version', 'kind', 'correlation_id', 'sequence', 'nonce', 'payload']);
const REQUEST_KEYS = new Set(['schema', 'request_id', 'network_id', 'runtime_id', 'runtime_binding', 'auth_ref_id', 'auth_ref_digest', 'authority_contract_digest', 'revoke_reason', 'nonce', 'request_digest']);
const RESPONSE_KEYS = new Set(['schema', 'status', 'request_id', 'network_id', 'runtime_id', 'request_digest', 'event_digest', 'reason']);
const STATUSES = ['revoked', 'duplicate', 'blocked', 'outcome-uncertain'] as const;

export type ProviderAuthAuthorityIpcFrameKind = typeof KINDS[number];
export type ProviderAuthAuthorityIpcFrame = { schema: typeof PROVIDER_AUTH_AUTHORITY_IPC_FRAME_SCHEMA; version: 1; kind: ProviderAuthAuthorityIpcFrameKind; correlation_id: string; sequence: number; nonce?: string; payload?: Record<string, unknown> };
export type ProviderAuthAuthorityRevokeRequest = { schema: typeof PROVIDER_AUTH_AUTHORITY_REVOKE_REQUEST_SCHEMA; request_id: string; network_id: string; runtime_id: string; runtime_binding: ProviderRuntimeIdentityBinding; auth_ref_id: string; auth_ref_digest: string; authority_contract_digest: string; revoke_reason: string; nonce: string; request_digest: string };
export type ProviderAuthAuthorityRevokeResponse = { schema: typeof PROVIDER_AUTH_AUTHORITY_REVOKE_RESPONSE_SCHEMA; status: typeof STATUSES[number]; request_id: string; network_id: string; runtime_id: string; request_digest: string; event_digest?: string; reason?: string };

function canonical(value: unknown): string { const result = canonicalize(value); if (typeof result !== 'string') throw new Error('provider-auth-authority-canonicalization-invalid'); return result; }
function digest(value: unknown): string { return `sha256:${createHash('sha256').update(canonical(value), 'utf8').digest('hex')}`; }
function validId(value: unknown): value is string { return typeof value === 'string' && ID.test(value); }
function validDigest(value: unknown): value is string { return typeof value === 'string' && DIGEST.test(value); }

export function validateProviderAuthAuthorityRevokeRequest(value: unknown): { status: 'valid'; request: ProviderAuthAuthorityRevokeRequest } | { status: 'blocked'; reason: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { status: 'blocked', reason: 'provider-auth-authority-revoke-request-invalid' };
  const item = value as Record<string, unknown>;
  if (Object.keys(item).some((key) => !REQUEST_KEYS.has(key)) || item.schema !== PROVIDER_AUTH_AUTHORITY_REVOKE_REQUEST_SCHEMA || !validId(item.request_id) || !validId(item.network_id) || !validId(item.runtime_id) || validateProviderRuntimeIdentityBinding(item.runtime_binding).status === 'blocked' || !validId(item.auth_ref_id) || !validDigest(item.auth_ref_digest) || !validDigest(item.authority_contract_digest) || !validId(item.revoke_reason) || !validId(item.nonce) || !validDigest(item.request_digest)) return { status: 'blocked', reason: 'provider-auth-authority-revoke-request-invalid' };
  const { request_digest: _, nonce: __, ...unsigned } = item;
  return digest(unsigned) === item.request_digest ? { status: 'valid', request: item as ProviderAuthAuthorityRevokeRequest } : { status: 'blocked', reason: 'provider-auth-authority-revoke-request-digest-invalid' };
}

function validateResponse(value: unknown): value is ProviderAuthAuthorityRevokeResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return Object.keys(item).some((key) => !RESPONSE_KEYS.has(key)) === false && item.schema === PROVIDER_AUTH_AUTHORITY_REVOKE_RESPONSE_SCHEMA && STATUSES.includes(item.status as typeof STATUSES[number]) && validId(item.request_id) && validId(item.network_id) && validId(item.runtime_id) && validDigest(item.request_digest) && (item.event_digest === undefined || validDigest(item.event_digest)) && (!['revoked', 'duplicate'].includes(item.status as string) || validDigest(item.event_digest)) && (item.reason === undefined || validId(item.reason));
}

export function createProviderAuthAuthorityRevokeRequest(input: Omit<ProviderAuthAuthorityRevokeRequest, 'schema' | 'request_digest'>): ProviderAuthAuthorityRevokeRequest {
  const unsigned = { schema: PROVIDER_AUTH_AUTHORITY_REVOKE_REQUEST_SCHEMA, ...structuredClone(input) };
  const { nonce: _, ...digestable } = unsigned;
  const request = { ...unsigned, request_digest: digest(digestable) };
  if (validateProviderAuthAuthorityRevokeRequest(request).status === 'blocked') throw new Error('provider-auth-authority-revoke-request-invalid');
  return request;
}

export function createProviderAuthAuthorityRevokeResponse(input: Omit<ProviderAuthAuthorityRevokeResponse, 'schema'>): ProviderAuthAuthorityRevokeResponse {
  const response = { schema: PROVIDER_AUTH_AUTHORITY_REVOKE_RESPONSE_SCHEMA, ...structuredClone(input) };
  if (['revoked', 'duplicate'].includes(response.status) && !response.event_digest) throw new Error('provider-auth-authority-revoke-event-digest-required');
  if (!validateResponse(response)) throw new Error('provider-auth-authority-revoke-response-invalid');
  return response;
}

export function createProviderAuthAuthorityIpcFrame(input: Omit<ProviderAuthAuthorityIpcFrame, 'schema' | 'version'>): ProviderAuthAuthorityIpcFrame {
  const frame = { schema: PROVIDER_AUTH_AUTHORITY_IPC_FRAME_SCHEMA, version: 1 as const, ...structuredClone(input) };
  if (validateProviderAuthAuthorityIpcFrame(frame).status === 'blocked') throw new Error('provider-auth-authority-frame-invalid');
  return frame;
}

export function validateProviderAuthAuthorityIpcFrame(value: unknown): FramedJsonValidation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { status: 'blocked', reason: 'provider-auth-authority-frame-invalid' };
  const item = value as Record<string, unknown>;
  if (Object.keys(item).some((key) => !FRAME_KEYS.has(key)) || item.schema !== PROVIDER_AUTH_AUTHORITY_IPC_FRAME_SCHEMA || item.version !== 1 || !KINDS.includes(item.kind as ProviderAuthAuthorityIpcFrameKind) || !validId(item.correlation_id) || !Number.isInteger(item.sequence) || (item.sequence as number) < 1) return { status: 'blocked', reason: 'provider-auth-authority-frame-invalid' };
  if (item.nonce !== undefined && !validId(item.nonce)) return { status: 'blocked', reason: 'provider-auth-authority-frame-nonce-invalid' };
  if (item.kind === 'challenge' && !validId(item.nonce)) return { status: 'blocked', reason: 'provider-auth-authority-challenge-nonce-required' };
  if (item.kind === 'revoke-request' && validateProviderAuthAuthorityRevokeRequest(item.payload).status === 'blocked') return { status: 'blocked', reason: 'provider-auth-authority-revoke-request-invalid' };
  if (item.kind === 'revoke-response' && !validateResponse(item.payload)) return { status: 'blocked', reason: 'provider-auth-authority-revoke-response-invalid' };
  if (item.kind === 'error' && (!item.payload || typeof item.payload !== 'object' || Array.isArray(item.payload) || !validId((item.payload as Record<string, unknown>).reason))) return { status: 'blocked', reason: 'provider-auth-authority-error-invalid' };
  return { status: 'valid' };
}
