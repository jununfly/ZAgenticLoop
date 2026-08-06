import { validateProviderRuntimeArtifactApproval, type ProviderRuntimeArtifactApproval } from './provider-runtime-artifact-approval.js';
import type { ProviderRuntimeArtifactManifest } from './provider-runtime-artifact-manifest.js';
import { readHumanAuthoritySet } from './human-authority-set-store.js';
import type { HumanSignerIdentity } from './human-signer.js';
import type { SqliteStateStore, StateEvent } from './sqlite-state-store.js';

export const PROVIDER_RUNTIME_ARTIFACT_APPROVAL_RECORDED_SCHEMA = 'zj-loop.provider_runtime_artifact_approval_recorded.v1' as const;
export const PROVIDER_RUNTIME_ARTIFACT_APPROVAL_AGGREGATE_TYPE = 'provider-runtime-artifact-approval' as const;
export const PROVIDER_RUNTIME_ARTIFACT_APPROVAL_EVENT_TYPE = 'provider-runtime-artifact.approved' as const;

type Expected = { network_id: string; node_id: string; device_id: string; manifest: Pick<ProviderRuntimeArtifactManifest, 'artifact_id' | 'manifest_digest' | 'profile' | 'platform'> };

export type ProviderRuntimeArtifactApprovalFactResult = {
  schema: typeof PROVIDER_RUNTIME_ARTIFACT_APPROVAL_RECORDED_SCHEMA;
  status: 'recorded' | 'duplicate' | 'conflict' | 'blocked';
  approval_id: string;
  side_effects_executed: false;
  revision?: number;
  current_revision?: number;
  reason?: string;
};

export type ProviderRuntimeArtifactApprovalReadResult = {
  status: 'valid';
  approval: ProviderRuntimeArtifactApproval;
  state_revision: number;
} | {
  status: 'blocked';
  reason: string;
  state_revision?: number;
};

function identityEqual(left: HumanSignerIdentity, right: HumanSignerIdentity): boolean {
  return left.human_id === right.human_id && left.public_key_fingerprint === right.public_key_fingerprint && left.public_key_pem === right.public_key_pem && left.algorithm === right.algorithm && left.schema === right.schema;
}

function approvalFromEvent(event: StateEvent): ProviderRuntimeArtifactApproval {
  const payload = event.payload as { approval?: unknown };
  return payload.approval as ProviderRuntimeArtifactApproval;
}

async function authorityForApproval(stateStore: SqliteStateStore, approval: ProviderRuntimeArtifactApproval): Promise<{ status: 'valid'; identity: HumanSignerIdentity } | { status: 'blocked'; reason: 'human-identity-mismatch' | 'human-authority-set-not-initialized' }> {
  let authority;
  try { authority = await readHumanAuthoritySet({ stateStore, network_id: approval.network_id }); } catch (error) {
    if (error instanceof Error && error.message === 'network-not-found') throw error;
    return { status: 'blocked', reason: 'human-authority-set-not-initialized' };
  }
  const identity = authority.active.find((candidate) => candidate.human_id === approval.human_id && candidate.public_key_fingerprint === approval.signer_fingerprint);
  return identity ? { status: 'valid', identity } : { status: 'blocked', reason: 'human-identity-mismatch' };
}

