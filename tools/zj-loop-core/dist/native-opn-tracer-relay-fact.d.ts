import { createNativeOpnTracerRelayInbox, type NativeOpnTracerRelayEnvelope } from './native-opn-tracer-relay.js';
import type { SqliteStateStore } from './sqlite-state-store.js';
export declare const NATIVE_OPN_TRACER_RELAY_RECEIPT_SCHEMA: "zj-loop.native_opn_tracer_relay_receipt.v1";
export type NativeOpnTracerRelayDelivery = {
    delivery_id: string;
    attempt_id: string;
    network_id: string;
    event_id: string;
    target_node_id: string;
    state: NativeOpnTracerRelayEnvelope['state'];
    notification_kind: NativeOpnTracerRelayEnvelope['notification_kind'];
    envelope_sha256: string;
    artifact_refs: NativeOpnTracerRelayEnvelope['artifact_refs'];
    revision: number;
};
export type NativeOpnTracerRelayReceiptResult = {
    schema: typeof NATIVE_OPN_TRACER_RELAY_RECEIPT_SCHEMA;
    status: 'recorded' | 'duplicate' | 'blocked' | 'conflict';
    event_id: string;
    side_effects_executed: false;
    revision?: number;
    current_revision?: number;
    reason?: string;
};
export declare function toNativeOpnTracerRelayDelivery(input: {
    envelope: NativeOpnTracerRelayEnvelope;
    delivery_id: string;
    attempt_id: string;
    revision: number;
}): NativeOpnTracerRelayDelivery;
export declare function recordNativeOpnTracerRelayReceipt(input: {
    stateStore: SqliteStateStore;
    inbox: ReturnType<typeof createNativeOpnTracerRelayInbox>;
    expected_revision: number;
    envelope: NativeOpnTracerRelayEnvelope;
    now: string;
}): Promise<NativeOpnTracerRelayReceiptResult>;
