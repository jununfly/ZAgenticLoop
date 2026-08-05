import canonicalize from 'canonicalize';
import { createHash, randomUUID } from 'node:crypto';

export const PROVIDER_AUTH_REF_SCHEMA = 'zj-loop.provider_auth_ref.v1' as const;
export const PROVIDER_LAUNCH_HANDLE_SCHEMA = 'zj-loop.provider_launch_handle.v1' as const;
export const PROVIDER_CLEANUP_PROOF_SCHEMA = 'zj-loop.provider_cleanup_proof.v1' as const;
const PROVIDER_AUTH_REF_KEYS = new Set(['schema', 'auth_ref_id', 'network_id', 'node_id', 'provider_runtime_id', 'provider_id', 'execution_id', 'attempt', 'issuer', 'audience', 'scope', 'issued_at', 'expires_at', 'status', 'ref_digest']);
const PROVIDER_LAUNCH_HANDLE_KEYS = new Set(['schema', 'handle_id', 'auth_ref_id', 'network_id', 'node_id', 'provider_runtime_id', 'provider_id', 'execution_id', 'attempt', 'endpoint_digest', 'contract_digest', 'adapter_contract_digest', 'runtime_identity_fingerprint', 'runtime_manifest_digest', 'provider_capabilities_digest', 'issued_at', 'expires_at', 'status', 'handle_digest']);

export type ProviderRuntimeIdentityBinding = {
  runtime_identity_fingerprint: string;
  runtime_manifest_digest: string;
  provider_capabilities_digest: string;
};

export function validateProviderRuntimeIdentityBinding(value: unknown): { status: 'valid'; binding: ProviderRuntimeIdentityBinding } | { status: 'blocked'; reason: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { status: 'blocked', reason: 'provider-runtime-identity-binding-invalid' };
  const item = value as Record<string, unknown>;
  if (typeof item.runtime_identity_fingerprint === 'string' && /^sha256:[0-9a-f]{64}$/.test(item.runtime_identity_fingerprint)
    && typeof item.runtime_manifest_digest === 'string' && /^sha256:[0-9a-f]{64}$/.test(item.runtime_manifest_digest)
    && typeof item.provider_capabilities_digest === 'string' && /^sha256:[0-9a-f]{64}$/.test(item.provider_capabilities_digest)) return { status: 'valid', binding: item as ProviderRuntimeIdentityBinding };
  return { status: 'blocked', reason: 'provider-runtime-identity-binding-invalid' };
}

function validRuntimeIdentityBinding(value: unknown): value is ProviderRuntimeIdentityBinding { return validateProviderRuntimeIdentityBinding(value).status === 'valid'; }

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

export type ProviderLaunchHandle = {
  schema: typeof PROVIDER_LAUNCH_HANDLE_SCHEMA;
  handle_id: string;
  auth_ref_id: string;
  network_id: string;
  node_id: string;
  provider_runtime_id: string;
  provider_id: string;
  execution_id: string;
  attempt: number;
  endpoint_digest: string;
  contract_digest: string;
  adapter_contract_digest: string;
  runtime_identity_fingerprint: string;
  runtime_manifest_digest: string;
  provider_capabilities_digest: string;
  issued_at: string;
  expires_at: string;
  status: 'active' | 'closed';
  handle_digest: string;
};

export type ProviderCleanupProof = {
  schema: typeof PROVIDER_CLEANUP_PROOF_SCHEMA;
  status: 'cleaned' | 'uncertain';
  auth_ref_id: string;
  handle_digest: string;
  endpoint_digest: string;
  network_id: string;
  node_id: string;
  provider_runtime_id: string;
  provider_id: string;
  execution_id: string;
  attempt: number;
  adapter_contract_digest: string;
  runtime_identity_fingerprint: string;
  runtime_manifest_digest: string;
  provider_capabilities_digest: string;
  revoked: boolean;
  secret_cleared: boolean;
  cleaned_at: string;
  cleanup_digest: string;
};

