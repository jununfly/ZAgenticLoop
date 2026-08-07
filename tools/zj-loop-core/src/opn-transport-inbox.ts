import type { OpnMessageReadModel } from './opn-message-read-model.js';
import { createOpnMessageReadModel } from './opn-message-read-model.js';
import type { SqliteStateStore, StateEvent } from './sqlite-state-store.js';
import type { TransportAdapter, TransportEnvelope } from './transport-contract.js';
import { validateTransportEnvelope } from './transport-contract.js';

export const OPN_INBOX_AGGREGATE_TYPE = 'opn-inbox' as const;
export const OPN_INBOX_RECEIVED_EVENT_TYPE = 'opn.inbox.message.received' as const;
export const OPN_INBOX_ACKNOWLEDGED_EVENT_TYPE = 'opn.inbox.message.acknowledged' as const;
export const OPN_INBOX_EVENT_SCHEMA = 'zj-loop.opn_inbox_event.v1' as const;

type InboxPayload = {
  schema: typeof OPN_INBOX_EVENT_SCHEMA;
  message_id: string;
  envelope_digest: string;
  envelope: TransportEnvelope;
};

type InboxStateStore = Pick<SqliteStateStore, 'appendEvent' | 'getRevision' | 'readEvents'> & Partial<Pick<SqliteStateStore, 'runAtomic'>>;

export type OpnInboxResult =
  | { status: 'empty'; side_effects_executed: false }
  | { status: 'acknowledged' | 'duplicate'; message_id: string; envelope_digest: string; side_effects_executed: false }
  | { status: 'ack-pending'; message_id: string; envelope_digest: string; reason: string; side_effects_executed: false }
  | { status: 'blocked'; message_id?: string; reason: string; side_effects_executed: false }
  | { status: 'outcome-uncertain'; message_id: string; envelope_digest: string; reason: string; side_effects_executed: false };

function requiredText(value: unknown, error: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(error);
}

function eventId(eventType: string, envelope: TransportEnvelope): string {
  return `${eventType}:${envelope.message_id}:${envelope.envelope_digest}`;
}

function payloadFor(envelope: TransportEnvelope): InboxPayload {
  return { schema: OPN_INBOX_EVENT_SCHEMA, message_id: envelope.message_id, envelope_digest: envelope.envelope_digest, envelope: { ...envelope, artifact_refs: envelope.artifact_refs.map((ref) => ({ ...ref })) } };
}

function payloadOf(event: StateEvent): InboxPayload | null {
  const payload = event.payload as Partial<InboxPayload>;
  if (payload.schema !== OPN_INBOX_EVENT_SCHEMA || !payload.envelope || payload.message_id !== event.aggregate_id) return null;
  return payload as InboxPayload;
}

async function inboxEvents(stateStore: InboxStateStore, network_id: string, message_id: string): Promise<StateEvent[]> {
  return (await stateStore.readEvents({ network_id, aggregate_type: OPN_INBOX_AGGREGATE_TYPE, aggregate_id: message_id })).events;
}

async function persistReceived(input: { stateStore: InboxStateStore; network_id: string; expected_revision: number; envelope: TransportEnvelope; now: string }): Promise<{ status: 'recorded' | 'duplicate' | 'conflict'; revision?: number; current_revision: number; reason?: string }> {
  const payload = payloadFor(input.envelope);
  const event = { event_id: eventId(OPN_INBOX_RECEIVED_EVENT_TYPE, input.envelope), aggregate_type: OPN_INBOX_AGGREGATE_TYPE, aggregate_id: input.envelope.message_id, event_type: OPN_INBOX_RECEIVED_EVENT_TYPE, occurred_at: input.envelope.created_at, payload };
  if (input.stateStore.runAtomic) {
    return input.stateStore.runAtomic((transaction) => {
      const existing = transaction.database.prepare('SELECT payload_json FROM state_events WHERE network_id = ? AND aggregate_type = ? AND aggregate_id = ? AND event_type = ? ORDER BY revision LIMIT 1').get(input.network_id, OPN_INBOX_AGGREGATE_TYPE, input.envelope.message_id, OPN_INBOX_RECEIVED_EVENT_TYPE) as { payload_json: string } | undefined;
      if (existing) {
        const existingPayload = JSON.parse(existing.payload_json) as Partial<InboxPayload>;
        return existingPayload.envelope_digest === input.envelope.envelope_digest
          ? { status: 'duplicate' as const, current_revision: input.expected_revision }
          : { status: 'conflict' as const, current_revision: input.expected_revision, reason: 'opn-inbox-message-digest-conflict' };
      }
      return transaction.appendEvent({ network_id: input.network_id, expected_revision: input.expected_revision, now: input.now, event });
    });
  }
  const existing = (await inboxEvents(input.stateStore, input.network_id, input.envelope.message_id)).find((candidate) => candidate.event_type === OPN_INBOX_RECEIVED_EVENT_TYPE);
  if (existing) {
    const existingPayload = payloadOf(existing);
    return existingPayload?.envelope_digest === input.envelope.envelope_digest
      ? { status: 'duplicate', revision: existing.revision, current_revision: await input.stateStore.getRevision(input.network_id) }
      : { status: 'conflict', current_revision: await input.stateStore.getRevision(input.network_id), reason: 'opn-inbox-message-digest-conflict' };
  }
  return input.stateStore.appendEvent({ network_id: input.network_id, expected_revision: input.expected_revision, now: input.now, event });
}

