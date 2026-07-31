export declare const TRANSPORT_ENVELOPE_SCHEMA: "zj-loop.transport_envelope.v1";
export declare const TRANSPORT_ENVELOPE_MAX_BYTES: number;
export type TransportArtifactRef = {
    artifact_id: string;
    content_sha256: string;
    kind: 'evidence' | 'artifact';
};
export type TransportEnvelope = {
    schema: typeof TRANSPORT_ENVELOPE_SCHEMA;
    message_id: string;
    network_id: string;
    event_id: string;
    plan_id: string;
    plan_revision: number;
    task_id: string;
    from_node_id: string;
    target_node_id: string;
    notification_kind: string;
    state: 'available' | 'blocked';
    artifact_refs: TransportArtifactRef[];
    created_at: string;
    expires_at: string;
    side_effects_executed: false;
    envelope_digest: string;
};
export type TransportResult = {
    status: 'accepted';
    message_id: string;
    envelope_digest: string;
    side_effects_executed: false;
} | {
    status: 'duplicate';
    message_id: string;
    envelope_digest: string;
    side_effects_executed: false;
} | {
    status: 'blocked';
    message_id?: string;
    reason: string;
    side_effects_executed: false;
};
export type TransportAdapter = {
    openSession(input: {
        network_id: string;
        node_id: string;
    }): Promise<{
        session_id: string;
    }>;
    send(input: {
        session_id: string;
        envelope: TransportEnvelope;
    }): Promise<TransportResult>;
    receive(input: {
        session_id: string;
    }): Promise<TransportEnvelope | null>;
    acknowledge(input: {
        session_id: string;
        message_id: string;
        envelope_digest: string;
    }): Promise<TransportResult>;
    closeSession(input: {
        session_id: string;
    }): Promise<void>;
};
type EnvelopeInput = Omit<TransportEnvelope, 'schema' | 'envelope_digest' | 'side_effects_executed'> & {
    payload?: never;
};
export declare function createTransportEnvelope(input: EnvelopeInput): TransportEnvelope;
export declare function transportEnvelopeDigest(value: TransportEnvelope): string;
export declare function validateTransportEnvelope(value: unknown): {
    status: 'valid';
} | {
    status: 'blocked';
    reason: string;
};
export {};
