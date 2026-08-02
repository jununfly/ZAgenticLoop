import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
import type { HumanSigner, HumanSignerIdentity, HumanSignature } from './human-signer.js';
import { verifyHumanSignature } from './human-signer.js';
import type { SqliteStateStore, StateEvent } from './sqlite-state-store.js';

export const HUMAN_AUTHORITY_SET_SCHEMA = 'zj-loop.human_authority_set.v1' as const;
export const HUMAN_AUTHORITY_SET_AGGREGATE_TYPE = 'human-authority-set' as const;
export const HUMAN_AUTHORITY_SET_AGGREGATE_ID = 'network' as const;
export const HUMAN_AUTHORITY_SET_EVENT_TYPE = 'human-authority-set.initialized' as const;
export const HUMAN_AUTHORITY_SET_MUTATION_EVENT_TYPE = 'human-authority-set.mutation' as const;

export type HumanAuthoritySetMutationAction = 'add' | 'rotate' | 'revoke';
export type HumanAuthoritySetInitialization = { schema: typeof HUMAN_AUTHORITY_SET_SCHEMA; network_id: string; mutation_id: string; action: 'initialize'; owner: HumanSignerIdentity; signer_fingerprint: string; reason: string; occurred_at: string; expected_revision: number; canonical_payload_digest: string; signature: HumanSignature };
export type HumanAuthoritySetMutation = { schema: typeof HUMAN_AUTHORITY_SET_SCHEMA; network_id: string; mutation_id: string; action: HumanAuthoritySetMutationAction; authority: HumanSignerIdentity; replacement?: HumanSignerIdentity; previous_authority_set_digest: string; target_authority_set_digest: string; signer_fingerprint: string; human_id: string; reason: string; occurred_at: string; expected_revision: number; canonical_payload_digest: string; signature: HumanSignature };
export type HumanAuthoritySetSnapshot = { network_id: string; revision: number; digest: string; active: HumanSignerIdentity[] };
export type HumanAuthoritySetMutationBuildResult = { status: 'ready'; mutation: HumanAuthoritySetMutation; snapshot: HumanAuthoritySetSnapshot } | { status: 'blocked' | 'conflict'; snapshot: HumanAuthoritySetSnapshot; reason: string };
export type HumanAuthoritySetInitializationBuildResult = { status: 'ready'; initialization: HumanAuthoritySetInitialization; snapshot: HumanAuthoritySetSnapshot } | { status: 'blocked' | 'conflict'; snapshot: HumanAuthoritySetSnapshot; reason: string };

type AuthorityEvent = HumanAuthoritySetInitialization | HumanAuthoritySetMutation;

function digest(value: unknown): string {
  const json = canonicalize(value);
  if (typeof json !== 'string') throw new Error('human-authority-set-canonicalization-invalid');
  return `sha256:${createHash('sha256').update(json, 'utf8').digest('hex')}`;
}

function identitySort(active: HumanSignerIdentity[]): HumanSignerIdentity[] {
  return active.map((identity) => ({ ...identity })).sort((left, right) => `${left.public_key_fingerprint}:${left.human_id}`.localeCompare(`${right.public_key_fingerprint}:${right.human_id}`));
}

function identityEqual(left: HumanSignerIdentity, right: HumanSignerIdentity): boolean {
  return left.human_id === right.human_id && left.public_key_fingerprint === right.public_key_fingerprint && left.public_key_pem === right.public_key_pem && left.algorithm === right.algorithm && left.schema === right.schema;
}

export function humanAuthoritySetDigest(active: HumanSignerIdentity[]): string { return digest(identitySort(active)); }

function payloadBytes(value: unknown): Uint8Array {
  const json = canonicalize(value);
  if (typeof json !== 'string') throw new Error('human-authority-set-canonicalization-invalid');
  return new TextEncoder().encode(json);
}

function unsigned(value: AuthorityEvent): Omit<AuthorityEvent, 'canonical_payload_digest' | 'signature'> {
  const { canonical_payload_digest: _, signature: __, ...payload } = value;
  return payload;
}

