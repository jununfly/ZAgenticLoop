import canonicalize from 'canonicalize';
import { createHash, randomUUID } from 'node:crypto';

export const PROVIDER_AUTH_REF_SCHEMA = 'zj-loop.provider_auth_ref.v1' as const;
const PROVIDER_AUTH_REF_KEYS = new Set(['schema', 'auth_ref_id', 'network_id', 'node_id', 'provider_runtime_id', 'provider_id', 'execution_id', 'attempt', 'issuer', 'audience', 'scope', 'issued_at', 'expires_at', 'status', 'ref_digest']);

export type ProviderAuthRef = {
  schema: typeof PROVIDER_AUTH_REF_SCHEMA;
  auth_ref_id: string;
  network_id: string;
  node_id: string;
  provider_runtime_id: string;
  provider_id: string;
  execution_id: string;
  attempt: number;
  issuer: string;
  audience: string;
  scope: string[];
  issued_at: string;
  expires_at: string;
  status: 'active' | 'revoked';
  ref_digest: string;
};

export type ProviderAuthRuntime = {
  inspect(): Promise<{ status: 'available'; runtime_id: string; provider_ids: string[] } | { status: 'blocked'; reason: string }>;
  issueRef(input: { network_id: string; node_id: string; provider_id: string; execution_id: string; attempt: number; audience: string; scope: string[]; secret: string; issued_at: string; expires_at: string; human_authorized: boolean }): Promise<{ status: 'issued'; ref: ProviderAuthRef } | { status: 'blocked'; reason: string }>;
  verify(input: { ref: ProviderAuthRef; network_id: string; node_id: string; provider_id: string; execution_id: string; attempt: number; now?: string }): Promise<{ status: 'valid'; ref: ProviderAuthRef } | { status: 'blocked'; reason: string }>;
  revoke(input: { auth_ref_id: string }): Promise<{ status: 'revoked' } | { status: 'blocked'; reason: string }>;
  consumeSecret(input: { ref: ProviderAuthRef; network_id: string; node_id: string; provider_id: string; execution_id: string; attempt: number; now?: string }): Promise<{ status: 'authorized'; secret: string } | { status: 'blocked'; reason: string }>;
};

function canonical(value: unknown): string {
  const json = canonicalize(value);
  if (typeof json !== 'string') throw new Error('provider-auth-canonicalization-invalid');
  return json;
}

function digest(value: Omit<ProviderAuthRef, 'ref_digest'>): string {
  return `sha256:${createHash('sha256').update(canonical(value), 'utf8').digest('hex')}`;
}

function normalizeScope(scope: string[]): string[] {
  return [...new Set(scope)].sort();
}

function validRef(ref: ProviderAuthRef): boolean {
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

export function validateProviderAuthRef(value: unknown): { status: 'valid' } | { status: 'blocked'; reason: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { status: 'blocked', reason: 'provider-auth-ref-invalid' };
  const ref = value as ProviderAuthRef;
  if (!validRef(ref)) return { status: 'blocked', reason: 'provider-auth-ref-invalid' };
  return { status: 'valid' };
}

export function providerAuthRefDigest(ref: ProviderAuthRef): string {
  const { ref_digest: _, ...unsigned } = ref;
  return digest(unsigned);
}

export function createInMemoryProviderAuthRuntime(input: { runtime_id: string; provider_ids: string[]; now?: () => string }): ProviderAuthRuntime {
  const secrets = new Map<string, string>();
  const refs = new Map<string, ProviderAuthRef>();
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
      if (!request.human_authorized) return { status: 'blocked', reason: 'provider-auth-human-authorization-required' };
      if (!provider_ids.includes(request.provider_id)) return { status: 'blocked', reason: 'provider-auth-provider-not-supported' };
      if (!request.secret || request.secret.includes('\0')) return { status: 'blocked', reason: 'provider-auth-secret-invalid' };
      const scope = normalizeScope(request.scope);
      if (!request.execution_id.trim() || !Number.isInteger(request.attempt) || request.attempt < 1) return { status: 'blocked', reason: 'provider-auth-execution-binding-invalid' };
      const unsigned = { schema: PROVIDER_AUTH_REF_SCHEMA, auth_ref_id: `auth-${randomUUID()}`, network_id: request.network_id, node_id: request.node_id, provider_runtime_id: runtime_id, provider_id: request.provider_id, execution_id: request.execution_id, attempt: request.attempt, issuer: runtime_id, audience: request.audience, scope, issued_at: request.issued_at, expires_at: request.expires_at, status: 'active' as const };
      const ref = { ...unsigned, ref_digest: digest(unsigned) };
      refs.set(ref.auth_ref_id, ref);
      secrets.set(ref.auth_ref_id, request.secret);
      return { status: 'issued', ref };
    },
    async verify(request) {
      const current = refs.get(request.ref.auth_ref_id);
      if (!current || !validRef(current) || current.ref_digest !== request.ref.ref_digest) return { status: 'blocked', reason: 'provider-auth-ref-invalid' };
      if (current.network_id !== request.network_id || current.node_id !== request.node_id || current.provider_id !== request.provider_id || current.execution_id !== request.execution_id || current.attempt !== request.attempt) return { status: 'blocked', reason: 'provider-auth-ref-binding-mismatch' };
      if (Date.parse(request.now ?? now()) < Date.parse(current.issued_at) || Date.parse(request.now ?? now()) >= Date.parse(current.expires_at)) return { status: 'blocked', reason: 'provider-auth-ref-expired' };
      return { status: 'valid', ref: current };
    },
    async revoke(request) {
      const current = refs.get(request.auth_ref_id);
      if (!current) return { status: 'blocked', reason: 'provider-auth-ref-not-found' };
      const revoked = { ...current, status: 'revoked' as const };
      const { ref_digest: _, ...unsigned } = revoked;
      refs.set(revoked.auth_ref_id, { ...revoked, ref_digest: digest(unsigned) });
      secrets.delete(revoked.auth_ref_id);
      return { status: 'revoked' };
    },
    async consumeSecret(request) {
      const verified = await this.verify(request);
      if (verified.status === 'blocked') return verified;
      const secret = secrets.get(request.ref.auth_ref_id);
      return secret ? { status: 'authorized', secret } : { status: 'blocked', reason: 'provider-auth-secret-unavailable' };
    },
  };
}
