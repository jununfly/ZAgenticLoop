import { createHash, X509Certificate } from 'node:crypto';
export const NODE_IDENTITY_SCHEMA = 'zj-loop.node_identity.v1';
export const ENROLLMENT_PROJECTION_SCHEMA = 'zj-loop.enrollment_projection.v1';
export function buildMutualTlsServerOptions(input) {
    return {
        key: input.private_key_pem,
        cert: input.identity.certificate_pem,
        ca: input.trusted_certificates_pem,
        requestCert: true,
        rejectUnauthorized: true,
        minVersion: 'TLSv1.2',
    };
}
export function buildMutualTlsClientOptions(input) {
    return {
        host: input.host,
        port: input.port,
        servername: input.server_name ?? input.host,
        key: input.private_key_pem,
        cert: input.identity.certificate_pem,
        ca: input.trusted_certificates_pem,
        rejectUnauthorized: true,
        minVersion: 'TLSv1.2',
    };
}
export function buildNodeIdentity(input) {
    if (!input.certificate_pem.trim())
        throw new Error('certificate-pem-required');
    if (!input.display_name.trim())
        throw new Error('display-name-required');
    if (!input.agent_kind.trim())
        throw new Error('agent-kind-required');
    if (!input.agent_version.trim())
        throw new Error('agent-version-required');
    let certificate;
    try {
        certificate = new X509Certificate(input.certificate_pem);
    }
    catch {
        throw new Error('certificate-invalid');
    }
    const fingerprint = createHash('sha256').update(certificate.raw).digest('hex');
    return {
        schema: NODE_IDENTITY_SCHEMA,
        node_id: fingerprint,
        certificate_sha256: fingerprint,
        certificate_pem: input.certificate_pem,
        display_name: input.display_name,
        agent_kind: input.agent_kind,
        agent_version: input.agent_version,
    };
}
export function projectEnrollment(input) {
    const seen = new Set();
    let status = 'pending';
    let capabilityCeiling = [];
    const events = input.events.map((event) => {
        if (seen.has(event.event_id))
            throw new Error('enrollment-event-duplicate');
        if (event.node_id !== input.identity.node_id)
            throw new Error('enrollment-node-binding-mismatch');
        seen.add(event.event_id);
        if (event.type === 'human-approved')
            status = 'approved';
        if (event.type === 'revoked')
            status = 'revoked';
        if (event.type === 're-enrolled')
            status = 'pending';
        if (event.type === 'capability-ceiling-granted')
            capabilityCeiling = [...new Set(event.capabilities ?? [])];
        return { ...event, ...(event.capabilities ? { capabilities: [...event.capabilities] } : {}) };
    });
    return { schema: ENROLLMENT_PROJECTION_SCHEMA, identity: input.identity, status, capability_ceiling: capabilityCeiling, events };
}
export function evaluateCapabilityGrant(projection, grant) {
    if (grant.node_id !== projection.identity.node_id)
        return { status: 'blocked', reason: 'node-identity-mismatch' };
    if (projection.status === 'revoked')
        return { status: 'blocked', reason: 'node-revoked' };
    if (projection.status !== 'approved')
        return { status: 'blocked', reason: 'enrollment-not-approved' };
    const ceiling = new Set(projection.capability_ceiling);
    const unauthorized = grant.capabilities.find((capability) => !ceiling.has(capability));
    if (unauthorized)
        return { status: 'blocked', reason: 'capability-ceiling-exceeded' };
    return { status: 'allowed', capabilities: [...grant.capabilities] };
}
