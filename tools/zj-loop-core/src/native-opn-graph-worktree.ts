import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
import { createBoundedReconciliationPlan, type BoundedReconciliationPlan } from './bounded-reconciliation.js';
import { verifyHumanSignature, type HumanSigner, type HumanSignerIdentity, type HumanSignature } from './human-signer.js';
import type { SqliteStateStore, StateEventInput } from './sqlite-state-store.js';
import type { RealAgentDogfoodWorktreeResult } from './real-agent-dogfood-worktree.js';

export const NATIVE_OPN_GRAPH_TARGET_WORKTREE_SCHEMA = 'zj-loop.native_opn_graph_target_worktree.v1' as const;
export const NATIVE_OPN_GRAPH_TARGET_WORKTREE_CLEANUP_SCHEMA = 'zj-loop.native_opn_graph_target_worktree_cleanup.v1' as const;
export const NATIVE_OPN_GRAPH_TARGET_WORKTREE_MANUAL_CLEANUP_SCHEMA = 'zj-loop.native_opn_graph_target_worktree_manual_cleanup.v1' as const;
export const NATIVE_OPN_GRAPH_TARGET_WORKTREE_PROJECTION_EVENT_SCHEMA = 'zj-loop.native_opn_graph_target_worktree_projection_event.v1' as const;

export type NativeOpnGraphTargetWorktreeBinding = {
  schema: typeof NATIVE_OPN_GRAPH_TARGET_WORKTREE_SCHEMA;
  network_id: string;
  graph_id: string;
  execution_id: string;
  target_worktree_ref: string;
  worktree_path: string;
  branch: string;
  base_commit: string;
  preparation_status: 'prepared' | 'reused';
  cleanup_status: 'pending';
  binding_digest: string;
  side_effects_executed: false;
};

export type NativeOpnGraphTargetWorktreeCleanupEvidence = {
  schema: typeof NATIVE_OPN_GRAPH_TARGET_WORKTREE_CLEANUP_SCHEMA;
  network_id: string;
  graph_id: string;
  execution_id: string;
  target_worktree_ref: string;
  worktree_path: string;
  status: 'closed' | 'outcome-uncertain' | 'cleanup-unresolved';
  reason: string;
  observed_at: string;
  source: 'real-agent-dogfood-closeout';
  source_event_id: string;
  evidence_digest: string;
  side_effects_executed: false;
};

export type NativeOpnGraphTargetWorktreeManualCleanupEvidence = {
  schema: typeof NATIVE_OPN_GRAPH_TARGET_WORKTREE_MANUAL_CLEANUP_SCHEMA;
  network_id: string;
  graph_id: string;
  execution_id: string;
  target_worktree_ref: string;
  worktree_path: string;
  source_event_id: string;
  observed_absent: true;
  human_id: string;
  signer_fingerprint: string;
  cleaned_at: string;
  reason: string;
  canonical_payload_digest: string;
  signature: HumanSignature;
  side_effects_executed: false;
};

export type NativeOpnGraphTargetWorktreeProjectionResult = {
  schema: typeof NATIVE_OPN_GRAPH_TARGET_WORKTREE_PROJECTION_EVENT_SCHEMA;
  status: 'recorded' | 'duplicate' | 'conflict';
  event_id: string;
  side_effects_executed: false;
  revision?: number;
  current_revision?: number;
  reason?: string;
};

function text(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0; }
function safeId(value: unknown): value is string { return text(value) && /^[A-Za-z0-9_-]{1,256}$/.test(value); }
function commit(value: unknown): value is string { return typeof value === 'string' && /^[0-9a-f]{40}$/i.test(value); }
function canonical(value: unknown): string { const json = canonicalize(value); if (typeof json !== 'string') throw new Error('native-opn-graph-worktree-canonicalization-invalid'); return json; }
function digest(value: unknown): string { return `sha256:${createHash('sha256').update(canonical(value), 'utf8').digest('hex')}`; }
function payloadBytes(value: unknown): Uint8Array { return new TextEncoder().encode(canonical(value)); }

function unsignedBinding(value: NativeOpnGraphTargetWorktreeBinding): Omit<NativeOpnGraphTargetWorktreeBinding, 'binding_digest'> {
  const { binding_digest: _, ...unsigned } = value;
  return unsigned;
}