export async function recordProviderRuntimeArtifactApproval(input: { stateStore: SqliteStateStore; approval: ProviderRuntimeArtifactApproval; expected_revision: number; now?: string }): Promise<ProviderRuntimeArtifactApprovalFactResult> {
  const approval = input.approval;
  const base = { schema: PROVIDER_RUNTIME_ARTIFACT_APPROVAL_RECORDED_SCHEMA, approval_id: approval.approval_id, side_effects_executed: false as const };
  if (!Number.isInteger(input.expected_revision) || input.expected_revision < 1) return { ...base, status: 'blocked', reason: 'artifact-approval-state-revision-invalid' };
  const authority = await authorityForApproval(input.stateStore, approval);
  if (authority.status === 'blocked') return { ...base, status: 'blocked', reason: authority.reason };
  const expected: Expected = { network_id: approval.network_id, node_id: approval.node_id, device_id: approval.device_id, manifest: { artifact_id: approval.artifact_id, manifest_digest: approval.manifest_digest, profile: approval.artifact_profile, platform: approval.platform } };
  const validation = validateProviderRuntimeArtifactApproval({ approval, identity: authority.identity, expected });
  if (validation.status === 'blocked') return { ...base, status: 'blocked', reason: validation.reason };
  const result = await input.stateStore.runAtomic((transaction) => {
    const existing = transaction.database.prepare(`SELECT revision, event_id, payload_json FROM state_events WHERE network_id = ? AND aggregate_type = ? AND aggregate_id = ? AND event_type = ? ORDER BY revision LIMIT 1`).get(approval.network_id, PROVIDER_RUNTIME_ARTIFACT_APPROVAL_AGGREGATE_TYPE, approval.approval_id, PROVIDER_RUNTIME_ARTIFACT_APPROVAL_EVENT_TYPE) as { revision: number; event_id: string; payload_json: string } | undefined;
    const event_id = `provider-runtime-artifact-approval:${approval.approval_id}`;
    if (existing) {
      const payload = JSON.parse(existing.payload_json) as { approval?: ProviderRuntimeArtifactApproval };
      return payload.approval?.canonical_payload_digest === approval.canonical_payload_digest
        ? { status: 'duplicate' as const, revision: existing.revision, current_revision: input.expected_revision }
        : { status: 'conflict' as const, current_revision: input.expected_revision, reason: 'artifact-approval-id-conflict' };
    }
    const append = transaction.appendEvent({ network_id: approval.network_id, expected_revision: input.expected_revision, now: input.now, event: { event_id, aggregate_type: PROVIDER_RUNTIME_ARTIFACT_APPROVAL_AGGREGATE_TYPE, aggregate_id: approval.approval_id, event_type: PROVIDER_RUNTIME_ARTIFACT_APPROVAL_EVENT_TYPE, occurred_at: approval.issued_at, payload: { schema: PROVIDER_RUNTIME_ARTIFACT_APPROVAL_RECORDED_SCHEMA, approval } } });
    return append.status === 'recorded' ? { status: 'recorded' as const, revision: append.revision, current_revision: append.current_revision } : { status: append.status === 'duplicate' ? 'duplicate' as const : 'conflict' as const, revision: append.revision, current_revision: append.current_revision, reason: append.reason };
  });
  return { ...base, ...result };
}

export async function readProviderRuntimeArtifactApproval(input: { stateStore: SqliteStateStore; expected: Expected; now?: string }): Promise<ProviderRuntimeArtifactApprovalReadResult> {
  let authority;
  try { authority = await readHumanAuthoritySet({ stateStore: input.stateStore, network_id: input.expected.network_id }); } catch (error) {
    if (error instanceof Error && error.message === 'network-not-found') throw error;
    return { status: 'blocked', reason: 'human-authority-set-not-initialized' };
  }
  const events = await input.stateStore.readEvents({ network_id: input.expected.network_id, aggregate_type: PROVIDER_RUNTIME_ARTIFACT_APPROVAL_AGGREGATE_TYPE });
  const candidates = events.events.filter((event) => event.event_type === PROVIDER_RUNTIME_ARTIFACT_APPROVAL_EVENT_TYPE).sort((left, right) => right.revision - left.revision);
  if (candidates.length === 0) return { status: 'blocked', reason: 'artifact-approval-missing', state_revision: events.snapshot_revision };
  const matching = candidates.filter((event) => {
    const value = approvalFromEvent(event);
    return value.network_id === input.expected.network_id && value.node_id === input.expected.node_id && value.device_id === input.expected.device_id && value.artifact_id === input.expected.manifest.artifact_id && value.manifest_digest === input.expected.manifest.manifest_digest;
  });
  if (matching.length === 0) return { status: 'blocked', reason: 'artifact-approval-context-mismatch', state_revision: events.snapshot_revision };
  const approval = approvalFromEvent(matching[0]);
  const identity = authority.active.find((candidate) => candidate.human_id === approval.human_id && candidate.public_key_fingerprint === approval.signer_fingerprint);
  if (!identity) return { status: 'blocked', reason: 'artifact-approval-revoked', state_revision: events.snapshot_revision };
  const result = validateProviderRuntimeArtifactApproval({ approval, identity, expected: input.expected, now: input.now });
  if (result.status === 'blocked') return { status: 'blocked', reason: result.reason, state_revision: events.snapshot_revision };
  return { status: 'valid', approval: result.approval, state_revision: events.snapshot_revision };
}