async function persistAcknowledged(input: { stateStore: InboxStateStore; network_id: string; envelope: TransportEnvelope; now: string }): Promise<'recorded' | 'duplicate' | 'conflict'> {
  const current = await input.stateStore.getRevision(input.network_id);
  const event = { event_id: eventId(OPN_INBOX_ACKNOWLEDGED_EVENT_TYPE, input.envelope), aggregate_type: OPN_INBOX_AGGREGATE_TYPE, aggregate_id: input.envelope.message_id, event_type: OPN_INBOX_ACKNOWLEDGED_EVENT_TYPE, occurred_at: input.envelope.created_at, payload: payloadFor(input.envelope) };
  const result = await input.stateStore.appendEvent({ network_id: input.network_id, expected_revision: current, now: input.now, event });
  return result.status;
}

function validateForInbox(envelope: unknown, input: { network_id: string; node_id: string; now: string }): { status: 'valid'; envelope: TransportEnvelope } | { status: 'blocked'; reason: string; message_id?: string } {
  const validation = validateTransportEnvelope(envelope);
  if (validation.status !== 'valid') return { status: 'blocked', reason: validation.reason, ...(envelope && typeof envelope === 'object' && typeof (envelope as Record<string, unknown>).message_id === 'string' ? { message_id: (envelope as Record<string, unknown>).message_id as string } : {}) };
  const value = envelope as TransportEnvelope;
  if (value.network_id !== input.network_id) return { status: 'blocked', message_id: value.message_id, reason: 'opn-inbox-network-mismatch' };
  if (value.target_node_id !== input.node_id) return { status: 'blocked', message_id: value.message_id, reason: 'opn-inbox-target-mismatch' };
  if (Date.parse(value.expires_at) <= Date.parse(input.now)) return { status: 'blocked', message_id: value.message_id, reason: 'opn-inbox-message-expired' };
  return { status: 'valid', envelope: value };
}

export async function receiveAndPersistOpnMessage(input: { transport: Pick<TransportAdapter, 'receive' | 'acknowledge'>; session_id: string; stateStore: InboxStateStore; network_id: string; node_id: string; expected_revision: number; now: string }): Promise<OpnInboxResult> {
  requiredText(input.session_id, 'opn-inbox-session-id-required');
  requiredText(input.network_id, 'opn-inbox-network-id-required');
  requiredText(input.node_id, 'opn-inbox-node-id-required');
  const received = await input.transport.receive({ session_id: input.session_id });
  if (received === null) return { status: 'empty', side_effects_executed: false };
  const validation = validateForInbox(received, input);
  if (validation.status !== 'valid') return { status: 'blocked', ...(validation.message_id ? { message_id: validation.message_id } : {}), reason: validation.reason, side_effects_executed: false };
  const envelope = validation.envelope;
  let persisted: Awaited<ReturnType<typeof persistReceived>>;
  try {
    persisted = await persistReceived({ stateStore: input.stateStore, network_id: input.network_id, expected_revision: input.expected_revision, envelope, now: input.now });
  } catch (error) {
    return { status: 'outcome-uncertain', message_id: envelope.message_id, envelope_digest: envelope.envelope_digest, reason: error instanceof Error ? error.message : 'opn-inbox-persistence-failed', side_effects_executed: false };
  }
  if (persisted.status === 'conflict') return { status: 'outcome-uncertain', message_id: envelope.message_id, envelope_digest: envelope.envelope_digest, reason: persisted.reason ?? 'opn-inbox-persistence-conflict', side_effects_executed: false };
  try {
    const acknowledged = await input.transport.acknowledge({ session_id: input.session_id, message_id: envelope.message_id, envelope_digest: envelope.envelope_digest });
    if (acknowledged.status === 'blocked') return { status: 'ack-pending', message_id: envelope.message_id, envelope_digest: envelope.envelope_digest, reason: acknowledged.reason, side_effects_executed: false };
    const ackFact = await persistAcknowledged({ stateStore: input.stateStore, network_id: input.network_id, envelope, now: input.now });
    if (ackFact === 'conflict') return { status: 'ack-pending', message_id: envelope.message_id, envelope_digest: envelope.envelope_digest, reason: 'opn-inbox-ack-fact-conflict', side_effects_executed: false };
    return { status: persisted.status === 'duplicate' ? 'duplicate' : 'acknowledged', message_id: envelope.message_id, envelope_digest: envelope.envelope_digest, side_effects_executed: false };
  } catch (error) {
    return { status: 'ack-pending', message_id: envelope.message_id, envelope_digest: envelope.envelope_digest, reason: error instanceof Error ? error.message : 'opn-inbox-ack-failed', side_effects_executed: false };
  }
}

export async function projectOpnInbox(input: { stateStore: InboxStateStore; network_id: string; node_id: string }): Promise<OpnMessageReadModel[]> {
  const events = (await input.stateStore.readEvents({ network_id: input.network_id, aggregate_type: OPN_INBOX_AGGREGATE_TYPE })).events;
  const messages = new Map<string, { envelope: TransportEnvelope; acknowledged: boolean }>();
  for (const event of events) {
    const payload = payloadOf(event);
    if (!payload || payload.envelope.target_node_id !== input.node_id) continue;
    if (event.event_type === OPN_INBOX_RECEIVED_EVENT_TYPE) messages.set(payload.message_id, { envelope: payload.envelope, acknowledged: false });
    if (event.event_type === OPN_INBOX_ACKNOWLEDGED_EVENT_TYPE && messages.has(payload.message_id)) messages.get(payload.message_id)!.acknowledged = true;
  }
  return [...messages.values()].map((message) => createOpnMessageReadModel({ envelope: message.envelope, delivery_state: message.acknowledged ? 'acknowledged' : 'accepted' }));
}