export function createNativeOpnGraphTargetWorktreeBinding(input: { network_id: string; graph_id: string; prepared: RealAgentDogfoodWorktreeResult }): NativeOpnGraphTargetWorktreeBinding {
  if (!text(input.network_id) || !safeId(input.graph_id) || input.prepared.status === 'blocked' || !safeId(input.prepared.execution_id) || !text(input.prepared.worktree_path) || !text(input.prepared.branch) || !commit(input.prepared.base_commit)) throw new Error('native-opn-graph-worktree-binding-invalid');
  const value: NativeOpnGraphTargetWorktreeBinding = {
    schema: NATIVE_OPN_GRAPH_TARGET_WORKTREE_SCHEMA,
    network_id: input.network_id,
    graph_id: input.graph_id,
    execution_id: input.prepared.execution_id,
    target_worktree_ref: `worktree:graph-target:${input.graph_id}:${input.prepared.execution_id}`,
    worktree_path: input.prepared.worktree_path,
    branch: input.prepared.branch,
    base_commit: input.prepared.base_commit,
    preparation_status: input.prepared.status,
    cleanup_status: 'pending',
    binding_digest: '',
    side_effects_executed: false,
  };
  value.binding_digest = digest(unsignedBinding(value));
  return value;
}

export function nativeOpnGraphTargetWorktreeBindingDigest(value: NativeOpnGraphTargetWorktreeBinding): string { return digest(unsignedBinding(value)); }

export function createNativeOpnGraphTargetWorktreeCleanupEvidence(input: { binding: NativeOpnGraphTargetWorktreeBinding; status: 'closed' | 'outcome-uncertain' | 'cleanup-unresolved'; worktree_path: string; reason: string; observed_at: string; source_event_id: string }): NativeOpnGraphTargetWorktreeCleanupEvidence {
  if (nativeOpnGraphTargetWorktreeBindingDigest(input.binding) !== input.binding.binding_digest || !text(input.worktree_path) || input.worktree_path !== input.binding.worktree_path || !text(input.reason) || !Number.isFinite(Date.parse(input.observed_at)) || !text(input.source_event_id)) throw new Error('native-opn-graph-worktree-cleanup-evidence-invalid');
  const value = {
    schema: NATIVE_OPN_GRAPH_TARGET_WORKTREE_CLEANUP_SCHEMA,
    network_id: input.binding.network_id,
    graph_id: input.binding.graph_id,
    execution_id: input.binding.execution_id,
    target_worktree_ref: input.binding.target_worktree_ref,
    worktree_path: input.worktree_path,
    status: input.status,
    reason: input.reason,
    observed_at: input.observed_at,
    source: 'real-agent-dogfood-closeout' as const,
    source_event_id: input.source_event_id,
    evidence_digest: '',
    side_effects_executed: false as const,
  };
  value.evidence_digest = digest({ ...value, evidence_digest: undefined });
  return value;
}

export function createNativeOpnGraphTargetWorktreeCleanupEvidenceFromDogfoodCloseout(input: { binding: NativeOpnGraphTargetWorktreeBinding; closeout_fact: { event_id: string; status: 'closed' | 'outcome-uncertain'; worktree_path: string; reason: string; occurred_at: string }; reconciliation_exhausted?: boolean }): NativeOpnGraphTargetWorktreeCleanupEvidence {
  const status = input.closeout_fact.status === 'closed' ? 'closed' : input.reconciliation_exhausted === true ? 'cleanup-unresolved' : 'outcome-uncertain';
  return createNativeOpnGraphTargetWorktreeCleanupEvidence({ binding: input.binding, status, worktree_path: input.closeout_fact.worktree_path, reason: input.closeout_fact.reason, observed_at: input.closeout_fact.occurred_at, source_event_id: input.closeout_fact.event_id });
}

export function createNativeOpnGraphTargetWorktreeCleanupReconciliationPlan(input: { binding: NativeOpnGraphTargetWorktreeBinding; attempt: number; outcome_digest: string; max_queries: number; deadline: string; observed_fact_digests: string[] }): BoundedReconciliationPlan {
  if (nativeOpnGraphTargetWorktreeBindingDigest(input.binding) !== input.binding.binding_digest) throw new Error('native-opn-graph-worktree-reconciliation-binding-invalid');
  return createBoundedReconciliationPlan({
    network_id: input.binding.network_id,
    execution_id: input.binding.execution_id,
    attempt: input.attempt,
    outcome_digest: input.outcome_digest,
    reason_code: 'outcome-uncertain',
    max_queries: input.max_queries,
    deadline: input.deadline,
    query_scope: [`worktree.registration.read:${input.binding.target_worktree_ref}`, `worktree.status.read:${input.binding.target_worktree_ref}`],
    observed_fact_digests: input.observed_fact_digests,
  });
}

