import type { PairingRequestProjection } from './pairing-projection.js';
export declare const OPN_CONNECTION_READ_MODEL_SCHEMA: "zj-loop.opn_connection_read_model.v1";
export type OpnConnectionReadModel = {
    schema: typeof OPN_CONNECTION_READ_MODEL_SCHEMA;
    network_id: string;
    status: 'connected' | 'pending' | 'blocked' | 'disconnected';
    local_node: {
        node_id: string;
        display_name: string;
        agent_kind: string;
        agent_version: string;
    };
    peers: Array<{
        request_id: string;
        node_id: string;
        status: PairingRequestProjection['status'];
        capabilities: string[];
        endpoint: string;
        expires_at: string;
        next_action: string;
    }>;
    side_effects_executed: false;
};
export declare function createOpnConnectionReadModel(input: {
    network_id: string;
    local_node: OpnConnectionReadModel['local_node'];
    peers: Array<PairingRequestProjection & {
        endpoint?: string;
    }>;
}): OpnConnectionReadModel;