export type ProviderAuthRuntime = {
  inspect(): Promise<{ status: 'available'; runtime_id: string; provider_ids: string[] } | { status: 'blocked'; reason: string }>;
  issueRef(input: { network_id: string; node_id: string; provider_id: string; execution_id: string; attempt: number; audience: string; scope: string[]; secret: string; issued_at: string; expires_at: string; human_authorized: boolean }): Promise<{ status: 'issued'; ref: ProviderAuthRef } | { status: 'blocked'; reason: string }>;
  verify(input: { ref: ProviderAuthRef; network_id: string; node_id: string; provider_id: string; execution_id: string; attempt: number; now?: string }): Promise<{ status: 'valid'; ref: ProviderAuthRef } | { status: 'blocked'; reason: string }>;
  revoke(input: { auth_ref_id: string }): Promise<{ status: 'revoked' } | { status: 'blocked'; reason: string }>;
  launch(input: { ref: ProviderAuthRef; network_id: string; node_id: string; provider_id: string; execution_id: string; attempt: number; contract_digest: string; adapter_contract_digest: string; runtime_binding: ProviderRuntimeIdentityBinding; issued_at: string; expires_at: string }): Promise<{ status: 'launched'; handle: ProviderLaunchHandle } | { status: 'blocked'; reason: string }>;
  cleanup(input: { handle: ProviderLaunchHandle; network_id: string; node_id: string; provider_id: string; execution_id: string; attempt: number; cleaned_at: string }): Promise<{ status: 'cleaned'; proof: ProviderCleanupProof } | { status: 'blocked'; reason: string }>;
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

function handleDigest(value: Omit<ProviderLaunchHandle, 'handle_digest'>): string { return `sha256:${createHash('sha256').update(canonical(value), 'utf8').digest('hex')}`; }
function cleanupDigest(value: Omit<ProviderCleanupProof, 'cleanup_digest'>): string { return `sha256:${createHash('sha256').update(canonical(value), 'utf8').digest('hex')}`; }

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

export function validateProviderLaunchHandle(value: unknown): { status: 'valid'; handle: ProviderLaunchHandle } | { status: 'blocked'; reason: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { status: 'blocked', reason: 'provider-launch-handle-invalid' };
  const handle = value as ProviderLaunchHandle;
  const { handle_digest: _, ...unsigned } = handle;
  if (Object.keys(handle).some((key) => !PROVIDER_LAUNCH_HANDLE_KEYS.has(key))
    || handle.schema !== PROVIDER_LAUNCH_HANDLE_SCHEMA
    || [handle.handle_id, handle.auth_ref_id, handle.network_id, handle.node_id, handle.provider_runtime_id, handle.provider_id, handle.execution_id].some((item) => typeof item !== 'string' || !item.trim())
    || !Number.isInteger(handle.attempt) || handle.attempt < 1
    || !/^sha256:[0-9a-f]{64}$/.test(handle.endpoint_digest)
    || !/^sha256:[0-9a-f]{64}$/.test(handle.contract_digest)
    || !/^sha256:[0-9a-f]{64}$/.test(handle.adapter_contract_digest)
    || !validRuntimeIdentityBinding(handle)
    || !Number.isFinite(Date.parse(handle.issued_at)) || !Number.isFinite(Date.parse(handle.expires_at))
    || Date.parse(handle.issued_at) >= Date.parse(handle.expires_at)
    || handle.status !== 'active'
    || !/^sha256:[0-9a-f]{64}$/.test(handle.handle_digest)
    || handle.handle_digest !== handleDigest(unsigned)) return { status: 'blocked', reason: 'provider-launch-handle-invalid' };
  return { status: 'valid', handle };
}

export function createProviderRuntimeCleanupCoordinator(input: { runtime: ProviderAuthRuntime; handle: ProviderLaunchHandle; network_id: string; node_id: string; provider_id: string; execution_id: string; attempt: number; cleaned_at?: () => string }): () => Promise<{ status: 'cleaned'; proof_digest: string } | { status: 'uncertain'; reason: string }> {
  return async () => {
    try {
      const result = await input.runtime.cleanup({ handle: input.handle, network_id: input.network_id, node_id: input.node_id, provider_id: input.provider_id, execution_id: input.execution_id, attempt: input.attempt, cleaned_at: (input.cleaned_at ?? (() => new Date().toISOString()))() });
      if (result.status === 'blocked') return { status: 'uncertain', reason: result.reason };
      if (!result.proof || !/^sha256:[0-9a-f]{64}$/.test(result.proof.cleanup_digest)) return { status: 'uncertain', reason: 'provider-runtime-cleanup-proof-invalid' };
      return { status: 'cleaned', proof_digest: result.proof.cleanup_digest };
    } catch { return { status: 'uncertain', reason: 'provider-runtime-cleanup-failed' }; }
  };
}

export function createInMemoryProviderAuthRuntime(input: { runtime_id: string; provider_ids: string[]; runtime_binding?: ProviderRuntimeIdentityBinding; now?: () => string; ref_resolver?: (ref_digest: string) => Promise<ProviderAuthRef | undefined>; revoke_ref?: (input: { auth_ref_id: string }) => Promise<{ status: 'revoked' } | { status: 'blocked'; reason: string }> }): ProviderAuthRuntime {
  const secrets = new Map<string, string>();
  const refs = new Map<string, ProviderAuthRef>();
  const handles = new Map<string, ProviderLaunchHandle>();
  const now = input.now ?? (() => new Date().toISOString());
  const runtime_id = input.runtime_id;
  const provider_ids = [...new Set(input.provider_ids)].sort();
  const runtimeBinding = input.runtime_binding;
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
      const current = refs.get(request.ref.auth_ref_id) ?? await input.ref_resolver?.(request.ref.ref_digest);
      if (!current || !validRef(current) || current.ref_digest !== request.ref.ref_digest) return { status: 'blocked', reason: 'provider-auth-ref-invalid' };
      if (!refs.has(current.auth_ref_id)) refs.set(current.auth_ref_id, current);
      if (current.network_id !== request.network_id || current.node_id !== request.node_id || current.provider_id !== request.provider_id || current.execution_id !== request.execution_id || current.attempt !== request.attempt) return { status: 'blocked', reason: 'provider-auth-ref-binding-mismatch' };
      if (Date.parse(request.now ?? now()) < Date.parse(current.issued_at) || Date.parse(request.now ?? now()) >= Date.parse(current.expires_at)) return { status: 'blocked', reason: 'provider-auth-ref-expired' };
      return { status: 'valid', ref: current };
    },
    async revoke(request) {
      const current = refs.get(request.auth_ref_id);
      if (!current) return input.revoke_ref ? input.revoke_ref(request) : { status: 'blocked', reason: 'provider-auth-ref-not-found' };
      if (input.revoke_ref) return input.revoke_ref(request);
      const revoked = { ...current, status: 'revoked' as const };
      const { ref_digest: _, ...unsigned } = revoked;
      refs.set(revoked.auth_ref_id, { ...revoked, ref_digest: digest(unsigned) });
      secrets.delete(revoked.auth_ref_id);
      return { status: 'revoked' };
    },
    async launch(request) {
      const verified = await this.verify({ ref: request.ref, network_id: request.network_id, node_id: request.node_id, provider_id: request.provider_id, execution_id: request.execution_id, attempt: request.attempt, now: request.issued_at });
      if (verified.status === 'blocked') return verified;
      const binding = request.runtime_binding ?? runtimeBinding;
      if (!request.contract_digest || !/^sha256:[0-9a-f]{64}$/.test(request.contract_digest) || !request.adapter_contract_digest || !/^sha256:[0-9a-f]{64}$/.test(request.adapter_contract_digest) || !validRuntimeIdentityBinding(binding) || !Number.isFinite(Date.parse(request.issued_at)) || !Number.isFinite(Date.parse(request.expires_at)) || Date.parse(request.issued_at) >= Date.parse(request.expires_at)) return { status: 'blocked', reason: 'provider-launch-contract-invalid' };
      if ([...handles.values()].some((handle) => handle.auth_ref_id === request.ref.auth_ref_id && handle.status === 'active')) return { status: 'blocked', reason: 'provider-launch-handle-already-issued' };
      const unsigned = { schema: PROVIDER_LAUNCH_HANDLE_SCHEMA, handle_id: `handle-${randomUUID()}`, auth_ref_id: request.ref.auth_ref_id, network_id: request.network_id, node_id: request.node_id, provider_runtime_id: request.ref.provider_runtime_id, provider_id: request.provider_id, execution_id: request.execution_id, attempt: request.attempt, endpoint_digest: `sha256:${createHash('sha256').update(randomUUID(), 'utf8').digest('hex')}`, contract_digest: request.contract_digest, adapter_contract_digest: request.adapter_contract_digest, ...binding, issued_at: request.issued_at, expires_at: request.expires_at, status: 'active' as const };
      const handle = { ...unsigned, handle_digest: handleDigest(unsigned) };
      handles.set(handle.handle_id, handle);
      return { status: 'launched', handle };
    },
    async cleanup(request) {
      const current = handles.get(request.handle.handle_id);
      if (!current || current.handle_digest !== request.handle.handle_digest || current.status !== 'active') return { status: 'blocked', reason: 'provider-launch-handle-invalid' };
      if (current.network_id !== request.network_id || current.node_id !== request.node_id || current.provider_id !== request.provider_id || current.execution_id !== request.execution_id || current.attempt !== request.attempt) return { status: 'blocked', reason: 'provider-launch-handle-binding-mismatch' };
      const ref = refs.get(current.auth_ref_id);
      if (!ref) return { status: 'blocked', reason: 'provider-auth-ref-not-found' };
      const revoked = await this.revoke({ auth_ref_id: ref.auth_ref_id });
      if (revoked.status === 'blocked') return revoked;
      const closed = { ...current, status: 'closed' as const };
      handles.set(closed.handle_id, { ...closed, handle_digest: handleDigest(closed) });
      const unsigned = { schema: PROVIDER_CLEANUP_PROOF_SCHEMA, status: 'cleaned' as const, auth_ref_id: current.auth_ref_id, handle_digest: current.handle_digest, endpoint_digest: current.endpoint_digest, network_id: current.network_id, node_id: current.node_id, provider_runtime_id: current.provider_runtime_id, provider_id: current.provider_id, execution_id: current.execution_id, attempt: current.attempt, adapter_contract_digest: current.adapter_contract_digest, runtime_identity_fingerprint: current.runtime_identity_fingerprint, runtime_manifest_digest: current.runtime_manifest_digest, provider_capabilities_digest: current.provider_capabilities_digest, revoked: true, secret_cleared: true, cleaned_at: request.cleaned_at };
      return { status: 'cleaned', proof: { ...unsigned, cleanup_digest: cleanupDigest(unsigned) } };
    },
    async consumeSecret(request) {
      const verified = await this.verify(request);
      if (verified.status === 'blocked') return verified;
      const secret = secrets.get(request.ref.auth_ref_id);
      return secret ? { status: 'authorized', secret } : { status: 'blocked', reason: 'provider-auth-secret-unavailable' };
    },
  };
}
