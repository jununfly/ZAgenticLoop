import canonicalize from 'canonicalize';
import { createHash, randomUUID } from 'node:crypto';
import { verifyHumanSignature } from './human-signer.js';
import { getRealAgentDogfoodReviewWarningIds, validateRealAgentDogfoodReviewPackage } from './real-agent-dogfood-review-package.js';
import { appendRealAgentDogfoodEvent, createRealAgentDogfoodTransition } from './real-agent-dogfood-lifecycle.js';
export const REAL_AGENT_DOGFOOD_REVIEW_DECISION_SCHEMA = 'zj-loop.real_agent_dogfood_review_decision.v1';
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const MAX_REQUIREMENTS = 64;
function payloadDigest(payload) { const json = canonicalize(payload); if (typeof json !== 'string')
    throw new Error('real-agent-dogfood-review-decision-canonicalization-invalid'); return `sha256:${createHash('sha256').update(json, 'utf8').digest('hex')}`; }
function payloadBytes(payload) { const json = canonicalize(payload); if (typeof json !== 'string')
    throw new Error('real-agent-dogfood-review-decision-canonicalization-invalid'); return new TextEncoder().encode(json); }
function text(value) { return typeof value === 'string' && value.trim().length > 0; }
function decisionPayload(value) {
    return { schema: value.schema, package_digest: value.package_digest, lifecycle_revision: value.lifecycle_revision, human_id: value.human_id, signer_fingerprint: value.signer_fingerprint, decision: value.decision, comment: value.comment, acknowledged_warning_ids: [...(value.acknowledged_warning_ids ?? [])], revision_requirements: (value.revision_requirements ?? []).map((requirement) => ({ ...requirement, evidence_refs: [...(requirement.evidence_refs ?? [])] })), decided_at: value.decided_at };
}
function normalizeWarningIds(value) {
    const ids = value ?? [];
    if (!Array.isArray(ids) || ids.some((id) => !text(id)) || new Set(ids).size !== ids.length)
        throw new Error('warning-acknowledgement-invalid');
    return [...ids].sort();
}
function normalizeRevisionRequirements(value) {
    const requirements = value ?? [];
    if (!Array.isArray(requirements) || requirements.length > MAX_REQUIREMENTS || requirements.some((requirement) => !requirement || !text(requirement.requirement_id) || !text(requirement.description) || !Array.isArray(requirement.evidence_refs) || !requirement.evidence_refs.every((ref) => DIGEST.test(ref))) || new Set(requirements.map((requirement) => requirement.requirement_id)).size !== requirements.length)
        throw new Error('revision-requirements-invalid');
    return [...requirements].sort((left, right) => left.requirement_id.localeCompare(right.requirement_id)).map((requirement) => ({ requirement_id: requirement.requirement_id, description: requirement.description, evidence_refs: [...requirement.evidence_refs].sort() }));
}
export async function createRealAgentDogfoodReviewDecision(input) {
    if (validateRealAgentDogfoodReviewPackage(input.review_package).status !== 'valid' || input.review_package.available_decisions.includes(input.decision) === false)
        throw new Error('real-agent-dogfood-review-package-not-decisionable');
    if (!input.signer || typeof input.signer.sign !== 'function' || typeof input.signer.getPublicIdentity !== 'function')
        throw new Error('real-agent-dogfood-review-signer-required');
    if (!text(input.comment) || !Number.isFinite(Date.parse(input.decided_at)))
        throw new Error('real-agent-dogfood-review-decision-input-invalid');
    const identity = await input.signer.getPublicIdentity();
    if (identity.schema !== 'zj-loop.human_signer.v1' || identity.algorithm !== 'ECDSA-P256' || !text(identity.human_id) || !/^[0-9a-f]{64}$/.test(identity.public_key_fingerprint))
        throw new Error('real-agent-dogfood-review-identity-invalid');
    if (input.decision === 'accept' && input.review_package.decisionability !== 'ready')
        throw new Error('real-agent-dogfood-review-package-not-decisionable');
    const acknowledged_warning_ids = normalizeWarningIds(input.acknowledged_warning_ids);
    const revision_requirements = normalizeRevisionRequirements(input.revision_requirements);
    const warningIds = getRealAgentDogfoodReviewWarningIds(input.review_package);
    if (input.decision === 'accept' && JSON.stringify(acknowledged_warning_ids) !== JSON.stringify(warningIds))
        throw new Error('warning-acknowledgement-required');
    if (input.decision !== 'request-revision' && revision_requirements.length > 0)
        throw new Error('revision-requirements-unexpected');
    if (input.decision === 'request-revision' && revision_requirements.length === 0)
        throw new Error('revision-requirements-required');
    const payload = { schema: REAL_AGENT_DOGFOOD_REVIEW_DECISION_SCHEMA, package_digest: input.review_package.package_digest, lifecycle_revision: input.review_package.lifecycle_revision, human_id: identity.human_id, signer_fingerprint: identity.public_key_fingerprint, decision: input.decision, comment: input.comment, acknowledged_warning_ids, revision_requirements, decided_at: input.decided_at };
    const signature = await input.signer.sign({ payload: payloadBytes(payload) });
    return { ...payload, canonical_payload_digest: payloadDigest(payload), signature, side_effects_executed: false };
}
export function validateRealAgentDogfoodReviewDecision(input) {
    const value = input.decision;
    const errors = [];
    if (value.schema !== REAL_AGENT_DOGFOOD_REVIEW_DECISION_SCHEMA || !['accept', 'reject', 'request-revision'].includes(value.decision))
        errors.push('schema-or-decision-invalid');
    if (!DIGEST.test(value.package_digest) || !DIGEST.test(value.canonical_payload_digest))
        errors.push('digest-invalid');
    if (!Number.isInteger(value.lifecycle_revision) || value.lifecycle_revision < 1 || !text(value.human_id) || !/^[0-9a-f]{64}$/.test(value.signer_fingerprint) || !text(value.comment) || !Number.isFinite(Date.parse(value.decided_at)))
        errors.push('binding-invalid');
    if (value.side_effects_executed !== false)
        errors.push('safety-boundary-invalid');
    if (!Array.isArray(value.acknowledged_warning_ids) || value.acknowledged_warning_ids.some((id) => !text(id)) || new Set(value.acknowledged_warning_ids).size !== value.acknowledged_warning_ids.length || JSON.stringify(value.acknowledged_warning_ids) !== JSON.stringify([...value.acknowledged_warning_ids].sort()))
        errors.push('warning-acknowledgement-invalid');
    if (!Array.isArray(value.revision_requirements) || value.revision_requirements.length > MAX_REQUIREMENTS || value.revision_requirements.some((requirement) => !requirement || !text(requirement.requirement_id) || !text(requirement.description) || !Array.isArray(requirement.evidence_refs) || !requirement.evidence_refs.every((ref) => DIGEST.test(ref))) || new Set(value.revision_requirements?.map((requirement) => requirement.requirement_id)).size !== value.revision_requirements?.length || JSON.stringify(value.revision_requirements?.map((requirement) => requirement.requirement_id)) !== JSON.stringify([...value.revision_requirements ?? []].map((requirement) => requirement.requirement_id).sort()))
        errors.push('revision-requirements-invalid');
    if (value.package_digest !== input.review_package.package_digest || value.lifecycle_revision !== input.review_package.lifecycle_revision)
        errors.push('review-package-binding-mismatch');
    if (input.identity.human_id !== value.human_id || input.identity.public_key_fingerprint !== value.signer_fingerprint)
        errors.push('human-identity-mismatch');
    if (!value.signature || value.signature.public_key_fingerprint !== value.signer_fingerprint)
        errors.push('signature-binding-mismatch');
    if (value.canonical_payload_digest !== payloadDigest(decisionPayload(value)))
        errors.push('canonical-payload-digest-invalid');
    if (value.decision === 'accept' && JSON.stringify(value.acknowledged_warning_ids) !== JSON.stringify(getRealAgentDogfoodReviewWarningIds(input.review_package)))
        errors.push('warning-acknowledgement-required');
    if (value.decision !== 'request-revision' && value.revision_requirements?.length > 0)
        errors.push('revision-requirements-unexpected');
    if (value.decision === 'request-revision' && value.revision_requirements?.length === 0)
        errors.push('revision-requirements-required');
    if (errors.length === 0 && !verifyHumanSignature({ identity: input.identity, payload: payloadBytes(decisionPayload(value)), signature: value.signature }))
        errors.push('human-signature-invalid');
    return { status: errors.length === 0 ? 'valid' : 'blocked', errors };
}
export async function recordRealAgentDogfoodReviewDecision(input) {
    const validation = validateRealAgentDogfoodReviewDecision({ decision: input.decision, identity: input.identity, review_package: input.review_package });
    if (validation.status === 'blocked')
        throw new Error(`real-agent-dogfood-review-decision-invalid:${validation.errors.join(',')}`);
    if (input.lifecycle.status !== 'review-pending' || input.lifecycle.lifecycle_digest !== input.review_package.lifecycle_digest)
        throw new Error('real-agent-dogfood-review-lifecycle-drift');
    const now = input.now ?? new Date().toISOString();
    const target = input.decision.decision === 'accept' ? 'accepted' : input.decision.decision === 'reject' ? 'rejected' : 'request-revision';
    const first = createRealAgentDogfoodTransition({ lifecycle: input.lifecycle, to: target, event_id: `${input.lifecycle.dogfood_id}:attempt-${input.lifecycle.attempt}:human-review:${input.decision.decision}`, occurred_at: now, fact_digest: input.decision.canonical_payload_digest, reason_code: input.decision.decision === 'accept' ? undefined : `human-${input.decision.decision}`, next_action: input.decision.decision === 'accept' ? 'closeout' : input.decision.decision === 'reject' ? 'closeout' : 'create-new-attempt' });
    const firstResult = await appendRealAgentDogfoodEvent({ stateStore: input.stateStore, expected_revision: input.expected_revision, event: first.event });
    if (firstResult.status === 'conflict' || firstResult.revision === undefined)
        throw new Error('real-agent-dogfood-review-revision-conflict');
    if (target !== 'request-revision')
        return { status: target, revision: firstResult.revision, event: first.event };
    const second = createRealAgentDogfoodTransition({ lifecycle: first.lifecycle, to: 'draft', event_id: `${input.lifecycle.dogfood_id}:attempt-${input.lifecycle.attempt + 1}:draft`, occurred_at: now, fact_digest: input.decision.canonical_payload_digest, next_action: 'prepare-preflight', attempt: input.lifecycle.attempt + 1, execution_id: `execution-${randomUUID()}` });
    const secondResult = await appendRealAgentDogfoodEvent({ stateStore: input.stateStore, expected_revision: firstResult.revision, event: second.event });
    if (secondResult.status === 'conflict' || secondResult.revision === undefined)
        throw new Error('real-agent-dogfood-review-new-draft-conflict');
    return { status: 'request-revision', revision: secondResult.revision, event: second.event };
}
