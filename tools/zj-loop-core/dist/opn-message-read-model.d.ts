import type { TransportEnvelope } from './transport-contract.js';
import type { DeliveryState } from './relay-contract.js';
export declare const OPN_MESSAGE_READ_MODEL_SCHEMA: "zj-loop.opn_message_read_model.v1";
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
export declare function createOpnMessageReadModel(input: {
    envelope: TransportEnvelope;
    delivery_state: DeliveryState;
}): OpnMessageReadModel;
