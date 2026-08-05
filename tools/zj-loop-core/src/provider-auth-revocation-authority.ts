import { randomUUID } from 'node:crypto';
import { sha256CanonicalJson, type SqliteStateStore } from './sqlite-state-store.js';
import { validateProviderAuthAuthorityRevokeRequest, type ProviderAuthAuthorityRevokeRequest, type ProviderAuthAuthorityRevokeResponse } from './provider-auth-authority-ipc-protocol.js';
import { PROVIDER_AUTH_REF_REVOKED_EVENT_TYPE } from './provider-auth-ref-store.js';
import { createProviderAuthAuthorityIpcServer } from './provider-auth-authority-ipc.js';
import type { Socket } from 'node:net';

export const PROVIDER_AUTH_REF_REVOKED_EVENT_SCHEMA = 'zj-loop.provider_auth_ref_revoked.v1' as const;

function digest(value: unknown): string { return `sha256:${sha256CanonicalJson(value)}`; }

export function createProviderAuthStateStoreRevocationAuthority(input: { state_store: SqliteStateStore; network_id: string; authority_identity_digest: string; max_revision_retries?: number; now?: () => string }) {
  if (!input.state_store || typeof input.state_store.appendEvent !== 'function' || typeof input.state_store.getRevision !== 'function') throw new Error('provider-auth-revocation-state-store-required');
  if (!/^sha256:[0-9a-f]{64}$/.test(input.authority_identity_digest)) throw new Error('provider-auth-revocation-authority-identity-invalid');
  const maxRetries = input.max_revision_retries ?? 3;
  if (!Number.isInteger(maxRetries) || maxRetries < 1 || maxRetries > 10) throw new Error('provider-auth-revocation-retry-limit-invalid');
  const now = input.now ?? (() => new Date().toISOString());
  return {
    async revoke(request: ProviderAuthAuthorityRevokeRequest): Promise<ProviderAuthAuthorityRevokeResponse> {
      const checked = validateProviderAuthAuthorityRevokeRequest(request);
      if (checked.status === 'blocked') return { schema: 'zj-loop.provider_auth_authority_revoke_response.v1', status: 'blocked', request_id: request?.request_id ?? 'invalid', network_id: input.network_id, runtime_id: request?.runtime_id ?? 'invalid', request_digest: request?.request_digest ?? 'sha256:' + '0'.repeat(64), reason: checked.reason };
      const value = checked.request;
      if (value.network_id !== input.network_id) return { schema: 'zj-loop.provider_auth_authority_revoke_response.v1', status: 'blocked', request_id: value.request_id, network_id: value.network_id, runtime_id: value.runtime_id, request_digest: value.request_digest, reason: 'provider-auth-revocation-network-mismatch' };
      const event_id = `provider-auth-ref.revoked:${value.auth_ref_id}:${value.request_id}`;
      const occurred_at = now();
      const payload = { schema: PROVIDER_AUTH_REF_REVOKED_EVENT_SCHEMA, auth_ref_id: value.auth_ref_id, auth_ref_digest: value.auth_ref_digest, request_id: value.request_id, request_digest: value.request_digest, network_id: value.network_id, runtime_id: value.runtime_id, runtime_binding: value.runtime_binding, authority_identity_digest: input.authority_identity_digest, reason: value.revoke_reason };
      const event_digest = digest(payload);
      const duplicate = async (): Promise<ProviderAuthAuthorityRevokeResponse | undefined> => {
        const snapshot = await input.state_store.readEvents({ network_id: input.network_id, aggregate_type: 'provider-auth-ref', aggregate_id: value.auth_ref_id });
        const existing = snapshot.events.find((event) => event.event_id === event_id);
        if (!existing) return undefined;
        return existing.payload_sha256 === sha256CanonicalJson(payload)
          ? { schema: 'zj-loop.provider_auth_authority_revoke_response.v1', status: 'duplicate', request_id: value.request_id, network_id: value.network_id, runtime_id: value.runtime_id, request_digest: value.request_digest, event_digest }
          : { schema: 'zj-loop.provider_auth_authority_revoke_response.v1', status: 'blocked', request_id: value.request_id, network_id: value.network_id, runtime_id: value.runtime_id, request_digest: value.request_digest, reason: 'provider-auth-revocation-event-id-conflict' };
      };
      let existing: ProviderAuthAuthorityRevokeResponse | undefined;
      try { existing = await duplicate(); } catch { return { schema: 'zj-loop.provider_auth_authority_revoke_response.v1', status: 'outcome-uncertain', request_id: value.request_id, network_id: value.network_id, runtime_id: value.runtime_id, request_digest: value.request_digest, reason: 'provider-auth-revocation-state-store-failed' }; }
      if (existing) return existing;
      for (let attempt = 0; attempt < maxRetries; attempt += 1) {
        try {
          const expected_revision = await input.state_store.getRevision(input.network_id);
          const result = await input.state_store.appendEvent({ network_id: input.network_id, expected_revision, event: { event_id, aggregate_type: 'provider-auth-ref', aggregate_id: value.auth_ref_id, event_type: PROVIDER_AUTH_REF_REVOKED_EVENT_TYPE, occurred_at, payload } });
          if (result.status === 'recorded') return { schema: 'zj-loop.provider_auth_authority_revoke_response.v1', status: 'revoked', request_id: value.request_id, network_id: value.network_id, runtime_id: value.runtime_id, request_digest: value.request_digest, event_digest };
          if (result.status === 'duplicate') return { schema: 'zj-loop.provider_auth_authority_revoke_response.v1', status: 'duplicate', request_id: value.request_id, network_id: value.network_id, runtime_id: value.runtime_id, request_digest: value.request_digest, event_digest };
          if (result.reason === 'event-id-reused') return await duplicate() ?? { schema: 'zj-loop.provider_auth_authority_revoke_response.v1', status: 'outcome-uncertain', request_id: value.request_id, network_id: value.network_id, runtime_id: value.runtime_id, request_digest: value.request_digest, reason: 'provider-auth-revocation-event-id-reread-failed' };
          if (result.reason !== 'revision-mismatch') return { schema: 'zj-loop.provider_auth_authority_revoke_response.v1', status: 'blocked', request_id: value.request_id, network_id: value.network_id, runtime_id: value.runtime_id, request_digest: value.request_digest, reason: result.reason ?? 'provider-auth-revocation-conflict' };
        } catch { return { schema: 'zj-loop.provider_auth_authority_revoke_response.v1', status: 'outcome-uncertain', request_id: value.request_id, network_id: value.network_id, runtime_id: value.runtime_id, request_digest: value.request_digest, reason: 'provider-auth-revocation-state-store-failed' }; }
      }
      return { schema: 'zj-loop.provider_auth_authority_revoke_response.v1', status: 'outcome-uncertain', request_id: value.request_id, network_id: value.network_id, runtime_id: value.runtime_id, request_digest: value.request_digest, reason: 'provider-auth-revocation-revision-retry-exhausted' };
    },
  };
}

export function createProviderAuthStateStoreAuthorityIpcServer(input: {
  socket_path: string;
  correlation_id: string;
  expected_authority_contract_digest: string;
  verify_peer: (socket: Socket) => Promise<boolean> | boolean;
  state_store: SqliteStateStore;
  network_id: string;
  authority_identity_digest: string;
  max_revision_retries?: number;
  now?: () => string;
}) {
  const authority = createProviderAuthStateStoreRevocationAuthority({ state_store: input.state_store, network_id: input.network_id, authority_identity_digest: input.authority_identity_digest, max_revision_retries: input.max_revision_retries, now: input.now });
  const server = createProviderAuthAuthorityIpcServer({ socket_path: input.socket_path, correlation_id: input.correlation_id, expected_authority_contract_digest: input.expected_authority_contract_digest, verify_peer: input.verify_peer, handle_revoke: (request) => authority.revoke(request) });
  return { server, authority };
}
