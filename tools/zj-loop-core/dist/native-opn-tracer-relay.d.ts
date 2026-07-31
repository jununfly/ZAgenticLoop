export declare const NATIVE_OPN_TRACER_RELAY_ENVELOPE_SCHEMA: "zj-loop.native_opn_tracer_relay_envelope.v1";
export type NativeOpnTracerRelayEnvelope = {
    schema: typeof NATIVE_OPN_TRACER_RELAY_ENVELOPE_SCHEMA;
    message_id: string;
    network_id: string;
    event_id: string;
    plan_id: string;
    plan_revision: number;
    from_node_id: string;
    target_node_id: string;
    notification_kind: 'execution-evidence-available' | 'aggregation-available' | 'verification-available' | 'blocked';
    state: 'available' | 'blocked';
    artifact_refs: Array<{
        artifact_id: string;
        content_sha256: string;
        kind: string;
    }>;
    created_at: string;
    expires_at: string;
    side_effects_executed: false;
    envelope_digest: string;
};
export type NativeOpnTracerRelayInboxResult = {
    status: 'accepted' | 'duplicate' | 'conflict' | 'blocked';
    envelope?: NativeOpnTracerRelayEnvelope;
    reason?: string;
};
export declare function createNativeOpnTracerRelayEnvelope(input: Omit<NativeOpnTracerRelayEnvelope, 'schema' | 'side_effects_executed' | 'envelope_digest'>): NativeOpnTracerRelayEnvelope;
export declare function nativeOpnTracerRelayEnvelopeDigest(envelope: NativeOpnTracerRelayEnvelope): string;
export declare function createNativeOpnTracerRelayInbox(input: {
    network_id: string;
    node_id: string;
    now: string;
}): {
    accept(envelope: NativeOpnTracerRelayEnvelope): NativeOpnTracerRelayInboxResult;
};
