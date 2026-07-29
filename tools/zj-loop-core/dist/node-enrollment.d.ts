import type { ConnectionOptions, TlsOptions } from 'node:tls';
export declare const NODE_IDENTITY_SCHEMA: "zj-loop.node_identity.v1";
export declare const ENROLLMENT_PROJECTION_SCHEMA: "zj-loop.enrollment_projection.v1";
export type NodeIdentity = {
    schema: typeof NODE_IDENTITY_SCHEMA;
    node_id: string;
    certificate_sha256: string;
    certificate_pem: string;
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
