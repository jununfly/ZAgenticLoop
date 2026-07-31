import { getCapabilityRiskDescriptor } from './protocol-registry.js';
import { validateDispatchIntent } from './dispatch-intent.js';
import { validateDispatchSemanticReview } from './dispatch-semantic-review.js';
export const DISPATCH_GATE_SCHEMA = 'zj-loop.dispatch_gate.v1';
const DIGEST = /^sha256:[0-9a-f]{64}$/;
function error(code, path, message) { return { code, path, message, blocking: true }; }
export function evaluateDispatchGate(input) {
    const errors = [];
    const validation = validateDispatchIntent(input.intent);
    errors.push(...validation.errors.map((item) => ({ ...item, message: item.message })));
    const intent = input.intent;
    if (input.now !== undefined && (!Number.isFinite(Date.parse(input.now)) || Date.parse(input.now) >= Date.parse(intent.expires_at)))
        errors.push(error('dispatch-intent-expired', '$.intent.expires_at', 'DispatchIntent is expired at gate evaluation time'));
    if (input.claim.status !== 'claimed' || input.claim.network_id !== intent.network_id || input.claim.plan_digest !== intent.plan_digest || input.claim.plan_revision !== intent.plan_revision || input.claim.grant_digest !== intent.grant_digest || input.claim.task_id !== intent.task_id || input.claim.node_id !== intent.node_id)
        errors.push(error('claim-binding-invalid', '$.claim', 'claim does not match DispatchIntent'));
    if (input.revalidation.status !== 'passed' || input.revalidation.network_id !== intent.network_id || input.revalidation.plan_id !== intent.plan_id || input.revalidation.plan_digest !== intent.plan_digest || input.revalidation.plan_revision !== intent.plan_revision || input.revalidation.task_id !== intent.task_id || input.revalidation.node_id !== intent.node_id || input.revalidation.grant_digest !== intent.grant_digest)
        errors.push(error('runtime-revalidation-invalid', '$.revalidation', 'Runtime revalidation does not match DispatchIntent'));
    for (const capability of intent.capabilities) {
        const risk = getCapabilityRiskDescriptor(capability);
        if (!risk) {
            errors.push(error('capability-risk-unknown', '$.intent.capabilities', `capability ${capability} has no Risk Registry descriptor`));
            continue;
        }
        if (risk.risk_level === 'review-required') {
            if (!input.verification || input.verification.status !== 'verified' || input.verification.network_id !== intent.network_id || input.verification.plan_id !== intent.plan_id || input.verification.task_id !== intent.task_id || input.verification.plan_digest !== intent.plan_digest || input.verification.plan_revision !== intent.plan_revision || !DIGEST.test(input.verification.aggregation_digest) || !DIGEST.test(input.verification.verification_digest) || input.verification.review_handoff_status !== 'accepted' || !input.verification.review_handoff_digest || !DIGEST.test(input.verification.review_handoff_digest))
                errors.push(error('verification-required', '$.verification', `capability ${capability} requires accepted independent Verification and Review Handoff`));
            else if (input.verification.verifier_id === intent.node_id)
                errors.push(error('verification-not-independent', '$.verification.verifier_id', 'verification cannot be performed by the execution node'));
            if (!input.semantic_review || input.semantic_review.status !== 'passed' || input.semantic_review.intent_digest !== intent.intent_digest || validateDispatchSemanticReview(input.semantic_review).status !== 'valid')
                errors.push(error('semantic-review-required', '$.semantic_review', `capability ${capability} requires a passed independent semantic review`));
        }
        if (risk.risk_level === 'human-approval-required' && (!input.human_approval || input.human_approval.status !== 'accepted' || (input.human_approval.network_id !== undefined && input.human_approval.network_id !== intent.network_id) || (input.human_approval.plan_id !== undefined && input.human_approval.plan_id !== intent.plan_id) || (input.human_approval.task_id !== undefined && input.human_approval.task_id !== intent.task_id) || input.human_approval.plan_digest !== intent.plan_digest || input.human_approval.plan_revision !== intent.plan_revision))
            errors.push(error('human-approval-required', '$.human_approval', `capability ${capability} requires matching Human Approval`));
    }
    errors.sort((left, right) => `${left.path}:${left.code}`.localeCompare(`${right.path}:${right.code}`));
    return { schema: DISPATCH_GATE_SCHEMA, status: errors.length === 0 ? 'dispatch-ready' : 'blocked', side_effects_executed: false, intent_digest: intent.intent_digest, errors };
}
