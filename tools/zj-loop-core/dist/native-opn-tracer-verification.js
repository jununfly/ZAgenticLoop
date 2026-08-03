import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
export const NATIVE_OPN_TRACER_VERIFICATION_SCHEMA = 'zj-loop.native_opn_tracer_verification.v1';
export const NATIVE_OPN_TRACER_VERIFICATION_RECORDED_SCHEMA = 'zj-loop.native_opn_tracer_verification_recorded.v1';
function text(value) { return typeof value === 'string' && value.length > 0; }
function digest(value) { return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/.test(value); }
function commit(value) { return typeof value === 'string' && /^[0-9a-f]{40}$/.test(value); }
function verifierInputValid(input, excludedNodeIds) {
    return text(input.verifier_execution_id) && !excludedNodeIds.includes(input.verifier_execution_id) && commit(input.source_commit_sha) && Array.isArray(input.source_execution_ids) && input.source_execution_ids.length >= 2 && input.source_execution_ids.every(text) && new Set(input.source_execution_ids).size === input.source_execution_ids.length && !input.source_execution_ids.includes(input.verifier_execution_id) && text(input.verifier_worktree_ref) && !excludedNodeIds.includes(input.verifier_worktree_ref);
}
function graphBindingMatches(verification, aggregation) {
    if (!verification.graph || !Array.isArray(aggregation.execution_ids) || !aggregation.graph || !Array.isArray(aggregation.graph.execution_bindings))
        return false;
    const sourceIds = [...verification.graph.source_execution_ids].sort();
    const aggregationIds = [...aggregation.execution_ids].sort();
    if (sourceIds.join('\0') !== aggregationIds.join('\0'))
        return false;
    if (aggregation.graph.execution_bindings.some((binding) => binding.execution_id === undefined || binding.commit_sha !== verification.graph?.source_commit_sha))
        return false;
    return aggregation.graph.execution_bindings.some((binding) => binding.worktree_ref === verification.graph?.verifier_worktree_ref);
}
function unsigned(verification) { const { verification_digest: _, ...value } = verification; return value; }
function verificationDigest(verification) { const json = canonicalize(unsigned(verification)); if (typeof json !== 'string')
    throw new Error('native-opn-tracer-verification-canonicalization-invalid'); return `sha256:${createHash('sha256').update(json).digest('hex')}`; }
