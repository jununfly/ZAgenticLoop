import { pairingRequestDigest } from './node-enrollment.js';
function requireText(value, error) {
    if (!value.trim())
        throw new Error(error);
    return value;
}
function bind(request, input) {
    if (request.request_id !== input.request_id || request.network_id !== input.network_id || request.node_id !== input.node_id)
        throw new Error('pairing-record-binding-mismatch');
}
export function createPairingRequestedRecord(input) {
    const digest = pairingRequestDigest(input.request);
    return { type: 'pairing-requested', event_id: `pairing-requested:${input.request.request_id}`, occurred_at: new Date().toISOString(), request_digest: digest, request: input.request };
}
export function createPairingApprovedRecord(input) {
    bind(input.request, input.approval);
    requireText(input.approval.human_id, 'human-id-required');
    return { type: 'human-approved', event_id: `pairing-approved:${input.request.request_id}:${input.approval.human_id}`, occurred_at: input.approval.approved_at, request_id: input.request.request_id, request_digest: input.request.request_digest, human_id: input.approval.human_id, approved_capabilities: [...new Set(input.approval.approved_capabilities)] };
}
export function createPairingRejectedRecord(input) {
    requireText(input.human_id, 'human-id-required');
    requireText(input.reason, 'pairing-rejection-reason-required');
    return { type: 'pairing-rejected', event_id: `pairing-rejected:${input.request.request_id}:${input.human_id}`, occurred_at: input.rejected_at, request_id: input.request.request_id, request_digest: input.request.request_digest, reason: input.reason };
}
export function createPairingExpiredRecord(input) {
    return { type: 'pairing-expired', event_id: `pairing-expired:${input.request.request_id}`, occurred_at: input.expired_at, request_id: input.request.request_id, request_digest: input.request.request_digest };
}