type ManualCleanupPayload = Omit<NativeOpnGraphTargetWorktreeManualCleanupEvidence, 'canonical_payload_digest' | 'signature' | 'side_effects_executed'>;
function manualCleanupPayload(value: NativeOpnGraphTargetWorktreeManualCleanupEvidence): ManualCleanupPayload {
  const { canonical_payload_digest: _, signature: __, side_effects_executed: ___, ...payload } = value;
  return payload;
}

export async function createNativeOpnGraphTargetWorktreeManualCleanupEvidence(input: { signer: HumanSigner; binding: NativeOpnGraphTargetWorktreeBinding; source_event_id: string; worktree_path: string; reason: string; cleaned_at: string }): Promise<NativeOpnGraphTargetWorktreeManualCleanupEvidence> {
  if (nativeOpnGraphTargetWorktreeBindingDigest(input.binding) !== input.binding.binding_digest || !text(input.source_event_id) || !text(input.worktree_path) || input.worktree_path !== input.binding.worktree_path || !text(input.reason) || !Number.isFinite(Date.parse(input.cleaned_at))) throw new Error('native-opn-graph-worktree-manual-cleanup-input-invalid');
  const identity = await input.signer.getPublicIdentity();
  if (identity.schema !== 'zj-loop.human_signer.v1' || identity.algorithm !== 'ECDSA-P256' || !text(identity.human_id) || !/^[0-9a-f]{64}$/.test(identity.public_key_fingerprint)) throw new Error('native-opn-graph-worktree-manual-cleanup-identity-invalid');
  const payload: ManualCleanupPayload = { schema: NATIVE_OPN_GRAPH_TARGET_WORKTREE_MANUAL_CLEANUP_SCHEMA, network_id: input.binding.network_id, graph_id: input.binding.graph_id, execution_id: input.binding.execution_id, target_worktree_ref: input.binding.target_worktree_ref, worktree_path: input.worktree_path, source_event_id: input.source_event_id, observed_absent: true, human_id: identity.human_id, signer_fingerprint: identity.public_key_fingerprint, cleaned_at: input.cleaned_at, reason: input.reason };
  return { ...payload, canonical_payload_digest: digest(payload), signature: await input.signer.sign({ payload: payloadBytes(payload) }), side_effects_executed: false };
}

export function validateNativeOpnGraphTargetWorktreeManualCleanupEvidence(input: { evidence: NativeOpnGraphTargetWorktreeManualCleanupEvidence; binding: NativeOpnGraphTargetWorktreeBinding; identity: HumanSignerIdentity }): { status: 'valid' | 'blocked'; errors: string[] } {
  const value = input.evidence;
  const payload = manualCleanupPayload(value);
  const errors: string[] = [];
  if (value.schema !== NATIVE_OPN_GRAPH_TARGET_WORKTREE_MANUAL_CLEANUP_SCHEMA || value.observed_absent !== true || value.side_effects_executed !== false) errors.push('schema-or-observation-invalid');
  if (value.network_id !== input.binding.network_id || value.graph_id !== input.binding.graph_id || value.execution_id !== input.binding.execution_id || value.target_worktree_ref !== input.binding.target_worktree_ref || value.worktree_path !== input.binding.worktree_path || !text(value.source_event_id)) errors.push('worktree-binding-invalid');
  if (!text(value.human_id) || !/^[0-9a-f]{64}$/.test(value.signer_fingerprint) || !Number.isFinite(Date.parse(value.cleaned_at)) || !text(value.reason)) errors.push('manual-cleanup-fact-invalid');
  if (value.canonical_payload_digest !== digest(payload)) errors.push('canonical-payload-digest-invalid');
  if (input.identity.human_id !== value.human_id || input.identity.public_key_fingerprint !== value.signer_fingerprint || !value.signature || value.signature.public_key_fingerprint !== value.signer_fingerprint) errors.push('signature-binding-invalid');
  if (errors.length === 0 && !verifyHumanSignature({ identity: input.identity, payload: payloadBytes(payload), signature: value.signature })) errors.push('human-signature-invalid');
  return { status: errors.length === 0 ? 'valid' : 'blocked', errors };
}