function scopeId(verification) { return [verification.network_id, verification.event_id, verification.plan_id, verification.plan_revision, verification.aggregation_id].join(':'); }
function eventId(verification) { return `native-opn-tracer-verification-recorded:${scopeId(verification)}:${verification.verification_digest}`; }
export function createNativeOpnTracerVerification(input) {
    if (!text(input.network_id) || !text(input.event_id) || !text(input.plan_id) || !Number.isInteger(input.plan_revision) || input.plan_revision < 1 || !digest(input.plan_digest) || !text(input.aggregation_id) || !digest(input.aggregation_digest) || !text(input.verifier_id) || !Array.isArray(input.excluded_node_ids) || !input.excluded_node_ids.every(text) || input.excluded_node_ids.includes(input.verifier_id) || !['passed', 'failed'].includes(input.status) || !Array.isArray(input.conditions) || input.conditions.length === 0 || !input.conditions.every(text) || !Array.isArray(input.satisfied_conditions) || !input.satisfied_conditions.every(text) || !Array.isArray(input.failed_conditions) || !input.failed_conditions.every(text) || !digest(input.evidence_digest) || !text(input.checked_at))
        throw new Error('native-opn-tracer-verifier-invalid');
    if (input.graph !== undefined && !verifierInputValid(input.graph, input.excluded_node_ids))
        throw new Error('native-opn-tracer-verifier-graph-invalid');
    const conditions = [...new Set(input.conditions)].sort();
    const satisfied = [...new Set(input.satisfied_conditions)].sort();
    const failed = [...new Set(input.failed_conditions)].sort();
    if ([...satisfied, ...failed].some((condition) => !conditions.includes(condition)) || satisfied.some((condition) => failed.includes(condition)) || (input.status === 'passed' && failed.length > 0) || (input.status === 'failed' && failed.length === 0))
        throw new Error('native-opn-tracer-verification-conditions-invalid');
    const value = { schema: NATIVE_OPN_TRACER_VERIFICATION_SCHEMA, ...input, excluded_node_ids: [...new Set(input.excluded_node_ids)].sort(), status: input.status, conditions, satisfied_conditions: satisfied, failed_conditions: failed, side_effects_executed: false, verification_digest: '' };
    value.verification_digest = verificationDigest(value);
    return value;
}
export function nativeOpnTracerVerificationDigest(verification) { return verificationDigest(verification); }
export function validateNativeOpnTracerVerification(verification) {
    const errors = [];
    if (verification.schema !== NATIVE_OPN_TRACER_VERIFICATION_SCHEMA)
        errors.push('schema-invalid');
    if (verification.verifier_id.length === 0 || verification.excluded_node_ids.includes(verification.verifier_id))
        errors.push('verifier-identity-invalid');
    if (verification.status === 'passed' && verification.failed_conditions.length > 0)
        errors.push('passed-with-failed-conditions');
    if (verification.status === 'failed' && verification.failed_conditions.length === 0)
        errors.push('failed-without-failed-conditions');
    if (nativeOpnTracerVerificationDigest(verification) !== verification.verification_digest)
        errors.push('verification-digest-invalid');
    return { status: errors.length === 0 ? 'valid' : 'blocked', errors };
}
export async function recordNativeOpnTracerVerification(input) {
    const verification = input.verification;
    const event_id = eventId(verification);
    if (nativeOpnTracerVerificationDigest(verification) !== verification.verification_digest)
        return { schema: NATIVE_OPN_TRACER_VERIFICATION_RECORDED_SCHEMA, status: 'blocked', event_id, side_effects_executed: false, reason: 'native-opn-tracer-verification-digest-invalid' };
    const aggregate_id = scopeId(verification);
    const result = await input.stateStore.runAtomic((transaction) => {
        const aggregation = transaction.database.prepare("SELECT payload_json FROM state_events WHERE network_id = ? AND aggregate_type = 'native-opn-tracer-aggregation' AND aggregate_id = ? AND event_type = 'native-opn-tracer.aggregation.recorded'").get(verification.network_id, [verification.network_id, verification.event_id, verification.plan_id, verification.plan_revision, verification.aggregation_id].join(':'));
        const aggregationPayload = aggregation ? JSON.parse(aggregation.payload_json).aggregation : undefined;
        if (!aggregationPayload || aggregationPayload.aggregation_digest !== verification.aggregation_digest || aggregationPayload.event_id !== verification.event_id || aggregationPayload.plan_id !== verification.plan_id || aggregationPayload.plan_revision !== verification.plan_revision || aggregationPayload.plan_digest !== verification.plan_digest)
            return { status: 'blocked', event_id, current_revision: input.expected_revision, reason: 'aggregation-not-recorded-or-binding-mismatch' };
        if (verification.graph && !graphBindingMatches(verification, aggregationPayload))
            return { status: 'blocked', event_id, current_revision: input.expected_revision, reason: 'verification-graph-binding-mismatch' };
        const existing = transaction.database.prepare("SELECT event_id, payload_json FROM state_events WHERE network_id = ? AND aggregate_type = 'native-opn-tracer-verification' AND aggregate_id = ? AND event_type IN ('native-opn-tracer.verification.passed', 'native-opn-tracer.verification.failed')").get(verification.network_id, aggregate_id);
        if (existing) {
            const payload = JSON.parse(existing.payload_json);
            return payload.verification?.verification_digest === verification.verification_digest && existing.event_id === event_id
                ? { status: 'duplicate', event_id: existing.event_id, current_revision: input.expected_revision }
                : { status: 'conflict', event_id, current_revision: input.expected_revision, reason: 'native-opn-tracer-verification-conflict' };
        }
        const appended = transaction.appendEvent({ network_id: verification.network_id, expected_revision: input.expected_revision, now: input.now, event: { event_id, aggregate_type: 'native-opn-tracer-verification', aggregate_id, event_type: verification.status === 'passed' ? 'native-opn-tracer.verification.passed' : 'native-opn-tracer.verification.failed', occurred_at: verification.checked_at, payload: { schema: NATIVE_OPN_TRACER_VERIFICATION_RECORDED_SCHEMA, verification } } });
        return appended.status === 'recorded' ? { status: 'recorded', event_id, revision: appended.revision, current_revision: appended.current_revision } : { status: appended.status === 'duplicate' ? 'duplicate' : 'conflict', event_id, current_revision: appended.current_revision, reason: appended.reason };
    });
    return { schema: NATIVE_OPN_TRACER_VERIFICATION_RECORDED_SCHEMA, ...result, side_effects_executed: false };
}
