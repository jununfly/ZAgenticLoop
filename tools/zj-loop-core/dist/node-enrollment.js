import { createHash, X509Certificate } from 'node:crypto';
export const NODE_IDENTITY_SCHEMA = 'zj-loop.node_identity.v1';
export const ENROLLMENT_PROJECTION_SCHEMA = 'zj-loop.enrollment_projection.v1';
export const PAIRING_REQUEST_SCHEMA = 'zj-loop.pairing_request.v1';
export const PAIRING_APPROVAL_SCHEMA = 'zj-loop.pairing_approval.v1';
function requireNonEmpty(value, error) {
    if (!value.trim())
        throw new Error(error);
    return value;
}
function requireTimestamp(value, error) {
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp))
        throw new Error(error);
    return timestamp;
}
export function createPairingRequest(input) {
    requireNonEmpty(input.request_id, 'pairing-request-id-required');
    requireNonEmpty(input.network_id, 'network-id-required');
    requireNonEmpty(input.endpoint, 'pairing-endpoint-required');
    requireTimestamp(input.expires_at, 'pairing-expiry-invalid');
    const capabilities = [...new Set(input.requested_capabilities)];
    if (capabilities.some((capability) => !capability.trim()))
        throw new Error('pairing-capability-invalid');
    const rebuiltIdentity = buildNodeIdentity({
        certificate_pem: input.identity.certificate_pem,
        display_name: input.identity.display_name,
        agent_kind: input.identity.agent_kind,
        agent_version: input.identity.agent_version,
    });
    if (input.identity.node_id !== rebuiltIdentity.node_id || input.identity.certificate_sha256 !== rebuiltIdentity.certificate_sha256) {
        throw new Error('pairing-node-identity-invalid');
    }
    return {
        schema: PAIRING_REQUEST_SCHEMA,
        request_id: input.request_id,
        network_id: input.network_id,
        node_id: input.identity.node_id,
        identity: input.identity,
        endpoint: input.endpoint,
        requested_capabilities: capabilities,
        expires_at: input.expires_at,
    };
}
export function approvePairingRequest(input) {
    requireNonEmpty(input.human_id, 'human-id-required');
    const approvedAt = requireTimestamp(input.approved_at, 'pairing-approval-time-invalid');
    const requestExpiry = requireTimestamp(input.request.expires_at, 'pairing-expiry-invalid');
    if (approvedAt > requestExpiry)
        throw new Error('pairing-request-expired');
    const requested = new Set(input.request.requested_capabilities);
    const approved = [...new Set(input.approved_capabilities)];
    if (approved.some((capability) => !capability.trim()))
        throw new Error('pairing-capability-invalid');
    if (approved.some((capability) => !requested.has(capability)))
        throw new Error('pairing-capability-exceeded');
    return {
        schema: PAIRING_APPROVAL_SCHEMA,
        approval_id: `${input.request.request_id}:${input.human_id}:${input.approved_at}`,
        request_id: input.request.request_id,
        network_id: input.request.network_id,
        node_id: input.request.node_id,
        human_id: input.human_id,
        approved_capabilities: approved,
        approved_at: input.approved_at,
        request_expires_at: input.request.expires_at,
    };
}
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