export function evaluateNativeOpnGraphTargetWorktreeManualCleanupCloseout(input: { evidence: NativeOpnGraphTargetWorktreeManualCleanupEvidence; binding: NativeOpnGraphTargetWorktreeBinding; identity: HumanSignerIdentity; observed: { worktree_path_exists?: boolean; worktree_registered?: boolean } }): { status: 'closed' | 'blocked' | 'outcome-uncertain'; side_effects_executed: false; reason?: string } {
  const validation = validateNativeOpnGraphTargetWorktreeManualCleanupEvidence({ evidence: input.evidence, binding: input.binding, identity: input.identity });
  if (validation.status === 'blocked') return { status: 'blocked', side_effects_executed: false, reason: 'manual-cleanup-evidence-invalid' };
  if (input.observed.worktree_path_exists === undefined || input.observed.worktree_registered === undefined) return { status: 'outcome-uncertain', side_effects_executed: false, reason: 'manual-cleanup-observation-uncertain' };
  if (input.observed.worktree_path_exists || input.observed.worktree_registered) return { status: 'blocked', side_effects_executed: false, reason: 'worktree-still-present' };
  return { status: 'closed', side_effects_executed: false };
}

type GraphCleanupEvidence = NativeOpnGraphTargetWorktreeCleanupEvidence | NativeOpnGraphTargetWorktreeManualCleanupEvidence;
function graphCleanupEvidenceDigest(value: GraphCleanupEvidence): string { return 'evidence_digest' in value ? value.evidence_digest : value.canonical_payload_digest; }

export async function recordNativeOpnGraphTargetWorktreeProjection(input: { stateStore: SqliteStateStore; expected_revision: number; evidence: GraphCleanupEvidence; now: string }): Promise<NativeOpnGraphTargetWorktreeProjectionResult> {
  const evidenceDigest = graphCleanupEvidenceDigest(input.evidence);
  if (!/^sha256:[0-9a-f]{64}$/.test(evidenceDigest) || !text(input.evidence.network_id) || !text(input.evidence.execution_id) || !text(input.evidence.target_worktree_ref)) throw new Error('native-opn-graph-worktree-projection-invalid');
  const aggregateId = `${input.evidence.graph_id}:${input.evidence.execution_id}`;
  const eventId = `native-opn-graph-worktree-projection:${aggregateId}:${evidenceDigest}`;
  const event: StateEventInput = { event_id: eventId, aggregate_type: 'native-opn-graph-worktree-cleanup-projection', aggregate_id: aggregateId, event_type: 'native-opn-graph-worktree.cleanup.projected', occurred_at: input.now, payload: { schema: NATIVE_OPN_GRAPH_TARGET_WORKTREE_PROJECTION_EVENT_SCHEMA, source_event_id: input.evidence.source_event_id, evidence: input.evidence } };
  const existing = (await input.stateStore.readEvents({ network_id: input.evidence.network_id, aggregate_type: event.aggregate_type, aggregate_id: aggregateId })).events.find((candidate) => candidate.event_id === eventId);
  if (existing) return { schema: NATIVE_OPN_GRAPH_TARGET_WORKTREE_PROJECTION_EVENT_SCHEMA, status: canonical(existing.payload) === canonical(event.payload) ? 'duplicate' : 'conflict', event_id: eventId, side_effects_executed: false, current_revision: existing.revision, ...(canonical(existing.payload) === canonical(event.payload) ? {} : { reason: 'native-opn-graph-worktree-projection-conflict' }) };
  const appended = await input.stateStore.appendEvent({ network_id: input.evidence.network_id, expected_revision: input.expected_revision, now: input.now, event });
  if (appended.status === 'conflict' || appended.revision === undefined) return { schema: NATIVE_OPN_GRAPH_TARGET_WORKTREE_PROJECTION_EVENT_SCHEMA, status: 'conflict', event_id: eventId, side_effects_executed: false, current_revision: appended.current_revision, reason: appended.reason };
  return { schema: NATIVE_OPN_GRAPH_TARGET_WORKTREE_PROJECTION_EVENT_SCHEMA, status: 'recorded', event_id: eventId, side_effects_executed: false, revision: appended.revision, current_revision: appended.current_revision };
}
