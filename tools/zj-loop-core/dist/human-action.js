import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
import { verifyHumanSignature } from './human-signer.js';
export const HUMAN_ACTION_REQUEST_SCHEMA = 'zj-loop.human_action_request.v1';
export const HUMAN_ACTION_DECISION_SCHEMA = 'zj-loop.human_action_decision.v1';
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const ID = /^[^\s]{1,256}$/;
function text(value, error) {
    if (typeof value !== 'string' || !value.trim())
        throw new Error(error);
}
function id(value, error) {
    if (typeof value !== 'string' || !ID.test(value))
        throw new Error(error);
}
function digest(value) {
    const json = canonicalize(value);
    if (typeof json !== 'string' || Buffer.byteLength(json) > 64 * 1024)
        throw new Error('human-action-payload-too-large');
    return `sha256:${createHash('sha256').update(json, 'utf8').digest('hex')}`;
}
function requestUnsigned(input) {
    return {
        created_at: input.created_at,
        action_type: input.action_type,
        context: input.context,
        evidence_refs: input.evidence_refs.map((ref) => ({ ...ref })),
        expires_at: input.expires_at,
        network_id: input.network_id,
        request_id: input.request_id,
        requester_node_id: input.requester_node_id,
        reason: input.reason,
        schema: HUMAN_ACTION_REQUEST_SCHEMA,
        status: 'pending',
    };
}
function decisionUnsigned(input) {
    return { ...input, schema: HUMAN_ACTION_DECISION_SCHEMA };
}
function signingPayload(input) {
    const json = canonicalize(decisionUnsigned(input));
    if (typeof json !== 'string')
        throw new Error('human-action-decision-canonicalization-failed');
    return new TextEncoder().encode(`ZJ-LOOP/HUMAN-ACTION/DECISION/V1\0${json}`);
}
export function createHumanActionRequest(input) {
    id(input.network_id, 'human-action-network-id-required');
    id(input.request_id, 'human-action-request-id-required');
    text(input.action_type, 'human-action-type-required');
    text(input.reason, 'human-action-reason-required');
    id(input.requester_node_id, 'human-action-requester-node-id-required');
    if (!input.context || typeof input.context !== 'object' || Array.isArray(input.context))
        throw new Error('human-action-context-invalid');
    if (!Array.isArray(input.evidence_refs) || input.evidence_refs.length > 256)
        throw new Error('human-action-evidence-refs-invalid');
    for (const ref of input.evidence_refs) {
        if (!ref || !DIGEST.test(ref.artifact_id) || !['artifact', 'evidence'].includes(ref.kind))
            throw new Error('human-action-evidence-ref-invalid');
    }
    const created = Date.parse(input.created_at);
    const expires = Date.parse(input.expires_at);
    if (!Number.isFinite(created) || !Number.isFinite(expires) || expires <= created)
        throw new Error('human-action-time-invalid');
    return { ...input, schema: HUMAN_ACTION_REQUEST_SCHEMA, status: 'pending', request_digest: digest(requestUnsigned(input)), side_effects_executed: false };
}
export async function createHumanActionDecision(input) {
    if (input.request.schema !== HUMAN_ACTION_REQUEST_SCHEMA)
        throw new Error('human-action-request-invalid');
    if (!['approved', 'rejected'].includes(input.decision))
        throw new Error('human-action-decision-invalid');
    text(input.reason, 'human-action-decision-reason-required');
    const identity = await Promise.resolve(input.signer.getPublicIdentity());
    const unsigned = { network_id: input.request.network_id, request_id: input.request.request_id, request_digest: input.request.request_digest, decision: input.decision, reason: input.reason, human_id: identity.human_id, decided_at: input.decided_at };
    const signature = await input.signer.sign({ payload: signingPayload(unsigned) });
    return { ...unsigned, schema: HUMAN_ACTION_DECISION_SCHEMA, human_identity: identity, signature, decision_digest: digest({ ...unsigned, signature }), side_effects_executed: false };
}
export function verifyHumanActionDecision(input) {
    const { request, decision } = input;
    if (request.schema !== HUMAN_ACTION_REQUEST_SCHEMA || decision.schema !== HUMAN_ACTION_DECISION_SCHEMA)
        return { status: 'blocked', reason: 'human-action-schema-invalid' };
    if (request.request_digest !== digest(requestUnsigned(request)))
        return { status: 'blocked', reason: 'human-action-request-integrity-invalid' };
    if (decision.network_id !== request.network_id || decision.request_id !== request.request_id || decision.request_digest !== request.request_digest)
        return { status: 'blocked', reason: 'human-action-scope-conflict' };
    const now = Date.parse(input.now ?? new Date().toISOString());
    if (!Number.isFinite(now) || now >= Date.parse(request.expires_at))
        return { status: 'blocked', reason: 'human-action-decision-expired' };
    const unsigned = { network_id: decision.network_id, request_id: decision.request_id, request_digest: decision.request_digest, decision: decision.decision, reason: decision.reason, human_id: decision.human_id, decided_at: decision.decided_at };
    if (decision.human_id !== decision.human_identity.human_id || !verifyHumanSignature({ identity: decision.human_identity, payload: signingPayload(unsigned), signature: decision.signature }))
        return { status: 'blocked', reason: 'human-action-decision-signature-invalid' };
    if (decision.decision_digest !== digest({ ...unsigned, signature: decision.signature }) || decision.side_effects_executed !== false)
        return { status: 'blocked', reason: 'human-action-decision-integrity-invalid' };
    return { status: 'valid' };
}
