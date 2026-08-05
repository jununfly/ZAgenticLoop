import type { ProviderAuthRef } from './provider-auth-runtime.js';
import { validateProviderAuthRef } from './provider-auth-runtime.js';
import type { SqliteStateStore, StateEvent } from './sqlite-state-store.js';

export const PROVIDER_AUTH_REF_ISSUED_EVENT_TYPE = 'provider-auth-ref.issued' as const;
export const PROVIDER_AUTH_REF_REVOKED_EVENT_TYPE = 'provider-auth-ref.revoked' as const;

export type ProviderAuthRefResolver = {
  resolve(input: { auth_ref_digest: string }): Promise<ProviderAuthRef | undefined>;
};

type RefState = { ref: ProviderAuthRef; revoked: boolean };

function validDigest(value: unknown): value is string { return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/.test(value); }

function project(events: StateEvent[], networkId: string): Map<string, RefState> {
  const refs = new Map<string, RefState>();
  for (const event of events.sort((left, right) => left.revision - right.revision)) {
    if (event.network_id !== networkId || event.aggregate_type !== 'provider-auth-ref') continue;
    if (event.event_type === PROVIDER_AUTH_REF_ISSUED_EVENT_TYPE) {
      const payload = event.payload as Record<string, unknown>;
      const ref = payload?.auth_ref;
      if (payload?.schema !== 'zj-loop.provider_auth_ref_issued.v1' || validateProviderAuthRef(ref).status === 'blocked') continue;
      const typed = ref as ProviderAuthRef;
      if (typed.network_id !== networkId || typed.auth_ref_id !== event.aggregate_id) continue;
      refs.set(typed.ref_digest, { ref: typed, revoked: false });
    } else if (event.event_type === PROVIDER_AUTH_REF_REVOKED_EVENT_TYPE) {
      const payload = event.payload as Record<string, unknown>;
      if (payload?.schema !== 'zj-loop.provider_auth_ref_revoked.v1' || typeof payload.auth_ref_id !== 'string' || !validDigest(payload.auth_ref_digest)) continue;
      const current = refs.get(payload.auth_ref_digest);
      if (current?.ref.auth_ref_id === payload.auth_ref_id) refs.set(payload.auth_ref_digest, { ...current, revoked: true });
    }
  }
  return refs;
}

export function createProviderAuthRefStateStoreResolver(input: { stateStore: SqliteStateStore; network_id: string }): ProviderAuthRefResolver {
  if (!input.stateStore || typeof input.stateStore.readEvents !== 'function') throw new Error('provider-auth-ref-state-store-required');
  if (typeof input.network_id !== 'string' || input.network_id.trim() === '') throw new Error('provider-auth-ref-network-id-required');
  return {
    async resolve(request) {
      if (!validDigest(request.auth_ref_digest)) return undefined;
      const snapshot = await input.stateStore.readEvents({ network_id: input.network_id, aggregate_type: 'provider-auth-ref' });
      const state = project(snapshot.events, input.network_id).get(request.auth_ref_digest);
      return state && !state.revoked ? structuredClone(state.ref) : undefined;
    },
  };
}
