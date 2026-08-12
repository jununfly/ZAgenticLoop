import { createHash } from 'node:crypto';
import type { SqliteStateStore, StateEvent } from './sqlite-state-store.js';
import type { TransportEnvelope } from './transport-contract.js';
import { validateTransportEnvelope } from './transport-contract.js';

export const OPN_OUTBOUND_TASK_APPROVAL_SCHEMA = 'zj-loop.opn_outbound_task_approval.v1' as const;
export const OPN_OUTBOUND_TASK_APPROVAL_AGGREGATE = 'opn-outbound-task-approval' as const;

export type OutboundTaskApproval = {
  schema: typeof OPN_OUTBOUND_TASK_APPROVAL_SCHEMA;
  approval_id: string;
  network_id: string;
  envelope: TransportEnvelope;
  envelope_digest: string;
  task_artifact_id?: string;
  requested_at: string;
  expires_at: string;
  status: 'pending' | 'approved' | 'rejected' | 'published' | 'expired';
  human_id?: string;
  human_note?: string;
  decided_at?: string;
  published_at?: string;
  published_message_id?: string;
};

type ApprovalPayload = { schema: typeof OPN_OUTBOUND_TASK_APPROVAL_SCHEMA; approval: OutboundTaskApproval };

function eventId(approvalId: string, eventType: string): string { return `${eventType}:${approvalId}`; }
function payloadOf(event: StateEvent): ApprovalPayload | null {
  const value = event.payload as Partial<ApprovalPayload>;
  return value.schema === OPN_OUTBOUND_TASK_APPROVAL_SCHEMA && value.approval ? value as ApprovalPayload : null;
}

function currentStatus(events: StateEvent[]): OutboundTaskApproval | null {
  let current: OutboundTaskApproval | null = null;
  for (const event of events) {
    const payload = payloadOf(event);
    if (payload) current = { ...payload.approval };
  }
  return current;
}

export function outboundTaskApprovalDigest(envelope: TransportEnvelope): string {
  return `sha256:${createHash('sha256').update(JSON.stringify({ message_id: envelope.message_id, envelope_digest: envelope.envelope_digest, network_id: envelope.network_id, target_node_id: envelope.target_node_id, task_id: envelope.task_id, notification_kind: envelope.notification_kind, artifact_refs: envelope.artifact_refs })).digest('hex')}`;
}

export function createOutboundTaskApproval(input: { network_id: string; envelope: TransportEnvelope; approval_id?: string; task_artifact_id?: string; requested_at?: string; expires_at?: string }): OutboundTaskApproval {
  if (validateTransportEnvelope(input.envelope).status !== 'valid') throw new Error('outbound-task-envelope-invalid');
  if (input.envelope.network_id !== input.network_id || input.envelope.notification_kind !== 'agent.task') throw new Error('outbound-task-envelope-scope-invalid');
  const requestedAt = input.requested_at ?? new Date().toISOString();
  const expiresAt = input.expires_at ?? input.envelope.expires_at;
  return { schema: OPN_OUTBOUND_TASK_APPROVAL_SCHEMA, approval_id: input.approval_id ?? `outbound-task-approval:${input.envelope.message_id}`, network_id: input.network_id, envelope: input.envelope, envelope_digest: input.envelope.envelope_digest, ...(input.task_artifact_id ? { task_artifact_id: input.task_artifact_id } : {}), requested_at: requestedAt, expires_at: expiresAt, status: 'pending' };
}

export async function listOutboundTaskApprovals(input: { stateStore: Pick<SqliteStateStore, 'readEvents'>; network_id: string }): Promise<OutboundTaskApproval[]> {
  const events = (await input.stateStore.readEvents({ network_id: input.network_id, aggregate_type: OPN_OUTBOUND_TASK_APPROVAL_AGGREGATE })).events;
  const grouped = new Map<string, StateEvent[]>();
  for (const event of events) grouped.set(event.aggregate_id, [...(grouped.get(event.aggregate_id) ?? []), event]);
  return [...grouped.values()].map(currentStatus).filter((value): value is OutboundTaskApproval => value !== null).map((value) => value.status === 'pending' && Date.parse(value.expires_at) <= Date.now() ? { ...value, status: 'expired' } : value);
}

