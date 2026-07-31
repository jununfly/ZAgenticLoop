import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
export const DISPATCH_SEMANTIC_REVIEW_SCHEMA = 'zj-loop.dispatch_semantic_review.v1';
const DIGEST = /^sha256:[0-9a-f]{64}$/;
function digest(value) {
    const json = canonicalize(value);
    if (typeof json !== 'string')
        throw new Error('dispatch-semantic-review-canonicalization-invalid');
    return `sha256:${createHash('sha256').update(json).digest('hex')}`;
}
export function createDispatchSemanticReview(input) {
    const reasons = [];
    const { intent, aggregation, verification, review_handoff: handoff } = input;
    const scopeMatches = (value) => value.network_id === intent.network_id && value.plan_id === intent.plan_id && value.plan_revision === intent.plan_revision && value.task_id === intent.task_id;
    if (aggregation.status !== 'persisted' || !scopeMatches(aggregation) || aggregation.aggregation_digest !== verification.aggregation_digest || !DIGEST.test(aggregation.aggregation_digest))
        reasons.push('aggregation-not-persisted-or-scope-mismatch');
    if (verification.status !== 'verified' || !scopeMatches(verification) || verification.verifier_id === verification.execution_node_id || verification.aggregation_digest !== aggregation.aggregation_digest || !DIGEST.test(verification.verification_digest))
        reasons.push('verification-not-independent-or-scope-mismatch');
    if (handoff.status !== 'accepted' || !scopeMatches(handoff) || handoff.aggregation_digest !== aggregation.aggregation_digest || handoff.verification_digest !== verification.verification_digest || !DIGEST.test(handoff.handoff_digest))
        reasons.push('review-handoff-not-accepted-or-scope-mismatch');
    const unsigned = { schema: DISPATCH_SEMANTIC_REVIEW_SCHEMA, status: reasons.length === 0 ? 'passed' : 'blocked', intent_digest: intent.intent_digest, network_id: intent.network_id, plan_id: intent.plan_id, plan_revision: intent.plan_revision, task_id: intent.task_id, aggregation_digest: aggregation.aggregation_digest, verification_digest: verification.verification_digest, review_handoff_digest: handoff.handoff_digest, verifier_id: verification.verifier_id, execution_node_id: verification.execution_node_id, reasons: [...new Set(reasons)].sort(), side_effects_executed: false };
    return { ...unsigned, review_digest: digest(unsigned) };
}
export function validateDispatchSemanticReview(review) {
    const errors = [];
    if (review.schema !== DISPATCH_SEMANTIC_REVIEW_SCHEMA)
        errors.push('schema-invalid');
    if (!DIGEST.test(review.intent_digest) || !DIGEST.test(review.aggregation_digest) || !DIGEST.test(review.verification_digest) || !DIGEST.test(review.review_handoff_digest) || !DIGEST.test(review.review_digest))
        errors.push('digest-invalid');
    if (review.status === 'passed' && review.reasons.length > 0)
        errors.push('passed-with-reasons');
    if (review.status === 'blocked' && review.reasons.length === 0)
        errors.push('blocked-without-reasons');
    if (review.status === 'passed' && review.execution_node_id === review.verifier_id)
        errors.push('verification-not-independent');
    if (errors.length === 0) {
        const { review_digest: _, ...unsigned } = review;
        if (review.review_digest !== digest(unsigned))
            errors.push('review-digest-invalid');
    }
    return { status: errors.length === 0 ? 'valid' : 'blocked', errors };
}
