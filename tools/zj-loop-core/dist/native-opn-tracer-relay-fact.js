import { nativeOpnTracerRelayEnvelopeDigest } from './native-opn-tracer-relay.js';
export const NATIVE_OPN_TRACER_RELAY_RECEIPT_SCHEMA = 'zj-loop.native_opn_tracer_relay_receipt.v1';
export function toNativeOpnTracerRelayDelivery(input) {
    if (!input.delivery_id.trim() || !input.attempt_id.trim() || !Number.isInteger(input.revision) || input.revision < 1)
        throw new Error('native-opn-tracer-relay-delivery-invalid');
    return { delivery_id: input.delivery_id, attempt_id: input.attempt_id, network_id: input.envelope.network_id, event_id: input.envelope.event_id, target_node_id: input.envelope.target_node_id, state: input.envelope.state, notification_kind: input.envelope.notification_kind, envelope_sha256: input.envelope.envelope_digest, artifact_refs: input.envelope.artifact_refs.map((ref) => ({ ...ref })), revision: input.revision };
}
export async function recordNativeOpnTracerRelayReceipt(input) {
    const event_id = `native-opn-tracer-relay-received:${input.envelope.message_id}:${input.envelope.envelope_digest}`;
    const accepted = input.inbox.accept(input.envelope);
    if (accepted.status === 'blocked' || accepted.status === 'conflict')
        return { schema: NATIVE_OPN_TRACER_RELAY_RECEIPT_SCHEMA, status: accepted.status, event_id, side_effects_executed: false, reason: accepted.reason };
    if (accepted.status === 'duplicate')
        return { schema: NATIVE_OPN_TRACER_RELAY_RECEIPT_SCHEMA, status: 'duplicate', event_id, side_effects_executed: false, current_revision: input.expected_revision };
    const result = await input.stateStore.runAtomic((transaction) => {
        const aggregate_id = `${input.envelope.network_id}:${input.envelope.message_id}`;
        const existing = transaction.database.prepare("SELECT event_id, payload_json FROM state_events WHERE network_id = ? AND aggregate_type = 'native-opn-tracer-relay' AND aggregate_id = ? AND event_type = 'native-opn-tracer.relay.message.received'").get(input.envelope.network_id, aggregate_id);
        if (existing) {
            const payload = JSON.parse(existing.payload_json);
            return payload.envelope_digest === input.envelope.envelope_digest ? { status: 'duplicate', event_id: existing.event_id, current_revision: input.expected_revision } : { status: 'conflict', event_id, current_revision: input.expected_revision, reason: 'native-opn-tracer-relay-message-conflict' };
        }
        const appended = transaction.appendEvent({ network_id: input.envelope.network_id, expected_revision: input.expected_revision, now: input.now, event: { event_id, aggregate_type: 'native-opn-tracer-relay', aggregate_id, event_type: 'native-opn-tracer.relay.message.received', occurred_at: input.envelope.created_at, payload: { schema: NATIVE_OPN_TRACER_RELAY_RECEIPT_SCHEMA, message_id: input.envelope.message_id, envelope_digest: nativeOpnTracerRelayEnvelopeDigest(input.envelope), network_id: input.envelope.network_id, event_id: input.envelope.event_id, plan_id: input.envelope.plan_id, plan_revision: input.envelope.plan_revision, from_node_id: input.envelope.from_node_id, target_node_id: input.envelope.target_node_id, artifact_refs: input.envelope.artifact_refs.map((ref) => ({ ...ref })), state: input.envelope.state } } });
        return appended.status === 'recorded' ? { status: 'recorded', event_id, revision: appended.revision, current_revision: appended.current_revision } : { status: appended.status === 'duplicate' ? 'duplicate' : 'conflict', event_id, current_revision: appended.current_revision, reason: appended.reason };
    });
    return { schema: NATIVE_OPN_TRACER_RELAY_RECEIPT_SCHEMA, ...result, side_effects_executed: false };
}
