import { validateTransportEnvelope } from './transport-contract.js';
export const OPN_MESSAGE_READ_MODEL_SCHEMA = 'zj-loop.opn_message_read_model.v1';
export function createOpnMessageReadModel(input) {
    const validation = validateTransportEnvelope(input.envelope);
    if (validation.status !== 'valid')
        throw new Error(validation.reason);
    const next_action = input.delivery_state === 'acknowledged' ? 'none' : input.delivery_state === 'blocked' || input.delivery_state === 'rejected' ? 'blocked' : input.delivery_state === 'retry_scheduled' ? 'retry-delivery' : input.envelope.artifact_refs.length ? 'inspect-artifact' : 'await-ack';
    return { schema: OPN_MESSAGE_READ_MODEL_SCHEMA, network_id: input.envelope.network_id, message_id: input.envelope.message_id, envelope_digest: input.envelope.envelope_digest, event_id: input.envelope.event_id, task_id: input.envelope.task_id, from_node_id: input.envelope.from_node_id, target_node_id: input.envelope.target_node_id, notification_kind: input.envelope.notification_kind, state: input.envelope.state, delivery_state: input.delivery_state, artifact_refs: input.envelope.artifact_refs.map((ref) => ({ ...ref })), created_at: input.envelope.created_at, expires_at: input.envelope.expires_at, next_action, side_effects_executed: false };
}
