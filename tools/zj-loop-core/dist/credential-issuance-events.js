const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
function requireText(value, error) {
    if (!value.trim())
        throw new Error(error);
    return value;
}
function requireDigest(value) {
    if (!DIGEST_PATTERN.test(value))
        throw new Error('issuance-digest-invalid');
    return value;
}
function requireTimestamp(value, error) {
    if (!Number.isFinite(Date.parse(value)))
        throw new Error(error);
    return value;
}
function capabilities(values) {
    const result = [...new Set(values)].sort();
    if (result.some((value) => !value.trim()))
        throw new Error('credential-capability-invalid');
    return result;
}
export function createCredentialIssueIntentEvent(input) {
    requireText(input.request_id, 'request-id-required');
    requireText(input.network_id, 'network-id-required');
    requireText(input.node_id, 'node-id-required');
    requireText(input.credential_id, 'credential-id-required');
    requireDigest(input.issuance_digest);
    requireTimestamp(input.issued_at, 'credential-issued-time-invalid');
    requireTimestamp(input.expires_at, 'credential-expiry-invalid');
    requireTimestamp(input.intent_expires_at, 'intent-expiry-invalid');
    const sortedCapabilities = capabilities(input.capabilities);
    return {
        event_id: `credential-issued:${input.request_id}`,
        aggregate_type: 'credential',
        aggregate_id: input.credential_id,
        event_type: 'credential-issued',
        occurred_at: input.issued_at,
        payload: {
            request_id: input.request_id,
            network_id: input.network_id,
            node_id: input.node_id,
            credential_id: input.credential_id,
            issuance_digest: input.issuance_digest,
            capabilities: sortedCapabilities,
            issued_at: input.issued_at,
            expires_at: input.expires_at,
            intent_expires_at: input.intent_expires_at,
        },
    };
}
export function createCredentialClaimEvent(input) {
    requireText(input.request_id, 'request-id-required');
    requireText(input.credential_id, 'credential-id-required');
    requireTimestamp(input.claimed_at, 'credential-claimed-time-invalid');
    return {
        event_id: `credential-claimed:${input.request_id}`,
        aggregate_type: 'credential',
        aggregate_id: input.credential_id,
        event_type: 'credential-claimed',
        occurred_at: input.claimed_at,
        payload: { request_id: input.request_id, credential_id: input.credential_id, claimed_at: input.claimed_at },
    };
}
export function createCredentialRevokeEvent(input) {
    requireText(input.request_id, 'request-id-required');
    requireText(input.credential_id, 'credential-id-required');
    requireText(input.reason, 'credential-revoke-reason-required');
    requireTimestamp(input.revoked_at, 'credential-revoked-time-invalid');
    return {
        event_id: `credential-revoked:${input.request_id}`,
        aggregate_type: 'credential',
        aggregate_id: input.credential_id,
        event_type: 'credential-revoked',
        occurred_at: input.revoked_at,
        payload: { request_id: input.request_id, credential_id: input.credential_id, revoked_at: input.revoked_at, reason: input.reason },
    };
}
export function createCredentialExpireEvent(input) {
    requireText(input.request_id, 'request-id-required');
    requireText(input.credential_id, 'credential-id-required');
    requireTimestamp(input.expired_at, 'credential-expired-time-invalid');
    return {
        event_id: `credential-expired:${input.request_id}`,
        aggregate_type: 'credential',
        aggregate_id: input.credential_id,
        event_type: 'credential-expired',
        occurred_at: input.expired_at,
        payload: { request_id: input.request_id, credential_id: input.credential_id, expired_at: input.expired_at },
    };
}
export function createNodeRevokeEvent(input) {
    requireText(input.request_id, 'request-id-required');
    requireText(input.network_id, 'network-id-required');
    requireText(input.node_id, 'node-id-required');
    requireText(input.reason, 'node-revoke-reason-required');
    requireTimestamp(input.revoked_at, 'node-revoked-time-invalid');
    return {
        event_id: `node-revoked:${input.request_id}`,
        aggregate_type: 'node',
        aggregate_id: input.node_id,
        event_type: 'node-revoked',
        occurred_at: input.revoked_at,
        payload: { request_id: input.request_id, network_id: input.network_id, node_id: input.node_id, revoked_at: input.revoked_at, reason: input.reason },
    };
}
