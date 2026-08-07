import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
import { createTransportEnvelope } from './transport-contract.js';
import { validateOpnReadOnlyGraphVerificationResult } from './opn-readonly-graph-verification.js';
export const OPN_READ_ONLY_GRAPH_ATOM_SCHEMA = 'zj-loop.opn_read_only_graph_atom.v1';
export const OPN_READ_ONLY_GRAPH_ATOM_PHASES = ['source_execution', 'independent_verification', 'human_review'];
const DIGEST = /^sha256:[0-9a-f]{64}$/;
function canonical(value) {
    const result = canonicalize(value);
    if (typeof result !== 'string')
        throw new Error('opn-read-only-graph-canonicalization-invalid');
    return result;
}
function digest(value) {
    return `sha256:${createHash('sha256').update(canonical(value), 'utf8').digest('hex')}`;
}
function text(value) { return typeof value === 'string' && value.trim() !== '' && !value.includes('\0'); }
function requireDigest(value, error) { if (typeof value !== 'string' || !DIGEST.test(value))
    throw new Error(error); }
export function validateOpnReadOnlyGraphAtomReviewHandoff(value) {
    if (!value || value.schema !== 'zj-loop.opn_read_only_graph_review_handoff.v1' || !['pending', 'approved', 'rejected'].includes(value.status) || !text(value.graph_id) || !text(value.network_id) || !DIGEST.test(value.plan_digest) || !DIGEST.test(value.source_evidence_ref) || !DIGEST.test(value.verification_evidence_ref) || !text(value.source_node_id) || !text(value.verifier_node_id))
        return { status: 'blocked', reason: 'opn-read-only-graph-handoff-shape-invalid' };
    if (value.status === 'pending' && value.decision !== undefined || value.status !== 'pending' && (!value.decision || !text(value.decision.reason) || !text(value.decision.human_id) || (value.decision.decision !== 'approved' && value.decision.decision !== 'rejected')))
        return { status: 'blocked', reason: 'opn-read-only-graph-handoff-decision-invalid' };
    const { handoff_digest: _, ...unsigned } = value;
    return value.handoff_digest === digest(unsigned) ? { status: 'valid' } : { status: 'blocked', reason: 'opn-read-only-graph-handoff-digest-invalid' };
}
function unsignedPlan(input) {
    return { ...input, phases: [...input.phases] };
}
export function createOpnReadOnlyGraphAtomPlan(input) {
    if (!text(input.graph_id) || !text(input.network_id) || !text(input.plan_id) || !Number.isInteger(input.plan_revision) || input.plan_revision < 1 || !text(input.task_id) || !text(input.goal) || !text(input.coordinator_id) || !text(input.human_id) || !text(input.source_node_id) || !text(input.verifier_node_id) || input.source_node_id === input.verifier_node_id || input.verifier_node_id === input.coordinator_id)
        throw new Error('opn-read-only-graph-plan-invalid');
    requireDigest(input.snapshot_digest, 'opn-read-only-graph-snapshot-digest-invalid');
    const unsigned = { schema: OPN_READ_ONLY_GRAPH_ATOM_SCHEMA, graph_id: input.graph_id, network_id: input.network_id, plan_id: input.plan_id, plan_revision: input.plan_revision, task_id: input.task_id, goal: input.goal, snapshot_digest: input.snapshot_digest, coordinator_id: input.coordinator_id, human_id: input.human_id, source_node_id: input.source_node_id, verifier_node_id: input.verifier_node_id, execution_mode: 'read-only', phases: OPN_READ_ONLY_GRAPH_ATOM_PHASES };
    return Object.freeze({ ...unsigned, plan_digest: digest(unsigned) });
}
function phaseResult(plan, phases, status, reason) {
    return { schema: OPN_READ_ONLY_GRAPH_ATOM_SCHEMA, status, plan_digest: plan.plan_digest, phases, ...(reason ? { reason } : {}), side_effects_executed: false };
}
async function storeEvidence(input) {
    const stored = await input.artifact_store.put({ bytes: Buffer.from(JSON.stringify(input.payload), 'utf8'), file_name: input.file_name, media_type: 'application/json' });
    requireDigest(stored.metadata.artifact_id, 'opn-read-only-graph-evidence-invalid');
    return stored.metadata.artifact_id;
}
export async function startOpnReadOnlyGraphAtom(input) {
    const source = await input.source();
    if (source.status !== 'passed' || !text(source.findings))
        return phaseResult(input.plan, [{ phase: 'source_execution', status: source.status, ...(source.reason ? { reason: source.reason } : {}) }], source.status, source.reason ?? 'source-execution-not-passed');
    let sourceEvidence;
    try {
        sourceEvidence = await storeEvidence({ artifact_store: input.artifact_store, kind: 'opn-read-only-graph-source', file_name: `${input.plan.task_id}-source.json`, payload: { schema: 'zj-loop.opn_read_only_graph_source_evidence.v1', graph_id: input.plan.graph_id, plan_digest: input.plan.plan_digest, task_id: input.plan.task_id, node_id: input.plan.source_node_id, snapshot_digest: input.plan.snapshot_digest, findings: source.findings } });
    }
    catch {
        return phaseResult(input.plan, [{ phase: 'source_execution', status: 'outcome-uncertain', reason: 'source-evidence-write-failed' }], 'outcome-uncertain', 'source-evidence-write-failed');
    }
    const envelope = createTransportEnvelope({ message_id: `${input.plan.task_id}:verification`, network_id: input.plan.network_id, event_id: `${input.plan.graph_id}:verification`, plan_id: input.plan.plan_id, plan_revision: input.plan.plan_revision, task_id: input.plan.task_id, from_node_id: input.plan.coordinator_id, target_node_id: input.plan.verifier_node_id, notification_kind: 'graph.verification.request', state: 'available', artifact_refs: [{ artifact_id: sourceEvidence, content_sha256: sourceEvidence, kind: 'artifact' }], created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 50 * 60 * 1000).toISOString() });
    let session;
    try {
        session = await input.transport.openSession({ network_id: input.plan.network_id, node_id: input.plan.coordinator_id });
    }
    catch {
        return phaseResult(input.plan, [{ phase: 'source_execution', status: 'passed', evidence_ref: sourceEvidence }, { phase: 'independent_verification', status: 'outcome-uncertain', reason: 'verification-task-route-outcome-uncertain' }], 'outcome-uncertain', 'verification-task-route-outcome-uncertain');
    }
    let sent;
    try {
        sent = await input.transport.send({ session_id: session.session_id, envelope });
        await input.transport.closeSession({ session_id: session.session_id });
    }
    catch {
        return phaseResult(input.plan, [{ phase: 'source_execution', status: 'passed', evidence_ref: sourceEvidence }, { phase: 'independent_verification', status: 'outcome-uncertain', reason: 'verification-task-route-outcome-uncertain' }], 'outcome-uncertain', 'verification-task-route-outcome-uncertain');
    }
    if (sent.status === 'blocked')
        return phaseResult(input.plan, [{ phase: 'source_execution', status: 'passed', evidence_ref: sourceEvidence }, { phase: 'independent_verification', status: 'blocked', reason: 'verification-task-route-blocked' }], 'blocked', 'verification-task-route-blocked');
    return { status: 'awaiting-verification', plan_digest: input.plan.plan_digest, source_evidence_ref: sourceEvidence, verification_request: envelope, phases: [{ phase: 'source_execution', status: 'passed', evidence_ref: sourceEvidence }], side_effects_executed: false };
}
export async function completeOpnReadOnlyGraphAtom(input) {
    if (input.source_evidence_ref !== input.plan.plan_digest && !DIGEST.test(input.source_evidence_ref))
        return phaseResult(input.plan, [{ phase: 'source_execution', status: 'outcome-uncertain', reason: 'source-evidence-reference-invalid' }], 'outcome-uncertain', 'source-evidence-reference-invalid');
    if (input.verification.input_artifact_refs.length !== 1 || input.verification.input_artifact_refs[0] !== input.source_evidence_ref)
        return phaseResult(input.plan, [{ phase: 'source_execution', status: 'passed', evidence_ref: input.source_evidence_ref }, { phase: 'independent_verification', status: 'blocked', reason: 'verification-input-binding-invalid' }], 'blocked', 'verification-input-binding-invalid');
    const verification = input.verification;
    const hasVerificationEvidence = verification.evidence_ref !== undefined && DIGEST.test(verification.evidence_ref);
    if (verification.status !== 'passed' || (!text(verification.findings) && !hasVerificationEvidence))
        return phaseResult(input.plan, [{ phase: 'source_execution', status: 'passed', evidence_ref: input.source_evidence_ref }, { phase: 'independent_verification', status: verification.status, ...(verification.reason ? { reason: verification.reason } : {}) }], verification.status, verification.reason ?? 'independent-verification-not-passed');
    let verificationEvidence;
    try {
        verificationEvidence = verification.evidence_ref ?? await storeEvidence({ artifact_store: input.artifact_store, kind: 'opn-read-only-graph-verification', file_name: `${input.plan.task_id}-verification.json`, payload: { schema: 'zj-loop.opn_read_only_graph_verification_evidence.v1', graph_id: input.plan.graph_id, plan_digest: input.plan.plan_digest, task_id: input.plan.task_id, node_id: input.plan.verifier_node_id, input_artifact_refs: [input.source_evidence_ref], findings: verification.findings } });
        if (!DIGEST.test(verificationEvidence))
            throw new Error('verification-evidence-invalid');
    }
    catch {
        return phaseResult(input.plan, [{ phase: 'source_execution', status: 'passed', evidence_ref: input.source_evidence_ref }, { phase: 'independent_verification', status: 'outcome-uncertain', reason: 'verification-evidence-write-failed' }], 'outcome-uncertain', 'verification-evidence-write-failed');
    }
    const handoffUnsigned = { schema: 'zj-loop.opn_read_only_graph_review_handoff.v1', status: 'pending', graph_id: input.plan.graph_id, network_id: input.plan.network_id, plan_digest: input.plan.plan_digest, source_evidence_ref: input.source_evidence_ref, verification_evidence_ref: verificationEvidence, source_node_id: input.plan.source_node_id, verifier_node_id: input.plan.verifier_node_id };
    const handoff = { ...handoffUnsigned, handoff_digest: digest(handoffUnsigned) };
    const decision = await input.human_decision(handoff);
    if (!text(decision.human_id) || decision.human_id !== input.plan.human_id || !text(decision.reason) || (decision.decision !== 'approved' && decision.decision !== 'rejected'))
        return phaseResult(input.plan, [{ phase: 'source_execution', status: 'passed', evidence_ref: input.source_evidence_ref }, { phase: 'independent_verification', status: 'passed', evidence_ref: verificationEvidence }, { phase: 'human_review', status: 'blocked', reason: 'human-decision-invalid' }], 'blocked', 'human-decision-invalid');
    const finalUnsigned = { ...handoffUnsigned, status: decision.decision, decision };
    const finalHandoff = { ...finalUnsigned, handoff_digest: digest(finalUnsigned) };
    const finalResult = phaseResult(input.plan, [{ phase: 'source_execution', status: 'passed', evidence_ref: input.source_evidence_ref }, { phase: 'independent_verification', status: 'passed', evidence_ref: verificationEvidence }, { phase: 'human_review', status: decision.decision === 'approved' ? 'passed' : 'blocked', reason: decision.decision === 'approved' ? undefined : 'human-rejected' }], decision.decision === 'approved' ? 'passed' : 'blocked', decision.decision === 'approved' ? undefined : 'human-rejected');
    return { ...finalResult, review_handoff: finalHandoff };
}
export async function runOpnReadOnlyGraphAtom(input) {
    const started = await startOpnReadOnlyGraphAtom({ plan: input.plan, artifact_store: input.artifact_store, transport: input.transport, source: input.source });
    if (started.status !== 'awaiting-verification')
        return started;
    const verification = await input.verification({ input_artifact_refs: [started.source_evidence_ref] });
    return completeOpnReadOnlyGraphAtom({ plan: input.plan, artifact_store: input.artifact_store, source_evidence_ref: started.source_evidence_ref, verification: { ...verification, input_artifact_refs: [started.source_evidence_ref] }, human_decision: input.human_decision });
}
export async function completeOpnReadOnlyGraphAtomFromVerificationResult(input) {
    const validation = validateOpnReadOnlyGraphVerificationResult(input.verification_result);
    if (validation.status === 'blocked')
        return phaseResult(input.plan, [{ phase: 'source_execution', status: 'passed', evidence_ref: input.source_evidence_ref }, { phase: 'independent_verification', status: 'blocked', reason: validation.reason }], 'blocked', validation.reason);
    const result = input.verification_result;
    if (result.graph_id !== input.plan.graph_id || result.network_id !== input.plan.network_id || result.plan_id !== input.plan.plan_id || result.plan_revision !== input.plan.plan_revision || result.task_id !== input.plan.task_id || result.plan_digest !== input.plan.plan_digest || result.source_evidence_ref !== input.source_evidence_ref || result.verifier_node_id !== input.plan.verifier_node_id)
        return phaseResult(input.plan, [{ phase: 'source_execution', status: 'passed', evidence_ref: input.source_evidence_ref }, { phase: 'independent_verification', status: 'blocked', reason: 'verification-result-scope-mismatch' }], 'blocked', 'verification-result-scope-mismatch');
    return completeOpnReadOnlyGraphAtom({ plan: input.plan, artifact_store: input.artifact_store, source_evidence_ref: input.source_evidence_ref, verification: { status: result.status, input_artifact_refs: [result.source_evidence_ref], evidence_ref: result.verification_evidence_ref }, human_decision: input.human_decision });
}