function validIdentity(identity: HumanSignerIdentity): boolean {
  return identity.schema === 'zj-loop.human_signer.v1' && identity.algorithm === 'ECDSA-P256' && identity.human_id.trim() !== '' && /^[0-9a-f]{64}$/.test(identity.public_key_fingerprint) && identity.public_key_pem.trim() !== '';
}

function validateInitialization(value: HumanAuthoritySetInitialization): boolean {
  return value.schema === HUMAN_AUTHORITY_SET_SCHEMA && value.action === 'initialize' && validIdentity(value.owner) && value.signer_fingerprint === value.owner.public_key_fingerprint && Number.isInteger(value.expected_revision) && value.expected_revision >= 1 && value.canonical_payload_digest === digest(unsigned(value)) && verifyHumanSignature({ identity: value.owner, payload: payloadBytes(unsigned(value)), signature: value.signature });
}

function validateMutation(value: HumanAuthoritySetMutation, identity: HumanSignerIdentity): { status: 'valid' | 'blocked'; reason?: string } {
  if (value.schema !== HUMAN_AUTHORITY_SET_SCHEMA || !['add', 'rotate', 'revoke'].includes(value.action) || !validIdentity(value.authority) || (value.replacement !== undefined && !validIdentity(value.replacement)) || !/^sha256:[0-9a-f]{64}$/.test(value.previous_authority_set_digest) || !/^sha256:[0-9a-f]{64}$/.test(value.target_authority_set_digest) || !Number.isInteger(value.expected_revision) || value.expected_revision < 1) return { status: 'blocked', reason: 'authority-set-mutation-invalid' };
  if (value.action === 'rotate' && !value.replacement) return { status: 'blocked', reason: 'authority-set-replacement-required' };
  if (value.action !== 'rotate' && value.replacement) return { status: 'blocked', reason: 'authority-set-replacement-unexpected' };
  if (identity.human_id !== value.human_id || identity.public_key_fingerprint !== value.signer_fingerprint) return { status: 'blocked', reason: 'human-identity-mismatch' };
  if (value.canonical_payload_digest !== digest(unsigned(value))) return { status: 'blocked', reason: 'authority-set-mutation-digest-invalid' };
  if (!verifyHumanSignature({ identity, payload: payloadBytes(unsigned(value)), signature: value.signature })) return { status: 'blocked', reason: 'authority-set-mutation-signature-invalid' };
  return { status: 'valid' };
}

function nextAuthorities(active: HumanSignerIdentity[], mutation: HumanAuthoritySetMutation): { status: 'recorded' | 'blocked'; active: HumanSignerIdentity[]; reason?: string } {
  const result = active.map((identity) => ({ ...identity }));
  const index = result.findIndex((identity) => identityEqual(identity, mutation.authority));
  if (mutation.action === 'add') {
    if (index !== -1) return { status: 'blocked', active: result, reason: 'authority-set-already-active' };
    result.push({ ...mutation.authority });
  } else {
    if (index === -1) return { status: 'blocked', active: result, reason: 'authority-set-authority-not-active' };
    if (mutation.action === 'revoke') {
      if (result.length === 1) return { status: 'blocked', active: result, reason: 'authority-set-last-active-cannot-revoke' };
      result.splice(index, 1);
    } else {
      if (!mutation.replacement || identityEqual(mutation.authority, mutation.replacement)) return { status: 'blocked', active: result, reason: 'authority-set-rotation-invalid' };
      if (result.some((identity) => identityEqual(identity, mutation.replacement as HumanSignerIdentity))) return { status: 'blocked', active: result, reason: 'authority-set-replacement-already-active' };
      result[index] = { ...mutation.replacement };
    }
  }
  return { status: 'recorded', active: identitySort(result) };
}

async function createHumanAuthoritySetInitializationWithOwner(input: { signer: HumanSigner; network_id: string; mutation_id: string; expected_revision: number; reason: string; occurred_at: string }): Promise<HumanAuthoritySetInitialization> {
  const owner = await input.signer.getPublicIdentity();
  const payload = { schema: HUMAN_AUTHORITY_SET_SCHEMA, network_id: input.network_id, mutation_id: input.mutation_id, action: 'initialize' as const, owner, signer_fingerprint: owner.public_key_fingerprint, reason: input.reason, occurred_at: input.occurred_at, expected_revision: input.expected_revision };
  return { ...payload, canonical_payload_digest: digest(payload), signature: await input.signer.sign({ payload: payloadBytes(payload) }) };
}

