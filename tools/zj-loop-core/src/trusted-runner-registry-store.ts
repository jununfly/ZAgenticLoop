import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
import type { SqliteStateStore, StateEvent } from './sqlite-state-store.js';
import { applyTrustedRunnerRegistryMutation, createTrustedRunnerRegistryMutation, trustedRunnerCapabilitiesDigest, validateTrustedRunnerCapabilities, type TrustedRunnerRegistryEntry, type TrustedRunnerRegistryMutation, type TrustedRunnerRegistryMutationAction } from './trusted-runner-registry.js';
import { readHumanAuthoritySet, replayHumanAuthoritySet } from './human-authority-set-store.js';
import type { HumanSignerIdentity } from './human-signer.js';

export const TRUSTED_RUNNER_REGISTRY_AGGREGATE_TYPE = 'trusted-runner-registry' as const;
export const TRUSTED_RUNNER_REGISTRY_AGGREGATE_ID = 'network' as const;
export const TRUSTED_RUNNER_REGISTRY_EVENT_TYPE = 'trusted-runner-registry.mutation' as const;

export type TrustedRunnerRegistrySnapshot = { network_id: string; revision: number; digest: string; registry: TrustedRunnerRegistryEntry[] };
export type TrustedRunnerRegistryRead = { snapshot: TrustedRunnerRegistrySnapshot; history: TrustedRunnerRegistryMutation[] };
export type TrustedRunnerRegistryRecordResult = TrustedRunnerRegistryRead & { status: 'recorded' | 'duplicate' | 'conflict' | 'blocked'; revision?: number; reason?: string };
export type TrustedRunnerRegistryMutationBuildResult = { status: 'ready'; mutation: TrustedRunnerRegistryMutation; snapshot: TrustedRunnerRegistrySnapshot } | { status: 'blocked' | 'conflict'; snapshot: TrustedRunnerRegistrySnapshot; reason: string };
export type TrustedRunnerExecutionAdmissionResult = { status: 'admitted'; binding: { runner_id: string; registry_revision: number; registry_snapshot_digest: string; capabilities: string[]; capabilities_digest: string } } | { status: 'blocked'; reason: string };

function canonicalDigest(value: unknown): string {
  const json = canonicalize(value);
  if (typeof json !== 'string') throw new Error('trusted-runner-registry-snapshot-canonicalization-invalid');
  return `sha256:${createHash('sha256').update(json, 'utf8').digest('hex')}`;
}

export function trustedRunnerRegistrySnapshotDigest(registry: TrustedRunnerRegistryEntry[]): string { return canonicalDigest(registry); }

async function emptyRegistryRead(stateStore: SqliteStateStore, network_id: string): Promise<TrustedRunnerRegistryRead> {
  const events = await stateStore.readEvents({ network_id, aggregate_type: TRUSTED_RUNNER_REGISTRY_AGGREGATE_TYPE, aggregate_id: TRUSTED_RUNNER_REGISTRY_AGGREGATE_ID });
  return { snapshot: { network_id, revision: events.snapshot_revision, digest: trustedRunnerRegistrySnapshotDigest([]), registry: [] }, history: [] };
}

