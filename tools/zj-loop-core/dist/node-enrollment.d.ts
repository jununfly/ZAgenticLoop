import type { ConnectionOptions, TlsOptions } from 'node:tls';
export declare const NODE_IDENTITY_SCHEMA: "zj-loop.node_identity.v1";
export declare const ENROLLMENT_PROJECTION_SCHEMA: "zj-loop.enrollment_projection.v1";
export declare const PAIRING_REQUEST_SCHEMA: "zj-loop.pairing_request.v1";
export declare const PAIRING_APPROVAL_SCHEMA: "zj-loop.pairing_approval.v1";
export declare const ENROLLMENT_RECORD_SCHEMA: "zj-loop.enrollment_record.v1";
export declare const SCOPED_CREDENTIAL_SCHEMA: "zj-loop.scoped_credential.v1";
export type NodeIdentity = {
    schema: typeof NODE_IDENTITY_SCHEMA;
    node_id: string;
    certificate_sha256: string;
    certificate_pem: string;
    algorithm: 'ECDSA-P256';
    display_name: string;
    agent_kind: string;
    agent_version: string;
};
export type EnrollmentEvent = {
    type: 'identity-generated' | 'pairing-requested' | 'human-approved' | 'capability-ceiling-granted' | 'credential-issued' | 'revoked' | 're-enrolled';
    event_id: string;
    node_id: string;
    occurred_at: string;
    capabilities?: string[];
};
export type EnrollmentRecord = {
    schema: typeof ENROLLMENT_RECORD_SCHEMA;
    type: EnrollmentEvent['type'];
    event_id: string;
    network_id: string;
    node_id: string;
    occurred_at: string;
    capabilities?: string[];
};
export type EnrollmentRecordStore = {
    append(record: EnrollmentRecord): Promise<{
        status: 'recorded' | 'duplicate';
        record: EnrollmentRecord;
    }>;
    list(networkId: string, nodeId: string): Promise<EnrollmentRecord[]>;
};
export declare function createInMemoryEnrollmentRecordStore(): EnrollmentRecordStore;
export declare function projectStoredEnrollment(input: {
    store: EnrollmentRecordStore;
    network_id: string;
    identity: NodeIdentity;
}): Promise<EnrollmentProjection>;
export type EnrollmentProjection = {
    schema: typeof ENROLLMENT_PROJECTION_SCHEMA;
    identity: NodeIdentity;
    status: 'pending' | 'approved' | 'revoked';
    capability_ceiling: string[];
    events: EnrollmentEvent[];
};
export type CapabilityGrant = {
    node_id: string;
    event_id: string;
    task_id: string;
    capabilities: string[];
};
export type PairingRequest = {
    schema: typeof PAIRING_REQUEST_SCHEMA;
    request_id: string;
    network_id: string;
    node_id: string;
    identity: NodeIdentity;
    endpoint: string;
    requested_capabilities: string[];
    expires_at: string;
};
export type PairingRequestProof = {
    algorithm: 'ECDSA-P256';
    request_digest: string;
    signature_base64: string;
};
export type PairingApproval = {
    schema: typeof PAIRING_APPROVAL_SCHEMA;
    approval_id: string;
    request_id: string;
    network_id: string;
    node_id: string;
    human_id: string;
    approved_capabilities: string[];
    approved_at: string;
    request_expires_at: string;
};
export type ScopedCredential = {
    schema: typeof SCOPED_CREDENTIAL_SCHEMA;
    credential_id: string;
    issuer: 'state-store';
    network_id: string;
    node_id: string;
    event_id: string;
    task_id: string;
    capabilities: string[];
    issued_at: string;
    expires_at: string;
};
export declare function createPairingRequest(input: {
    request_id: string;
    network_id: string;
    identity: NodeIdentity;
    endpoint: string;
    requested_capabilities: string[];
    expires_at: string;
}): PairingRequest;
export declare function pairingRequestDigest(request: PairingRequest): string;
export declare function createPairingRequestProof(input: {
    request: PairingRequest;
    private_key_pem: string;
}): PairingRequestProof;
export declare function verifyPairingRequestProof(input: {
    request: PairingRequest;
    proof: PairingRequestProof;
}): boolean;
export declare function approvePairingRequest(input: {
    request: PairingRequest;
    human_id: string;
    approved_at: string;
    approved_capabilities: string[];
}): PairingApproval;
export declare function issueScopedCredential(input: {
    approval: PairingApproval;
    grant: CapabilityGrant;
    issued_at: string;
    expires_at: string;
}): ScopedCredential;
export declare function buildMutualTlsServerOptions(input: {
    identity: NodeIdentity;
    private_key_pem: string;
    trusted_certificates_pem: string[];
}): TlsOptions;
export declare function buildMutualTlsClientOptions(input: {
    identity: NodeIdentity;
    private_key_pem: string;
    trusted_certificates_pem: string[];
    host: string;
    port: number;
    server_name?: string;
}): ConnectionOptions;
export declare function buildNodeIdentity(input: {
    certificate_pem: string;
    display_name: string;
    agent_kind: string;
    agent_version: string;
}): NodeIdentity;
export declare function projectEnrollment(input: {
    identity: NodeIdentity;
    events: EnrollmentEvent[];
}): EnrollmentProjection;
export declare function evaluateCapabilityGrant(projection: EnrollmentProjection, grant: CapabilityGrant): {
    status: 'allowed' | 'blocked';
    reason?: string;
    capabilities?: string[];
};