export async function createHumanAuthoritySetInitializationFromStore(input: { stateStore: SqliteStateStore; signer: HumanSigner; network_id: string; mutation_id: string; expected_revision: number; reason: string; occurred_at: string }): Promise<HumanAuthoritySetInitializationBuildResult> {
  const current = await readHumanAuthoritySet({ stateStore: input.stateStore, network_id: input.network_id });
  const networkEvents = await input.stateStore.readEvents({ network_id: input.network_id, aggregate_type: 'network', aggregate_id: input.network_id });
  const created = networkEvents.events.find((event) => event.event_type === 'network.created');
  const ownerId = created && typeof created.payload === 'object' && created.payload !== null && 'owner_id' in created.payload ? (created.payload as { owner_id: unknown }).owner_id : undefined;
  if (typeof ownerId !== 'string' || ownerId.trim() === '') throw new Error('network-owner-metadata-invalid');
  const identity = await input.signer.getPublicIdentity();
  if (identity.human_id !== ownerId) return { status: 'blocked', snapshot: current, reason: 'human-owner-mismatch' };
  if (current.active.length > 0) return { status: 'conflict', snapshot: current, reason: 'human-authority-set-already-initialized' };
  if (current.revision !== input.expected_revision) return { status: 'conflict', snapshot: current, reason: 'human-authority-set-revision-mismatch' };
  return { status: 'ready', snapshot: current, initialization: await createHumanAuthoritySetInitializationWithOwner(input) };
}

async function createHumanAuthoritySetMutationWithDigests(input: { signer: HumanSigner; network_id: string; mutation_id: string; action: HumanAuthoritySetMutationAction; authority: HumanSignerIdentity; replacement?: HumanSignerIdentity; previous_authority_set_digest: string; target_authority_set_digest: string; expected_revision: number; reason: string; occurred_at: string }): Promise<HumanAuthoritySetMutation> {
  const identity = await input.signer.getPublicIdentity();
  const payload = { schema: HUMAN_AUTHORITY_SET_SCHEMA, network_id: input.network_id, mutation_id: input.mutation_id, action: input.action, authority: input.authority, ...(input.replacement ? { replacement: input.replacement } : {}), previous_authority_set_digest: input.previous_authority_set_digest, target_authority_set_digest: input.target_authority_set_digest, signer_fingerprint: identity.public_key_fingerprint, human_id: identity.human_id, reason: input.reason, occurred_at: input.occurred_at, expected_revision: input.expected_revision };
  return { ...payload, canonical_payload_digest: digest(payload), signature: await input.signer.sign({ payload: payloadBytes(payload) }) };
}

export async function createHumanAuthoritySetMutationFromStore(input: { stateStore: SqliteStateStore; signer: HumanSigner; network_id: string; mutation_id: string; action: HumanAuthoritySetMutationAction; authority: HumanSignerIdentity; replacement?: HumanSignerIdentity; expected_revision: number; reason: string; occurred_at: string }): Promise<HumanAuthoritySetMutationBuildResult> {
  const current = await readHumanAuthoritySet({ stateStore: input.stateStore, network_id: input.network_id });
  if (current.active.length === 0) return { status: 'blocked', snapshot: current, reason: 'human-authority-set-not-initialized' };
  if (current.revision !== input.expected_revision) return { status: 'conflict', snapshot: current, reason: 'human-authority-set-revision-mismatch' };
  const signerIdentity = await input.signer.getPublicIdentity();
  if (!current.active.some((identity) => identityEqual(identity, signerIdentity))) return { status: 'blocked', snapshot: current, reason: 'human-identity-mismatch' };
  const projected = nextAuthorities(current.active, { action: input.action, authority: input.authority, replacement: input.replacement } as HumanAuthoritySetMutation);
  if (projected.status === 'blocked') return { status: 'blocked', snapshot: current, reason: projected.reason ?? 'authority-set-mutation-blocked' };
  return { status: 'ready', snapshot: current, mutation: await createHumanAuthoritySetMutationWithDigests({ ...input, previous_authority_set_digest: current.digest, target_authority_set_digest: humanAuthoritySetDigest(projected.active) }) };
}