export async function createTrustedRunnerRegistryMutationFromStore(input: { stateStore: SqliteStateStore; signer: Parameters<typeof createTrustedRunnerRegistryMutation>[0]['signer']; network_id: string; mutation_id: string; action: TrustedRunnerRegistryMutationAction; runner_id: string; new_public_key_fingerprint?: string; capabilities?: string[]; reason: string; occurred_at: string }): Promise<TrustedRunnerRegistryMutationBuildResult> {
  const authority = await readHumanAuthoritySet({ stateStore: input.stateStore, network_id: input.network_id });
  const current = authority.active.length === 0 ? await emptyRegistryRead(input.stateStore, input.network_id) : await readTrustedRunnerRegistry({ stateStore: input.stateStore, network_id: input.network_id });
  if (authority.active.length === 0) return { status: 'blocked', snapshot: current.snapshot, reason: 'human-authority-set-not-initialized' };
  const signerIdentity = await input.signer.getPublicIdentity();
  if (!authorityForMutation({ human_id: signerIdentity.human_id, signer_fingerprint: signerIdentity.public_key_fingerprint } as TrustedRunnerRegistryMutation, authority.active)) return { status: 'blocked', snapshot: current.snapshot, reason: 'human-identity-mismatch' };
  const entry = current.snapshot.registry.find((candidate) => candidate.runner_id === input.runner_id);
  if (input.action === 'register' && entry) return { status: 'blocked', snapshot: current.snapshot, reason: 'registry-runner-already-exists' };
  if (input.action !== 'register' && (!entry || entry.status !== 'active')) return { status: 'blocked', snapshot: current.snapshot, reason: 'registry-current-fingerprint-mismatch' };
  if (input.action === 'register' && !input.new_public_key_fingerprint) return { status: 'blocked', snapshot: current.snapshot, reason: 'registry-new-fingerprint-required' };
  if (input.action === 'rotate' && !input.new_public_key_fingerprint) return { status: 'blocked', snapshot: current.snapshot, reason: 'registry-new-fingerprint-required' };
  if (input.action === 'update-capabilities' && !input.capabilities) return { status: 'blocked', snapshot: current.snapshot, reason: 'registry-capabilities-required' };
  if (input.capabilities && validateTrustedRunnerCapabilities(input.capabilities).status === 'blocked') return { status: 'blocked', snapshot: current.snapshot, reason: 'registry-capability-unknown' };
  const mutation = await createTrustedRunnerRegistryMutation({ signer: input.signer, network_id: input.network_id, mutation_id: input.mutation_id, action: input.action, runner_id: input.runner_id, new_public_key_fingerprint: input.new_public_key_fingerprint, old_public_key_fingerprint: input.action === 'rotate' || input.action === 'revoke' ? entry?.public_key_fingerprint : undefined, old_capabilities_digest: input.action === 'update-capabilities' ? trustedRunnerCapabilitiesDigest(entry?.capabilities) : undefined, capabilities: input.capabilities, reason: input.reason, occurred_at: input.occurred_at, expected_revision: current.snapshot.revision });
  return { status: 'ready', snapshot: current.snapshot, mutation };
}

export function admitTrustedRunnerExecution(input: { snapshot: TrustedRunnerRegistrySnapshot; runner_id: string; required_capabilities: string[]; expected_registry_revision?: number; expected_registry_snapshot_digest?: string }): TrustedRunnerExecutionAdmissionResult {
  if (input.snapshot.digest !== trustedRunnerRegistrySnapshotDigest(input.snapshot.registry)) return { status: 'blocked', reason: 'registry-snapshot-drift' };
  if (input.expected_registry_revision !== undefined && input.snapshot.revision !== input.expected_registry_revision) return { status: 'blocked', reason: 'registry-revision-drift' };
  if (input.expected_registry_snapshot_digest !== undefined && input.snapshot.digest !== input.expected_registry_snapshot_digest) return { status: 'blocked', reason: 'registry-snapshot-drift' };
  if (validateTrustedRunnerCapabilities(input.required_capabilities).status === 'blocked') return { status: 'blocked', reason: 'registry-capability-unknown' };
  const runner = input.snapshot.registry.find((entry) => entry.runner_id === input.runner_id && entry.status === 'active');
  if (!runner) return { status: 'blocked', reason: 'registry-runner-not-active' };
  const capabilities = [...new Set(runner.capabilities ?? [])].sort();
  const missing = input.required_capabilities.some((capability) => !capabilities.includes(capability));
  if (missing) return { status: 'blocked', reason: 'registry-required-capability-missing' };
  return { status: 'admitted', binding: { runner_id: runner.runner_id, registry_revision: input.snapshot.revision, registry_snapshot_digest: input.snapshot.digest, capabilities, capabilities_digest: trustedRunnerCapabilitiesDigest(capabilities) } };
}

function authorityForMutation(mutation: TrustedRunnerRegistryMutation, authorities: HumanSignerIdentity[]): HumanSignerIdentity | undefined {
  return authorities.find((identity) => identity.human_id === mutation.human_id && identity.public_key_fingerprint === mutation.signer_fingerprint);
}