export async function recordOutboundTaskApproval(input: { stateStore: SqliteStateStore; approval: OutboundTaskApproval; expected_revision?: number; now?: string }): Promise<{ status: 'recorded' | 'duplicate' | 'conflict'; approval: OutboundTaskApproval }> {
  const current = (await listOutboundTaskApprovals({ stateStore: input.stateStore, network_id: input.approval.network_id })).find((value) => value.approval_id === input.approval.approval_id);
  if (current) {
    if (current.envelope_digest !== input.approval.envelope_digest) throw new Error('outbound-task-approval-id-conflict');
    return { status: 'duplicate', approval: current };
  }
  const now = input.now ?? new Date().toISOString();
  const revision = input.expected_revision ?? await input.stateStore.getRevision(input.approval.network_id);
  const result = await input.stateStore.appendEvent({ network_id: input.approval.network_id, expected_revision: revision, now, event: { event_id: eventId(input.approval.approval_id, 'requested'), aggregate_type: OPN_OUTBOUND_TASK_APPROVAL_AGGREGATE, aggregate_id: input.approval.approval_id, event_type: 'opn.outbound.task.approval.requested', occurred_at: now, payload: { schema: OPN_OUTBOUND_TASK_APPROVAL_SCHEMA, approval: input.approval } satisfies ApprovalPayload } });
  if (result.status !== 'recorded') return { status: result.status, approval: input.approval };
  return { status: 'recorded', approval: input.approval };
}

export async function appendOutboundTaskApprovalDecision(input: { stateStore: SqliteStateStore; approval: OutboundTaskApproval; decision: 'approved' | 'rejected'; human_id: string; human_note: string; decided_at?: string }): Promise<{ status: 'recorded' | 'duplicate' | 'conflict'; approval: OutboundTaskApproval }> {
  const now = input.decided_at ?? new Date().toISOString();
  const existing = (await listOutboundTaskApprovals({ stateStore: input.stateStore, network_id: input.approval.network_id })).find((value) => value.approval_id === input.approval.approval_id);
  if (!existing || existing.envelope_digest !== input.approval.envelope_digest) throw new Error('outbound-task-approval-not-found');
  if (existing.status === input.decision || existing.status === 'published') return { status: 'duplicate', approval: existing };
  if (existing.status !== 'pending') throw new Error('outbound-task-approval-state-conflict');
  const approval = { ...existing, status: input.decision, human_id: input.human_id, human_note: input.human_note, decided_at: now } satisfies OutboundTaskApproval;
  const revision = await input.stateStore.getRevision(input.approval.network_id);
  const result = await input.stateStore.appendEvent({ network_id: input.approval.network_id, expected_revision: revision, now, event: { event_id: eventId(existing.approval_id, input.decision), aggregate_type: OPN_OUTBOUND_TASK_APPROVAL_AGGREGATE, aggregate_id: existing.approval_id, event_type: `opn.outbound.task.approval.${input.decision}`, occurred_at: now, payload: { schema: OPN_OUTBOUND_TASK_APPROVAL_SCHEMA, approval } satisfies ApprovalPayload } });
  return { status: result.status, approval };
}

export async function appendOutboundTaskPublished(input: { stateStore: SqliteStateStore; approval: OutboundTaskApproval; message_id: string; published_at?: string }): Promise<{ status: 'recorded' | 'duplicate' | 'conflict'; approval: OutboundTaskApproval }> {
  const now = input.published_at ?? new Date().toISOString();
  const existing = (await listOutboundTaskApprovals({ stateStore: input.stateStore, network_id: input.approval.network_id })).find((value) => value.approval_id === input.approval.approval_id);
  if (!existing || existing.envelope_digest !== input.approval.envelope_digest) throw new Error('outbound-task-approval-not-found');
  if (existing.status === 'published') return { status: 'duplicate', approval: existing };
  if (existing.status !== 'approved') throw new Error('outbound-task-approval-not-approved');
  const approval = { ...existing, status: 'published', published_at: now, published_message_id: input.message_id } satisfies OutboundTaskApproval;
  const revision = await input.stateStore.getRevision(input.approval.network_id);
  const result = await input.stateStore.appendEvent({ network_id: input.approval.network_id, expected_revision: revision, now, event: { event_id: eventId(existing.approval_id, 'published'), aggregate_type: OPN_OUTBOUND_TASK_APPROVAL_AGGREGATE, aggregate_id: existing.approval_id, event_type: 'opn.outbound.task.approval.published', occurred_at: now, payload: { schema: OPN_OUTBOUND_TASK_APPROVAL_SCHEMA, approval } satisfies ApprovalPayload } });
  return { status: result.status, approval };
}
