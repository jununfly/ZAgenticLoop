import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
import { validateProviderOutcomeVerification } from './provider-outcome-verification.js';
import { validateNativeOpnTracerVerification } from './native-opn-tracer-verification.js';
export const REVIEW_HANDOFF_SCHEMA = 'zj-loop.review_handoff.v1';
function digest(value) { const json = canonicalize(value); if (typeof json !== 'string')
    throw new Error('review-handoff-canonicalization-invalid'); return `sha256:${createHash('sha256').update(json).digest('hex')}`; }
function text(value) { return typeof value === 'string' && value.length > 0; }
function strings(value) { return Array.isArray(value) && value.every(text); }
function resourceStates(value) { return Array.isArray(value) && value.every((item) => typeof item === 'object' && item !== null && text(item.resource_id) && text(item.last_known_status) && text(item.responsible_party)); }
export function createReviewHandoff(input) {
    const verificationCheck = validateProviderOutcomeVerification(input.verification);
    if (verificationCheck.status === 'blocked')
        throw new Error('review-handoff-verification-invalid');
    if (!text(input.responsible_party) || !text(input.accepted_at) || !strings(input.remaining_risks) || !resourceStates(input.external_resource_states) || typeof input.dependencies_closed !== 'boolean')
        throw new Error('review-handoff-input-invalid');
    const risks = [...new Set(input.remaining_risks)].sort();
    const status = input.verification.status === 'passed' && input.dependencies_closed && risks.length === 0 ? 'accepted' : 'blocked';
    const reason = input.verification.status !== 'passed' ? 'verification-not-passed' : !input.dependencies_closed ? 'dependencies-not-closed' : risks.length > 0 ? 'unresolved-risks' : undefined;
    const unsigned = { schema: REVIEW_HANDOFF_SCHEMA, status, outcome_digest: input.verification.outcome_digest, verification_digest: input.verification.verification_digest, network_id: input.verification.network_id, event_id: input.verification.event_id, plan_id: input.verification.plan_id, plan_revision: input.verification.plan_revision, execution_id: input.verification.execution_id, task_id: input.verification.task_id, dependencies_closed: input.dependencies_closed, remaining_risks: risks, external_resource_states: input.external_resource_states.map((state) => ({ ...state })), responsible_party: input.responsible_party, accepted_at: input.accepted_at, event_completed: false, task_completed: false, side_effects_executed: false, ...(reason === undefined ? {} : { reason }) };
    return { ...unsigned, handoff_digest: digest(unsigned) };
}
export function createNativeOpnTracerReviewHandoff(input) {
    if (validateNativeOpnTracerVerification(input.verification).status === 'blocked')
        throw new Error('review-handoff-native-verification-invalid');
    if (!text(input.responsible_party) || !text(input.accepted_at) || !strings(input.remaining_risks) || !resourceStates(input.external_resource_states) || typeof input.dependencies_closed !== 'boolean')
        throw new Error('review-handoff-input-invalid');
    const risks = [...new Set(input.remaining_risks)].sort();
    const status = input.verification.status === 'passed' && input.dependencies_closed && risks.length === 0 ? 'accepted' : 'blocked';
    const reason = input.verification.status !== 'passed' ? 'verification-not-passed' : !input.dependencies_closed ? 'dependencies-not-closed' : risks.length > 0 ? 'unresolved-risks' : undefined;
    const unsigned = { schema: REVIEW_HANDOFF_SCHEMA, status, outcome_digest: input.verification.aggregation_digest, verification_source: 'native-opn-graph', aggregation_digest: input.verification.aggregation_digest, verification_digest: input.verification.verification_digest, network_id: input.verification.network_id, event_id: input.verification.event_id, plan_id: input.verification.plan_id, plan_revision: input.verification.plan_revision, execution_id: input.verification.aggregation_id, task_id: input.verification.aggregation_id, dependencies_closed: input.dependencies_closed, remaining_risks: risks, external_resource_states: input.external_resource_states.map((state) => ({ ...state })), responsible_party: input.responsible_party, accepted_at: input.accepted_at, event_completed: false, task_completed: false, side_effects_executed: false, ...(reason === undefined ? {} : { reason }) };
    return { ...unsigned, handoff_digest: digest(unsigned) };
}
export function validateReviewHandoff(value) {
    const errors = [];
    if (value.schema !== REVIEW_HANDOFF_SCHEMA || !['accepted', 'blocked'].includes(value.status))
        errors.push('schema-invalid');
    if (value.status === 'accepted' && (value.verification_digest.length === 0 || !value.dependencies_closed || value.remaining_risks.length > 0))
        errors.push('accepted-gate-invalid');
    if (value.event_completed !== false || value.task_completed !== false || value.side_effects_executed !== false)
        errors.push('safety-boundary-invalid');
    if (value.status === 'blocked' && !value.reason)
        errors.push('blocked-reason-missing');
    if (value.verification_source === 'native-opn-graph' && (!text(value.aggregation_digest) || value.aggregation_digest !== value.outcome_digest))
        errors.push('native-graph-aggregation-binding-invalid');
    if (errors.length === 0) {
        const { handoff_digest: _, ...unsigned } = value;
        if (value.handoff_digest !== digest(unsigned))
            errors.push('handoff-digest-invalid');
    }
    return { status: errors.length === 0 ? 'valid' : 'blocked', errors };
}
