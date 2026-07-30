export const RELAY_CONTRACT_SCHEMA = 'zj-loop.relay_contract.v1';
function requireId(value, error) {
    if (!value.trim())
        throw new Error(error);
    return value;
}
function time(value, error) {
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed))
        throw new Error(error);
    return parsed;
}
export function createRelaySession(input) {
    requireId(input.session_id, 'session-id-required');
    requireId(input.network_id, 'network-id-required');
    requireId(input.node_id, 'node-id-required');
    requireId(input.credential_id, 'credential-id-required');
    requireId(input.protocol_version, 'protocol-version-required');
    const created = time(input.created_at, 'session-created-time-invalid');
    const credentialExpiry = time(input.credential_expires_at, 'credential-expiry-invalid');
    if (!Number.isInteger(input.max_ttl_ms) || input.max_ttl_ms <= 0)
        throw new Error('session-ttl-invalid');
    const expires = Math.min(created + input.max_ttl_ms, credentialExpiry);
    if (expires <= created)
        throw new Error('session-expired');
    if (input.intent_digest !== undefined && !/^sha256:[0-9a-f]{64}$/.test(input.intent_digest))
        throw new Error('session-intent-digest-invalid');
    const bindingValues = [input.session_request_id, input.dispatch_event_id, input.intent_digest];
    if (bindingValues.some((value) => value !== undefined) && bindingValues.some((value) => value === undefined) || (input.session_request_id !== undefined && !input.session_request_id.trim()) || (input.dispatch_event_id !== undefined && !input.dispatch_event_id.trim()))
        throw new Error('session-dispatch-binding-invalid');
    return { schema: RELAY_CONTRACT_SCHEMA, session_id: input.session_id, network_id: input.network_id, node_id: input.node_id, credential_id: input.credential_id, protocol_version: input.protocol_version, created_at: input.created_at, expires_at: new Date(expires).toISOString(), status: 'active', ...(input.session_request_id === undefined ? {} : { session_request_id: input.session_request_id }), ...(input.dispatch_event_id === undefined ? {} : { dispatch_event_id: input.dispatch_event_id }), ...(input.intent_digest === undefined ? {} : { intent_digest: input.intent_digest }) };
}
export function transitionDelivery(delivery, next) {
    const allowed = {
        offered: ['retry_scheduled', 'accepted', 'blocked', 'rejected'],
        retry_scheduled: ['offered', 'blocked', 'rejected'],
        accepted: ['acknowledged'],
        acknowledged: [],
        blocked: [],
        rejected: [],
    };
    if (delivery.state === next.state)
        return { ...delivery, reason: next.reason ?? delivery.reason };
    if (!allowed[delivery.state].includes(next.state))
        throw new Error('delivery-state-conflict');
    return { ...delivery, state: next.state, reason: next.reason };
}
export function startDeliveryLease(input) {
    requireId(input.attempt_id, 'attempt-id-required');
    const now = time(input.now, 'lease-time-invalid');
    if (!Number.isInteger(input.lease_ms) || input.lease_ms <= 0)
        throw new Error('lease-duration-invalid');
    if (input.delivery.state !== 'offered')
        throw new Error('delivery-not-offered');
    if (input.delivery.lease_expires_at && time(input.delivery.lease_expires_at, 'lease-time-invalid') > now)
        throw new Error('delivery-lease-active');
    return { ...input.delivery, attempt_id: input.attempt_id, lease_expires_at: new Date(now + input.lease_ms).toISOString() };
}
export function acknowledgeDelivery(input) {
    const now = time(input.now, 'ack-time-invalid');
    if (input.delivery.attempt_id !== input.attempt_id)
        throw new Error('delivery-attempt-stale');
    if (!input.delivery.lease_expires_at || time(input.delivery.lease_expires_at, 'lease-time-invalid') <= now)
        throw new Error('delivery-lease-expired');
    if (input.delivery.state !== 'accepted')
        throw new Error('delivery-not-accepted');
    return transitionDelivery(input.delivery, { state: 'acknowledged' });
}
export function scheduleDeliveryRetry(input) {
    time(input.now, 'retry-time-invalid');
    requireId(input.reason, 'retry-reason-required');
    if (!Number.isInteger(input.max_retries) || input.max_retries < 0)
        throw new Error('retry-limit-invalid');
    if (input.delivery.retry_count >= input.max_retries)
        return transitionDelivery(input.delivery, { state: 'blocked', reason: 'transport-retry-limit-exceeded' });
    return { ...transitionDelivery(input.delivery, { state: 'retry_scheduled', reason: input.reason }), retry_count: input.delivery.retry_count + 1, lease_expires_at: undefined };
}
