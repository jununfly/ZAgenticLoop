export declare const RELAY_CONTRACT_SCHEMA: "zj-loop.relay_contract.v1";
export type RelaySession = {
    schema: typeof RELAY_CONTRACT_SCHEMA;
    session_id: string;
    network_id: string;
    node_id: string;
    credential_id: string;
    protocol_version: string;
    created_at: string;
    expires_at: string;
    status: 'active' | 'closed' | 'revoked';
};
export type DeliveryState = 'offered' | 'retry_scheduled' | 'accepted' | 'acknowledged' | 'blocked' | 'rejected';
export type RelayDelivery = {
    delivery_id: string;
    attempt_id: string;
    network_id: string;
    event_id: string;
    task_id: string;
    target_node_id: string;
    state: DeliveryState;
    lease_expires_at?: string;
    retry_count: number;
    reason?: string;
};
export declare function createRelaySession(input: {
    session_id: string;
    network_id: string;
    node_id: string;
    credential_id: string;
    protocol_version: string;
    created_at: string;
    credential_expires_at: string;
    max_ttl_ms: number;
}): RelaySession;
export declare function transitionDelivery(delivery: RelayDelivery, next: {
    state: DeliveryState;
    reason?: string;
}): RelayDelivery;
export declare function startDeliveryLease(input: {
    delivery: RelayDelivery;
    attempt_id: string;
    now: string;
    lease_ms: number;
}): RelayDelivery;
export declare function acknowledgeDelivery(input: {
    delivery: RelayDelivery;
    attempt_id: string;
    now: string;
}): RelayDelivery;
export declare function scheduleDeliveryRetry(input: {
    delivery: RelayDelivery;
    now: string;
    max_retries: number;
    reason: string;
}): RelayDelivery;
