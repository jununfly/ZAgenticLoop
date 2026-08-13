import type { SqliteStateStore, StateEvent } from './sqlite-state-store.js';
import type { TransportEnvelope } from './transport-contract.js';
import { validateTransportEnvelope } from './transport-contract.js';

export const OPN_INBOUND_TASK_SCHEMA = 'zj-loop.opn_inbound_task.v1' as const;
export const OPN_INBOUND_TASK_AGGREGATE = 'opn-inbound-task' as const;
export type InboundTaskStatus = 'pending-human-approval' | 'admitted' | 'blocked' | 'expired' | 'cancelled';
export type InboundTask = { schema: typeof OPN_INBOUND_TASK_SCHEMA; inbound_id: string; network_id: string; envelope: TransportEnvelope; status: InboundTaskStatus; received_at: string; human_note?: string; selected_agent_id?: string; admission_reason?: string };
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

export async function listInboundTasks(input: { stateStore: Pick<SqliteStateStore, 'readEvents'>; network_id: string }): Promise<InboundTask[]> {
  const events = (await input.stateStore.readEvents({ network_id: input.network_id, aggregate_type: OPN_INBOUND_TASK_AGGREGATE })).events;
  const grouped = new Map<string, StateEvent[]>();
  for (const event of events) grouped.set(event.aggregate_id, [...(grouped.get(event.aggregate_id) ?? []), event]);
  return [...grouped.values()].map(latest).filter((item): item is InboundTask => item !== null).map((item) => item.status === 'pending-human-approval' && Date.parse(item.envelope.expires_at) <= Date.now() ? { ...item, status: 'expired' } : item);
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
