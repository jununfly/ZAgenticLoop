import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
import type { SqliteStateStore, StateEvent } from './sqlite-state-store.js';
import { applyTrustedRunnerRegistryMutation, type TrustedRunnerRegistryEntry, type TrustedRunnerRegistryMutation } from './trusted-runner-registry.js';
import { readHumanAuthoritySet } from './human-authority-set-store.js';
import type { HumanSignerIdentity } from './human-signer.js';

export const TRUSTED_RUNNER_REGISTRY_AGGREGATE_TYPE = 'trusted-runner-registry' as const;
export const TRUSTED_RUNNER_REGISTRY_AGGREGATE_ID = 'network' as const;
export const TRUSTED_RUNNER_REGISTRY_EVENT_TYPE = 'trusted-runner-registry.mutation' as const;

export type TrustedRunnerRegistrySnapshot = { network_id: string; revision: number; digest: string; registry: TrustedRunnerRegistryEntry[] };
export type TrustedRunnerRegistryRead = { snapshot: TrustedRunnerRegistrySnapshot; history: TrustedRunnerRegistryMutation[] };
export type TrustedRunnerRegistryRecordResult = TrustedRunnerRegistryRead & { status: 'recorded' | 'duplicate' | 'conflict' | 'blocked'; revision?: number; reason?: string };

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

function project(input: { network_id: string; revision: number; events: StateEvent[]; identity: HumanSignerIdentity }): TrustedRunnerRegistryRead {
  let registry: TrustedRunnerRegistryEntry[] = [];
  const history: TrustedRunnerRegistryMutation[] = [];
  for (const event of input.events) {
    const mutation = event.payload as TrustedRunnerRegistryMutation;
    const result = applyTrustedRunnerRegistryMutation({ registry, history, mutation, identity: input.identity });
    if (result.status === 'blocked') throw new Error(`trusted-runner-registry-history-invalid:${result.reason ?? 'mutation-invalid'}`);
    registry = result.registry;
    if (result.status === 'recorded') history.push(mutation);
  }
  return { snapshot: { network_id: input.network_id, revision: input.revision, digest: trustedRunnerRegistrySnapshotDigest(registry), registry }, history };
}

export async function readTrustedRunnerRegistry(input: { stateStore: SqliteStateStore; network_id: string }): Promise<TrustedRunnerRegistryRead> {
  const authority = await readHumanAuthoritySet({ stateStore: input.stateStore, network_id: input.network_id });
  const identity = authority.active[0];
  if (!identity) throw new Error('human-authority-set-not-initialized');
  const events = await input.stateStore.readEvents({ network_id: input.network_id, aggregate_type: TRUSTED_RUNNER_REGISTRY_AGGREGATE_TYPE, aggregate_id: TRUSTED_RUNNER_REGISTRY_AGGREGATE_ID });
  return project({ network_id: input.network_id, revision: events.snapshot_revision, events: events.events, identity });
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
  const identity = authority.active[0];
  if (!identity) {
    const current = await emptyRegistryRead(input.stateStore, input.mutation.network_id);
    return { ...current, status: 'blocked', reason: 'human-authority-set-not-initialized' };
  }
  const current = await readTrustedRunnerRegistry({ stateStore: input.stateStore, network_id: input.mutation.network_id });
  const previous = current.history.find((item) => item.mutation_id === input.mutation.mutation_id);
  if (previous && previous.canonical_payload_digest === input.mutation.canonical_payload_digest) return { ...current, status: 'duplicate', revision: current.snapshot.revision };
  if (previous) return { ...current, status: 'conflict', reason: 'registry-mutation-id-conflict' };
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
