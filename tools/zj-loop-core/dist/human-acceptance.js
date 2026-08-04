import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
import { verifyHumanSignature } from './human-signer.js';
import { nativeOpnTracerMergeAuthorizationDigest, validateReviewHandoff } from './review-handoff.js';
export const HUMAN_ACCEPTANCE_SCHEMA = 'zj-loop.human_acceptance.v1';
const DIGEST = /^sha256:[0-9a-f]{64}$/;
function text(value) { return typeof value === 'string' && value.trim().length > 0; }
function validTimestamp(value) { return text(value) && Number.isFinite(Date.parse(value)); }
function payloadDigest(payload) {
    const json = canonicalize(payload);
    if (typeof json !== 'string')
        throw new Error('human-acceptance-canonicalization-invalid');
    return `sha256:${createHash('sha256').update(json, 'utf8').digest('hex')}`;
}
function payloadBytes(payload) {
    const json = canonicalize(payload);
    if (typeof json !== 'string')
        throw new Error('human-acceptance-canonicalization-invalid');
    return new TextEncoder().encode(json);
}
function acceptancePayload(value) {
    return {
        schema: value.schema,
        network_id: value.network_id,
        event_id: value.event_id,
        plan_id: value.plan_id,
        plan_revision: value.plan_revision,
        plan_digest: value.plan_digest,
        review_handoff_digest: value.review_handoff_digest,
        verification_digest: value.verification_digest,
        ...(value.merge_authorization_digest === undefined ? {} : { merge_authorization_digest: value.merge_authorization_digest }),
        human_id: value.human_id,
        signer_fingerprint: value.signer_fingerprint,
        decision: value.decision,
        accepted_at: value.accepted_at,
    };
}
export async function createHumanAcceptance(input) {
    if (!input.signer || typeof input.signer.sign !== 'function' || typeof input.signer.getPublicIdentity !== 'function')
        throw new Error('human-acceptance-signer-required');
    if (validateReviewHandoff(input.handoff).status !== 'valid' || input.handoff.status !== 'accepted')
        throw new Error('human-acceptance-review-not-ready');
    if (!DIGEST.test(input.plan_digest))
        throw new Error('human-acceptance-plan-digest-invalid');
    if (!validTimestamp(input.accepted_at))
        throw new Error('human-acceptance-timestamp-invalid');
    const identity = await input.signer.getPublicIdentity();
    if (identity.schema !== 'zj-loop.human_signer.v1' || identity.algorithm !== 'ECDSA-P256' || !text(identity.human_id) || !DIGEST.test(`sha256:${identity.public_key_fingerprint}`))
        throw new Error('human-acceptance-identity-invalid');
    const payload = {
        schema: HUMAN_ACCEPTANCE_SCHEMA,
        network_id: input.handoff.network_id,
        event_id: input.handoff.event_id,
        plan_id: input.handoff.plan_id,
        plan_revision: input.handoff.plan_revision,
        plan_digest: input.plan_digest,
        review_handoff_digest: input.handoff.handoff_digest,
        verification_digest: input.handoff.verification_digest,
        ...(input.handoff.graph?.merge_authorization === undefined ? {} : { merge_authorization_digest: nativeOpnTracerMergeAuthorizationDigest(input.handoff.graph.merge_authorization) }),
        human_id: identity.human_id,
        signer_fingerprint: identity.public_key_fingerprint,
        decision: 'accepted',
        accepted_at: input.accepted_at,
    };
    const signature = await input.signer.sign({ payload: payloadBytes(payload) });
    return { ...payload, canonical_payload_digest: payloadDigest(payload), signature, side_effects_executed: false };
}
export function validateHumanAcceptance(input) {
    const value = input.acceptance;
    const errors = [];
    if (value.schema !== HUMAN_ACCEPTANCE_SCHEMA || value.decision !== 'accepted')
        errors.push('schema-or-decision-invalid');
    if (!text(value.network_id) || !text(value.event_id) || !text(value.plan_id) || !Number.isInteger(value.plan_revision) || value.plan_revision < 1)
        errors.push('scope-invalid');
    if (!DIGEST.test(value.plan_digest) || !DIGEST.test(value.review_handoff_digest) || !DIGEST.test(value.verification_digest) || !DIGEST.test(value.canonical_payload_digest))
        errors.push('digest-invalid');
    if (!text(value.human_id) || !/^[0-9a-f]{64}$/.test(value.signer_fingerprint) || !validTimestamp(value.accepted_at))
        errors.push('human-identity-or-time-invalid');
    if (value.side_effects_executed !== false)
        errors.push('safety-boundary-invalid');
    if (!value.signature || value.signature.public_key_fingerprint !== value.signer_fingerprint)
        errors.push('signer-fingerprint-mismatch');
    if (input.identity.schema !== 'zj-loop.human_signer.v1' || input.identity.algorithm !== 'ECDSA-P256' || input.identity.human_id !== value.human_id || input.identity.public_key_fingerprint !== value.signer_fingerprint)
        errors.push('human-identity-mismatch');
    if (input.handoff) {
        const handoffCheck = validateReviewHandoff(input.handoff);
        if (handoffCheck.status !== 'valid' || input.handoff.status !== 'accepted')
            errors.push('review-handoff-not-ready');
        if (value.network_id !== input.handoff.network_id || value.event_id !== input.handoff.event_id || value.plan_id !== input.handoff.plan_id || value.plan_revision !== input.handoff.plan_revision)
            errors.push('review-handoff-scope-mismatch');
        if (value.review_handoff_digest !== input.handoff.handoff_digest)
            errors.push('review-handoff-digest-mismatch');
        if (value.verification_digest !== input.handoff.verification_digest)
            errors.push('verification-digest-mismatch');
        if (input.handoff.graph?.merge_authorization !== undefined && value.merge_authorization_digest !== nativeOpnTracerMergeAuthorizationDigest(input.handoff.graph.merge_authorization))
            errors.push('merge-authorization-digest-mismatch');
    }
    const payload = acceptancePayload(value);
    if (value.canonical_payload_digest !== payloadDigest(payload))
        errors.push('canonical-payload-digest-invalid');
    if (errors.length === 0 && !verifyHumanSignature({ identity: input.identity, payload: payloadBytes(payload), signature: value.signature }))
        errors.push('human-signature-invalid');
    if (input.now && validTimestamp(input.now) && validTimestamp(value.accepted_at) && Date.parse(value.accepted_at) > Date.parse(input.now))
        errors.push('accepted-at-in-future');
    return { status: errors.length === 0 ? 'valid' : 'blocked', errors };
}
