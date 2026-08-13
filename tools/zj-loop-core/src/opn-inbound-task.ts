import type { SqliteStateStore, StateEvent } from './sqlite-state-store.js';
import type { TransportEnvelope } from './transport-contract.js';
import { validateTransportEnvelope } from './transport-contract.js';

export const OPN_INBOUND_TASK_SCHEMA = 'zj-loop.opn_inbound_task.v1' as const;
export const OPN_INBOUND_TASK_AGGREGATE = 'opn-inbound-task' as const;
export const DEFAULT_INBOUND_PROCESSING_LEASE_MS = 15 * 60 * 1000;
export type InboundTaskStatus = 'pending-human-approval' | 'admitted' | 'processing' | 'completed' | 'failed' | 'blocked' | 'expired' | 'cancelled';
export type InboundTask = { schema: typeof OPN_INBOUND_TASK_SCHEMA; inbound_id: string; network_id: string; envelope: TransportEnvelope; status: InboundTaskStatus; received_at: string; human_note?: string; human_id?: string; decided_at?: string; selected_agent_id?: string; admission_reason?: string; processing_started_at?: string; processing_lease_expires_at?: string };
type Payload = { schema: typeof OPN_INBOUND_TASK_SCHEMA; inbound: InboundTask };

function payloadOf(event: StateEvent): Payload | null {
  const value = event.payload as Partial<Payload>;
  return value.schema === OPN_INBOUND_TASK_SCHEMA && value.inbound ? value as Payload : null;
}
function eventId(id: string, status: string): string { return `inbound-task:${id}:${status}`; }
function latest(events: StateEvent[]): InboundTask | null { let result: InboundTask | null = null; for (const event of events) { const value = payloadOf(event); if (value) result = { ...value.inbound }; } return result; }

export function createInboundTask(input: { network_id: string; envelope: TransportEnvelope; received_at?: string }): InboundTask {
  if (validateTransportEnvelope(input.envelope).status !== 'valid') throw new Error('inbound-task-envelope-invalid');
  if (input.envelope.network_id !== input.network_id || input.envelope.notification_kind !== 'agent.task') throw new Error('inbound-task-envelope-scope-invalid');
  return { schema: OPN_INBOUND_TASK_SCHEMA, inbound_id: `inbound-task:${input.envelope.message_id}`, network_id: input.network_id, envelope: input.envelope, status: 'pending-human-approval', received_at: input.received_at ?? new Date().toISOString() };
}

export async function listInboundTasks(input: { stateStore: Pick<SqliteStateStore, 'readEvents'>; network_id: string; now?: string }): Promise<InboundTask[]> {
  const events = (await input.stateStore.readEvents({ network_id: input.network_id, aggregate_type: OPN_INBOUND_TASK_AGGREGATE })).events;
  const grouped = new Map<string, StateEvent[]>();
  for (const event of events) grouped.set(event.aggregate_id, [...(grouped.get(event.aggregate_id) ?? []), event]);
  const now = Date.parse(input.now ?? new Date().toISOString());
  return [...grouped.values()].map(latest).filter((item): item is InboundTask => item !== null).map((item) => item.status === 'pending-human-approval' && Date.parse(item.envelope.expires_at) <= now ? { ...item, status: 'expired' } : item);
}

export async function expireInboundTasks(input: { stateStore: SqliteStateStore; network_id: string; now?: string }): Promise<{ expired: number }> {
  const now = input.now ?? new Date().toISOString();
  const pending = (await listInboundTasks({ stateStore: input.stateStore, network_id: input.network_id, now })).filter((item) => item.status === 'expired');
  let expired = 0;
  for (const inbound of pending) {
    const current = (await input.stateStore.readEvents({ network_id: input.network_id, aggregate_type: OPN_INBOUND_TASK_AGGREGATE, aggregate_id: inbound.inbound_id })).events.at(-1);
    if (!current) continue;
    const revision = await input.stateStore.getRevision(input.network_id);
    const result = await input.stateStore.appendEvent({ network_id: input.network_id, expected_revision: revision, now, event: { event_id: eventId(inbound.inbound_id, 'expired'), aggregate_type: OPN_INBOUND_TASK_AGGREGATE, aggregate_id: inbound.inbound_id, event_type: 'opn.inbound.task.expired', occurred_at: now, payload: { schema: OPN_INBOUND_TASK_SCHEMA, inbound: { ...inbound, status: 'expired' } } satisfies Payload } });
    if (result.status === 'recorded') expired += 1;
  }
  return { expired };
}

export async function persistInboundTask(input: { stateStore: SqliteStateStore; inbound: InboundTask; now?: string }): Promise<{ status: 'recorded' | 'duplicate' | 'conflict'; inbound: InboundTask }> {
  const existing = (await listInboundTasks({ stateStore: input.stateStore, network_id: input.inbound.network_id })).find((item) => item.inbound_id === input.inbound.inbound_id);
  if (existing) {
    if (existing.envelope.envelope_digest !== input.inbound.envelope.envelope_digest) throw new Error('inbound-task-id-conflict');
    return { status: 'duplicate', inbound: existing };
  }
  const now = input.now ?? input.inbound.received_at;
  const revision = await input.stateStore.getRevision(input.inbound.network_id);
  const result = await input.stateStore.appendEvent({ network_id: input.inbound.network_id, expected_revision: revision, now, event: { event_id: eventId(input.inbound.inbound_id, 'pending-human-approval'), aggregate_type: OPN_INBOUND_TASK_AGGREGATE, aggregate_id: input.inbound.inbound_id, event_type: 'opn.inbound.task.pending-human-approval', occurred_at: now, payload: { schema: OPN_INBOUND_TASK_SCHEMA, inbound: input.inbound } satisfies Payload } });
  return { status: result.status, inbound: input.inbound };
}