function snapshot(network_id: string, revision: number, active: HumanSignerIdentity[]): HumanAuthoritySetSnapshot {
  const sorted = identitySort(active);
  return { network_id, revision, active: sorted, digest: humanAuthoritySetDigest(sorted) };
}

export function replayHumanAuthoritySet(input: { network_id: string; revision: number; events: StateEvent[] }): HumanAuthoritySetSnapshot {
  let active: HumanSignerIdentity[] = [];
  for (const event of input.events.sort((left, right) => left.revision - right.revision)) {
    const value = event.payload as AuthorityEvent;
    if (event.event_type === HUMAN_AUTHORITY_SET_EVENT_TYPE) {
      if (!validateInitialization(value as HumanAuthoritySetInitialization) || active.length > 0) throw new Error('human-authority-set-history-invalid');
      active = [{ ...(value as HumanAuthoritySetInitialization).owner }];
      continue;
    }
    if (event.event_type !== HUMAN_AUTHORITY_SET_MUTATION_EVENT_TYPE || active.length === 0) throw new Error('human-authority-set-history-invalid');
    const mutation = value as HumanAuthoritySetMutation;
    const signer = active.find((identity) => identity.public_key_fingerprint === mutation.signer_fingerprint && identity.human_id === mutation.human_id);
    if (!signer) throw new Error('human-authority-set-history-signer-inactive');
    const validation = validateMutation(mutation, signer);
    if (validation.status === 'blocked' || mutation.previous_authority_set_digest !== humanAuthoritySetDigest(active)) throw new Error(`human-authority-set-history-invalid:${validation.reason ?? 'authority-set-digest-mismatch'}`);
    const next = nextAuthorities(active, mutation);
    if (next.status === 'blocked' || mutation.target_authority_set_digest !== humanAuthoritySetDigest(next.active)) throw new Error(`human-authority-set-history-invalid:${next.reason ?? 'authority-set-target-digest-mismatch'}`);
    active = next.active;
  }
  return snapshot(input.network_id, input.revision, active);
}

export async function readHumanAuthoritySet(input: { stateStore: SqliteStateStore; network_id: string }): Promise<HumanAuthoritySetSnapshot> {
  const events = await input.stateStore.readEvents({ network_id: input.network_id, aggregate_type: HUMAN_AUTHORITY_SET_AGGREGATE_TYPE, aggregate_id: HUMAN_AUTHORITY_SET_AGGREGATE_ID });
  return replayHumanAuthoritySet({ network_id: input.network_id, revision: events.snapshot_revision, events: events.events as StateEvent[] });
}

export async function recordHumanAuthoritySetInitialization(input: { stateStore: SqliteStateStore; initialization: HumanAuthoritySetInitialization; now?: string }): Promise<{ status: 'recorded' | 'duplicate' | 'conflict' | 'blocked'; snapshot: HumanAuthoritySetSnapshot; reason?: string }> {
  const current = await readHumanAuthoritySet({ stateStore: input.stateStore, network_id: input.initialization.network_id });
  if (!validateInitialization(input.initialization)) return { status: 'blocked', snapshot: current, reason: 'authority-set-initialization-invalid' };
  const existingEvents = await input.stateStore.readEvents({ network_id: input.initialization.network_id, aggregate_type: HUMAN_AUTHORITY_SET_AGGREGATE_TYPE, aggregate_id: HUMAN_AUTHORITY_SET_AGGREGATE_ID });
  const existing = existingEvents.events.find((event) => (event.payload as HumanAuthoritySetInitialization).mutation_id === input.initialization.mutation_id);
  if (existing) {
    const existingInitialization = existing.payload as HumanAuthoritySetInitialization;
    return existingInitialization.canonical_payload_digest === input.initialization.canonical_payload_digest ? { status: 'duplicate', snapshot: current } : { status: 'conflict', snapshot: current, reason: 'authority-set-mutation-id-conflict' };
  }
  if (current.active.length > 0) return { status: 'conflict', snapshot: current, reason: 'authority-set-already-initialized' };
  if (input.initialization.expected_revision !== current.revision) return { status: 'conflict', snapshot: current, reason: 'revision-mismatch' };
  const append = await input.stateStore.appendEvent({ network_id: input.initialization.network_id, expected_revision: input.initialization.expected_revision, event: { event_id: `human-authority-set:${input.initialization.mutation_id}`, aggregate_type: HUMAN_AUTHORITY_SET_AGGREGATE_TYPE, aggregate_id: HUMAN_AUTHORITY_SET_AGGREGATE_ID, event_type: HUMAN_AUTHORITY_SET_EVENT_TYPE, occurred_at: input.initialization.occurred_at, payload: input.initialization }, now: input.now });
  if (append.status === 'duplicate') return { status: 'duplicate', snapshot: snapshot(input.initialization.network_id, append.revision as number, [input.initialization.owner]) };
  if (append.status === 'conflict') return { status: 'conflict', snapshot: current, reason: append.reason };
  return { status: 'recorded', snapshot: snapshot(input.initialization.network_id, append.revision as number, [input.initialization.owner]) };
}

