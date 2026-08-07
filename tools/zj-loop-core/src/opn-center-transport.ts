import { randomUUID } from 'node:crypto';
import type { SqliteStateStore, StateEvent } from './sqlite-state-store.js';
import { validateTransportEnvelope, type TransportAdapter, type TransportEnvelope, type TransportResult } from './transport-contract.js';

const AGGREGATE_TYPE = 'opn-transport-message';
const OFFERED_EVENT = 'opn.transport.message.offered';
const ACKNOWLEDGED_EVENT = 'opn.transport.message.acknowledged';
const PAYLOAD_SCHEMA = 'zj-loop.opn_transport_http.v1';

type TransportPayload = { schema: typeof PAYLOAD_SCHEMA; envelope: TransportEnvelope };
type Session = { session_id: string; network_id: string; node_id: string };

function requiredText(value: unknown, error: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(error);
}

function payloadOf(event: StateEvent): TransportEnvelope | null {
  const payload = event.payload as Partial<TransportPayload>;
  if (payload.schema !== PAYLOAD_SCHEMA || !payload.envelope) return null;
  return payload.envelope;
}

function eventId(eventType: string, envelope: TransportEnvelope): string {
  return `${eventType}:${envelope.message_id}:${envelope.envelope_digest}`;
}

function result(status: 'accepted' | 'duplicate', envelope: TransportEnvelope): TransportResult {
  return { status, message_id: envelope.message_id, envelope_digest: envelope.envelope_digest, side_effects_executed: false };
}

export function createLocalOpnTransportAdapter(input: { stateStore: SqliteStateStore; network_id: string; node_id: string; now?: () => string }): TransportAdapter {
  requiredText(input.network_id, 'opn-center-transport-network-id-required');
  requiredText(input.node_id, 'opn-center-transport-node-id-required');
  if (!input.stateStore) throw new Error('opn-center-transport-state-store-required');
  const now = input.now ?? (() => new Date().toISOString());
  const sessions = new Map<string, Session>();

  async function sessionFor(session_id: string): Promise<Session> {
    requiredText(session_id, 'transport-session-id-required');
    const session = sessions.get(session_id);
    if (!session) throw new Error('transport-session-not-found');
    return session;
  }

  async function messages(): Promise<Map<string, { envelope: TransportEnvelope; acknowledged: boolean }>> {
    const events = (await input.stateStore.readEvents({ network_id: input.network_id, aggregate_type: AGGREGATE_TYPE })).events;
    const resultMap = new Map<string, { envelope: TransportEnvelope; acknowledged: boolean }>();
    for (const event of events) {
      const envelope = payloadOf(event);
      if (!envelope) continue;
      if (event.event_type === OFFERED_EVENT) resultMap.set(envelope.message_id, { envelope, acknowledged: false });
      if (event.event_type === ACKNOWLEDGED_EVENT && resultMap.has(envelope.message_id)) resultMap.get(envelope.message_id)!.acknowledged = true;
    }
    return resultMap;
  }

  async function appendFact(envelope: TransportEnvelope, event_type: string): Promise<'recorded' | 'duplicate' | 'conflict'> {
    const current = await input.stateStore.getRevision(input.network_id);
    const event = { event_id: eventId(event_type, envelope), aggregate_type: AGGREGATE_TYPE, aggregate_id: envelope.message_id, event_type, occurred_at: event_type === OFFERED_EVENT ? envelope.created_at : now(), payload: { schema: PAYLOAD_SCHEMA, envelope } satisfies TransportPayload };
    const appended = await input.stateStore.appendEvent({ network_id: input.network_id, expected_revision: current, now: now(), event });
    return appended.status;
  }

  return {
    async openSession(session) {
      requiredText(session.network_id, 'transport-network-id-required');
      requiredText(session.node_id, 'transport-node-id-required');
      if (session.network_id !== input.network_id || session.node_id !== input.node_id) throw new Error('transport-local-session-identity-mismatch');
      const session_id = `local_ots_${randomUUID().replaceAll('-', '')}`;
      sessions.set(session_id, { session_id, network_id: input.network_id, node_id: input.node_id });
      return { session_id };
    },
    async send(sessionInput) {
      await sessionFor(sessionInput.session_id);
      const validation = validateTransportEnvelope(sessionInput.envelope);
      if (validation.status !== 'valid') throw new Error(validation.reason);
      const envelope = sessionInput.envelope;
      if (envelope.network_id !== input.network_id || envelope.from_node_id !== input.node_id || envelope.target_node_id === input.node_id) throw new Error('transport-local-envelope-identity-mismatch');
      const existing = (await input.stateStore.readEvents({ network_id: input.network_id, aggregate_type: AGGREGATE_TYPE, aggregate_id: envelope.message_id })).events.find((event) => event.event_type === OFFERED_EVENT);
      if (existing) {
        const prior = payloadOf(existing);
        if (prior?.envelope_digest !== envelope.envelope_digest) throw new Error('transport-message-conflict');
        return result('duplicate', envelope);
      }
      const appended = await appendFact(envelope, OFFERED_EVENT);
      if (appended === 'conflict') throw new Error('transport-message-conflict');
      return result(appended === 'duplicate' ? 'duplicate' : 'accepted', envelope);
    },
    async receive(sessionInput) {
      const session = await sessionFor(sessionInput.session_id);
      const pending = [...(await messages()).values()].find((message) => message.envelope.target_node_id === session.node_id && !message.acknowledged);
      return pending?.envelope ?? null;
    },
    async acknowledge(sessionInput) {
      const session = await sessionFor(sessionInput.session_id);
      requiredText(sessionInput.message_id, 'transport-message-id-required');
      requiredText(sessionInput.envelope_digest, 'transport-envelope-digest-required');
      const message = (await messages()).get(sessionInput.message_id);
      if (!message || message.envelope.target_node_id !== session.node_id || message.envelope.envelope_digest !== sessionInput.envelope_digest) throw new Error('transport-ack-message-mismatch');
      const appended = await appendFact(message.envelope, ACKNOWLEDGED_EVENT);
      return result(appended === 'duplicate' ? 'duplicate' : 'accepted', message.envelope);
    },
    async closeSession(sessionInput) {
      await sessionFor(sessionInput.session_id);
      sessions.delete(sessionInput.session_id);
    },
  };
}