export async function appendInboundTaskDecision(input: { stateStore: SqliteStateStore; inbound: InboundTask; decision: 'approved' | 'rejected'; human_id: string; human_note: string; selected_agent_id?: string; decided_at?: string }): Promise<{ status: 'recorded' | 'duplicate' | 'conflict'; inbound: InboundTask }> {
  if (!input.human_id.trim() || !input.human_note.trim()) throw new Error('inbound-task-human-decision-input-invalid');
  if (input.decision === 'approved' && !input.selected_agent_id?.trim()) throw new Error('inbound-task-selected-agent-required');
  const now = input.decided_at ?? new Date().toISOString();
  const existing = (await listInboundTasks({ stateStore: input.stateStore, network_id: input.inbound.network_id, now })).find((value) => value.inbound_id === input.inbound.inbound_id);
  if (!existing || existing.envelope.envelope_digest !== input.inbound.envelope.envelope_digest) throw new Error('inbound-task-not-found');
  const nextStatus: InboundTaskStatus = input.decision === 'approved' ? 'admitted' : 'blocked';
  if (existing.status === nextStatus) return { status: 'duplicate', inbound: existing };
  if (existing.status !== 'pending-human-approval') throw new Error('inbound-task-state-conflict');
  const inbound: InboundTask = { ...existing, status: nextStatus, human_id: input.human_id.trim(), human_note: input.human_note.trim(), decided_at: now, ...(input.selected_agent_id ? { selected_agent_id: input.selected_agent_id.trim() } : {}), ...(input.decision === 'rejected' ? { admission_reason: 'human-rejected' } : {}) };
  const revision = await input.stateStore.getRevision(input.inbound.network_id);
  const result = await input.stateStore.appendEvent({ network_id: input.inbound.network_id, expected_revision: revision, now, event: { event_id: eventId(existing.inbound_id, input.decision), aggregate_type: OPN_INBOUND_TASK_AGGREGATE, aggregate_id: existing.inbound_id, event_type: `opn.inbound.task.${input.decision}`, occurred_at: now, payload: { schema: OPN_INBOUND_TASK_SCHEMA, inbound } satisfies Payload } });
  return { status: result.status, inbound };
}

export async function appendInboundTaskLifecycle(input: { stateStore: SqliteStateStore; inbound: InboundTask; status: 'admitted' | 'processing' | 'completed' | 'failed'; reason?: string; now?: string; processing_lease_ms?: number }): Promise<{ status: 'recorded' | 'duplicate' | 'conflict'; inbound: InboundTask }> {
  const now = input.now ?? new Date().toISOString();
  const existing = (await listInboundTasks({ stateStore: input.stateStore, network_id: input.inbound.network_id, now })).find((value) => value.inbound_id === input.inbound.inbound_id);
  if (!existing || existing.envelope.envelope_digest !== input.inbound.envelope.envelope_digest) throw new Error('inbound-task-not-found');
  if (existing.status === input.status) return { status: 'duplicate', inbound: existing };
  if (input.status === 'processing' && existing.status !== 'admitted') throw new Error('inbound-task-state-conflict');
  if (input.status === 'admitted' && (existing.status !== 'processing' || input.reason !== 'processing-lease-expired' || Date.parse(existing.processing_lease_expires_at ?? '') > Date.parse(now))) throw new Error('inbound-task-state-conflict');
  if ((input.status === 'completed' || input.status === 'failed') && existing.status !== 'processing') throw new Error('inbound-task-state-conflict');
  const inbound: InboundTask = { ...existing, status: input.status, ...(input.reason ? { admission_reason: input.reason } : {}) };
  if (input.status === 'processing') {
    inbound.processing_started_at = now;
    inbound.processing_lease_expires_at = new Date(Date.parse(now) + (input.processing_lease_ms ?? DEFAULT_INBOUND_PROCESSING_LEASE_MS)).toISOString();
  } else if (input.status === 'admitted' || input.status === 'completed' || input.status === 'failed') {
    delete inbound.processing_lease_expires_at;
  }
  const revision = await input.stateStore.getRevision(input.inbound.network_id);
  const result = await input.stateStore.appendEvent({ network_id: input.inbound.network_id, expected_revision: revision, now, event: { event_id: eventId(existing.inbound_id, `${input.status}:${now}`), aggregate_type: OPN_INBOUND_TASK_AGGREGATE, aggregate_id: existing.inbound_id, event_type: `opn.inbound.task.${input.status}`, occurred_at: now, payload: { schema: OPN_INBOUND_TASK_SCHEMA, inbound } satisfies Payload } });
  return { status: result.status, inbound };
}

export async function recoverExpiredInboundTasks(input: { stateStore: SqliteStateStore; network_id: string; now?: string }): Promise<{ recovered: number }> {
  const now = input.now ?? new Date().toISOString();
  const candidates = (await listInboundTasks({ stateStore: input.stateStore, network_id: input.network_id, now })).filter((item) => item.status === 'processing' && Date.parse(item.processing_lease_expires_at ?? '') <= Date.parse(now));
  let recovered = 0;
  for (const inbound of candidates) {
    try {
      const result = await appendInboundTaskLifecycle({ stateStore: input.stateStore, inbound, status: 'admitted', reason: 'processing-lease-expired', now });
      if (result.status === 'recorded') recovered += 1;
    } catch (error) {
      if (!(error instanceof Error) || error.message !== 'inbound-task-state-conflict') throw error;
    }
  }
  return { recovered };
}