export async function recordHumanAuthoritySetMutation(input: { stateStore: SqliteStateStore; mutation: HumanAuthoritySetMutation; expected_revision: number; now?: string }): Promise<{ status: 'recorded' | 'duplicate' | 'conflict' | 'blocked'; snapshot: HumanAuthoritySetSnapshot; reason?: string }> {
  const current = await readHumanAuthoritySet({ stateStore: input.stateStore, network_id: input.mutation.network_id });
  const existingEvents = await input.stateStore.readEvents({ network_id: input.mutation.network_id, aggregate_type: HUMAN_AUTHORITY_SET_AGGREGATE_TYPE, aggregate_id: HUMAN_AUTHORITY_SET_AGGREGATE_ID });
  const existing = existingEvents.events.find((event) => (event.payload as AuthorityEvent).mutation_id === input.mutation.mutation_id);
  if (existing) {
    const previous = existing.payload as AuthorityEvent;
    return previous.canonical_payload_digest === input.mutation.canonical_payload_digest ? { status: 'duplicate', snapshot: current } : { status: 'conflict', snapshot: current, reason: 'authority-set-mutation-id-conflict' };
  }
  const signer = current.active.find((identity) => identity.public_key_fingerprint === input.mutation.signer_fingerprint && identity.human_id === input.mutation.human_id);
  if (!signer) return { status: 'blocked', snapshot: current, reason: 'human-identity-mismatch' };
  const validation = validateMutation(input.mutation, signer);
  if (validation.status === 'blocked') return { status: 'blocked', snapshot: current, reason: validation.reason };
  if (input.mutation.expected_revision !== input.expected_revision || current.revision !== input.expected_revision) return { status: 'conflict', snapshot: current, reason: 'revision-mismatch' };
  if (input.mutation.previous_authority_set_digest !== current.digest) return { status: 'blocked', snapshot: current, reason: 'authority-set-digest-mismatch' };
  const next = nextAuthorities(current.active, input.mutation);
  if (next.status === 'blocked') return { status: 'blocked', snapshot: current, reason: next.reason };
  if (input.mutation.target_authority_set_digest !== humanAuthoritySetDigest(next.active)) return { status: 'blocked', snapshot: current, reason: 'authority-set-target-digest-mismatch' };
  const append = await input.stateStore.appendEvent({ network_id: input.mutation.network_id, expected_revision: input.expected_revision, event: { event_id: `human-authority-set:${input.mutation.mutation_id}`, aggregate_type: HUMAN_AUTHORITY_SET_AGGREGATE_TYPE, aggregate_id: HUMAN_AUTHORITY_SET_AGGREGATE_ID, event_type: HUMAN_AUTHORITY_SET_MUTATION_EVENT_TYPE, occurred_at: input.mutation.occurred_at, payload: input.mutation }, now: input.now });
  if (append.status === 'duplicate') return { status: 'duplicate', snapshot: snapshot(input.mutation.network_id, append.revision as number, next.active) };
  if (append.status === 'conflict') return { status: 'conflict', snapshot: current, reason: append.reason };
  return { status: 'recorded', snapshot: snapshot(input.mutation.network_id, append.revision as number, next.active) };
}
