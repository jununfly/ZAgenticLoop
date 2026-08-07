import type { TransportEnvelope } from './transport-contract.js';
import type { DeliveryState } from './relay-contract.js';
import { validateTransportEnvelope } from './transport-contract.js';

export const OPN_MESSAGE_READ_MODEL_SCHEMA = 'zj-loop.opn_message_read_model.v1' as const;

export type OpnMessageReadModel = {
  schema: typeof OPN_MESSAGE_READ_MODEL_SCHEMA;
  network_id: string;
  message_id: string;
  envelope_digest: string;
  event_id: string;
  task_id: string;
  from_node_id: string;
  target_node_id: string;
  notification_kind: string;
  state: TransportEnvelope['state'];
  delivery_state: DeliveryState;
  artifact_refs: TransportEnvelope['artifact_refs'];
  created_at: string;
  expires_at: string;
  next_action: 'inspect-artifact' | 'await-ack' | 'retry-delivery' | 'blocked' | 'none';
  side_effects_executed: false;
};

export function createOpnMessageReadModel(input: { envelope: TransportEnvelope; delivery_state: DeliveryState }): OpnMessageReadModel {
  const validation = validateTransportEnvelope(input.envelope);
  if (validation.status !== 'valid') throw new Error(validation.reason);
  const next_action = input.delivery_state === 'acknowledged' ? 'none' : input.delivery_state === 'blocked' || input.delivery_state === 'rejected' ? 'blocked' : input.delivery_state === 'retry_scheduled' ? 'retry-delivery' : input.envelope.artifact_refs.length ? 'inspect-artifact' : 'await-ack';
  return { schema: OPN_MESSAGE_READ_MODEL_SCHEMA, network_id: input.envelope.network_id, message_id: input.envelope.message_id, envelope_digest: input.envelope.envelope_digest, event_id: input.envelope.event_id, task_id: input.envelope.task_id, from_node_id: input.envelope.from_node_id, target_node_id: input.envelope.target_node_id, notification_kind: input.envelope.notification_kind, state: input.envelope.state, delivery_state: input.delivery_state, artifact_refs: input.envelope.artifact_refs.map((ref) => ({ ...ref })), created_at: input.envelope.created_at, expires_at: input.envelope.expires_at, next_action, side_effects_executed: false };
}