function project(input: { network_id: string; revision: number; events: StateEvent[] }): TrustedRunnerRegistryRead {
  let registry: TrustedRunnerRegistryEntry[] = [];
  const history: TrustedRunnerRegistryMutation[] = [];
  for (const event of input.events.filter((candidate) => candidate.aggregate_type === TRUSTED_RUNNER_REGISTRY_AGGREGATE_TYPE && candidate.aggregate_id === TRUSTED_RUNNER_REGISTRY_AGGREGATE_ID).sort((left, right) => left.revision - right.revision)) {
    const mutation = event.payload as TrustedRunnerRegistryMutation;
    const authorityEvents = input.events.filter((candidate) => candidate.aggregate_type === 'human-authority-set' && candidate.aggregate_id === 'network' && candidate.revision <= event.revision);
    const authority = replayHumanAuthoritySet({ network_id: input.network_id, revision: event.revision, events: authorityEvents });
    const identity = authorityForMutation(mutation, authority.active);
    if (!identity) throw new Error('trusted-runner-registry-history-signer-inactive');
    const result = applyTrustedRunnerRegistryMutation({ registry, history, mutation, identity });
    if (result.status === 'blocked') throw new Error(`trusted-runner-registry-history-invalid:${result.reason ?? 'mutation-invalid'}`);
    registry = result.registry;
    if (result.status === 'recorded') history.push(mutation);
  }
  return { snapshot: { network_id: input.network_id, revision: input.revision, digest: trustedRunnerRegistrySnapshotDigest(registry), registry }, history };
}

export async function readTrustedRunnerRegistry(input: { stateStore: SqliteStateStore; network_id: string }): Promise<TrustedRunnerRegistryRead> {
  const authority = await readHumanAuthoritySet({ stateStore: input.stateStore, network_id: input.network_id });
  if (authority.active.length === 0) throw new Error('human-authority-set-not-initialized');
  const events = await input.stateStore.readEvents({ network_id: input.network_id });
  return project({ network_id: input.network_id, revision: events.snapshot_revision, events: events.events });
}

export async function recordTrustedRunnerRegistryMutation(input: { stateStore: SqliteStateStore; mutation: TrustedRunnerRegistryMutation; expected_revision: number; now?: string }): Promise<TrustedRunnerRegistryRecordResult> {
  if (input.mutation.network_id === '') throw new Error('trusted-runner-registry-network-required');
  let authority;
  try {
    authority = await readHumanAuthoritySet({ stateStore: input.stateStore, network_id: input.mutation.network_id });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'human-authority-set-replay-failed';
    const current = await emptyRegistryRead(input.stateStore, input.mutation.network_id);
    return { ...current, status: 'blocked', reason };
  }
  if (authority.active.length === 0) {
    const current = await emptyRegistryRead(input.stateStore, input.mutation.network_id);
    return { ...current, status: 'blocked', reason: 'human-authority-set-not-initialized' };
  }
  const current = await readTrustedRunnerRegistry({ stateStore: input.stateStore, network_id: input.mutation.network_id });
  const previous = current.history.find((item) => item.mutation_id === input.mutation.mutation_id);
  if (previous && previous.canonical_payload_digest === input.mutation.canonical_payload_digest) return { ...current, status: 'duplicate', revision: current.snapshot.revision };
  if (previous) return { ...current, status: 'conflict', reason: 'registry-mutation-id-conflict' };
  const identity = authorityForMutation(input.mutation, authority.active);
  if (!identity) return { ...current, status: 'blocked', reason: 'human-identity-mismatch' };
  if (input.mutation.expected_revision !== input.expected_revision) return { ...current, status: 'conflict', reason: 'mutation-revision-mismatch' };
  if (current.snapshot.revision !== input.expected_revision) return { ...current, status: 'conflict', reason: 'revision-mismatch' };
  const applied = applyTrustedRunnerRegistryMutation({ registry: current.snapshot.registry, history: current.history, mutation: input.mutation, identity });
  if (applied.status === 'duplicate') return { ...current, status: 'duplicate', revision: current.snapshot.revision };
  if (applied.status === 'blocked') return { ...current, status: 'blocked', reason: applied.reason };
  const append = await input.stateStore.appendEvent({ network_id: input.mutation.network_id, expected_revision: input.expected_revision, event: { event_id: `trusted-runner-registry:${input.mutation.mutation_id}`, aggregate_type: TRUSTED_RUNNER_REGISTRY_AGGREGATE_TYPE, aggregate_id: TRUSTED_RUNNER_REGISTRY_AGGREGATE_ID, event_type: TRUSTED_RUNNER_REGISTRY_EVENT_TYPE, occurred_at: input.mutation.occurred_at, payload: input.mutation }, now: input.now });
  if (append.status === 'conflict') return { ...current, status: 'conflict', revision: append.current_revision, reason: append.reason };
  const snapshot = { network_id: input.mutation.network_id, revision: append.revision as number, digest: trustedRunnerRegistrySnapshotDigest(applied.registry), registry: applied.registry };
  return { snapshot, history: [...current.history, input.mutation], status: 'recorded', revision: append.revision };
}
