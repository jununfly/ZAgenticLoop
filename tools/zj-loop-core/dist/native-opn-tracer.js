import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
export const NATIVE_OPN_TRACER_EVIDENCE_SCHEMA = 'zj-loop.native_opn_tracer_evidence.v1';
function text(value) { return typeof value === 'string' && value.length > 0; }
function digest(value) { return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/.test(value); }
function evidenceDigest(value) {
    const json = canonicalize(value);
    if (typeof json !== 'string')
        throw new Error('native-opn-tracer-canonicalization-invalid');
    return `sha256:${createHash('sha256').update(json).digest('hex')}`;
}
function validateInput(input) {
    const errors = [];
    if (!text(input.fixture_version) || !text(input.network_id) || !text(input.event_id) || !text(input.created_at))
        errors.push('identity-invalid');
    if (!text(input.plan.plan_id) || !Number.isInteger(input.plan.plan_revision) || input.plan.plan_revision < 1 || !digest(input.plan.plan_digest))
        errors.push('plan-binding-invalid');
    if (!['human', 'human+agent'].includes(input.center.responsibility_unit) || !text(input.center.human_id))
        errors.push('center-responsibility-invalid');
    if (input.execution_nodes.length !== 2)
        errors.push('two-execution-nodes-required');
    const nodeIds = new Set(input.execution_nodes.map((node) => node.node_id));
    const taskIds = new Set(input.execution_nodes.map((node) => node.task_id));
    const executionIds = new Set(input.execution_nodes.map((node) => node.execution_id));
    if (nodeIds.size !== input.execution_nodes.length || taskIds.size !== input.execution_nodes.length || executionIds.size !== input.execution_nodes.length)
        errors.push('execution-identity-not-independent');
    for (const node of input.execution_nodes)
        if (!text(node.node_id) || !text(node.task_id) || !text(node.execution_id) || !digest(node.output_evidence_digest) || !['passed', 'blocked'].includes(node.status))
            errors.push('execution-evidence-invalid');
    if (!taskIds.has(input.dependency.from_task_id) || !taskIds.has(input.dependency.to_task_id) || input.dependency.from_task_id === input.dependency.to_task_id || !text(input.dependency.artifact_ref))
        errors.push('dependency-invalid');
    if (input.resource_isolation.length !== input.execution_nodes.length)
        errors.push('resource-isolation-incomplete');
    for (const isolation of input.resource_isolation)
        if (!nodeIds.has(isolation.node_id) || !text(isolation.resource_id) || !text(isolation.strategy) || isolation.status !== 'verified' || !text(isolation.isolation_ref))
            errors.push('resource-isolation-invalid');
    const isolationRefs = new Set(input.resource_isolation.map((item) => `${item.resource_id}:${item.isolation_ref}`));
    if (isolationRefs.size !== input.resource_isolation.length)
        errors.push('resource-isolation-duplicate');
    const outputDigests = input.execution_nodes.map((node) => node.output_evidence_digest).sort();
    if (input.aggregation.status !== 'passed' || !digest(input.aggregation.output_evidence_digest) || input.aggregation.input_evidence_digests.slice().sort().join('\0') !== outputDigests.join('\0'))
        errors.push('aggregation-incomplete');
    if (input.verification.status !== 'passed' || !digest(input.verification.evidence_digest))
        errors.push('verification-incomplete');
    if (input.review_handoff.status !== 'accepted' || !text(input.review_handoff.responsible_party))
        errors.push('review-handoff-incomplete');
    if (input.execution_nodes.some((node) => node.status !== 'passed'))
        errors.push('execution-blocked');
    return [...new Set(errors)].sort();
}
export function buildNativeOpnTracerEvidence(input) {
    const blocking_reasons = validateInput(input);
    const unsigned = {
        schema: NATIVE_OPN_TRACER_EVIDENCE_SCHEMA,
        fixture_version: input.fixture_version,
        network_id: input.network_id,
        event_id: input.event_id,
        status: blocking_reasons.length === 0 ? 'passed' : 'blocked',
        side_effects_executed: false,
        plan: { ...input.plan },
        center: { ...input.center },
        execution_nodes: input.execution_nodes.map((node) => ({ ...node })),
        dependency: { ...input.dependency },
        resource_isolation: input.resource_isolation.map((isolation) => ({ ...isolation })),
        aggregation: { ...input.aggregation, input_evidence_digests: [...input.aggregation.input_evidence_digests] },
        verification: { ...input.verification },
        review_handoff: { ...input.review_handoff },
        blocking_reasons,
        created_at: input.created_at,
    };
    return { ...unsigned, evidence_digest: evidenceDigest(unsigned) };
}
export function nativeOpnTracerEvidenceDigest(evidence) {
    const { evidence_digest: _, ...unsigned } = evidence;
    return evidenceDigest(unsigned);
}
