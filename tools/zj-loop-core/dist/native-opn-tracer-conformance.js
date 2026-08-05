import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
export const NATIVE_OPN_TRACER_CONFORMANCE_REPORT_SCHEMA = 'zj-loop.native_opn_tracer_conformance_report.v1';
function text(value) { return typeof value === 'string' && value.length > 0; }
function digest(value) { return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/.test(value); }
function reportDigest(report) { const json = canonicalize(report); if (typeof json !== 'string')
    throw new Error('native-opn-tracer-conformance-canonicalization-invalid'); return `sha256:${createHash('sha256').update(json).digest('hex')}`; }
export function buildNativeOpnTracerConformanceReport(input) {
    const reasons = [];
    const nodeIds = input.enrollments.map((node) => node.node_id);
    if (!text(input.fixture_version) || !text(input.network_id) || !text(input.event_id) || !text(input.created_at))
        reasons.push('report-identity-invalid');
    if (!['human', 'human+agent'].includes(input.center.responsibility_unit) || !text(input.center.human_id))
        reasons.push('center-responsibility-invalid');
    if (input.enrollments.length !== 2 || new Set(nodeIds).size !== 2 || input.enrollments.some((node) => node.network_id !== input.network_id || node.status !== 'enrolled-active'))
        reasons.push('enrollment-not-closed');
    if (input.preflight.status !== 'execution-ready' || input.preflight.plan_id !== input.plan.plan_id || input.preflight.plan_revision !== input.plan.plan_revision || input.preflight.plan_digest !== input.plan.plan_digest)
        reasons.push('preflight-plan-binding-mismatch');
    if (input.executions.length !== 2 || new Set(input.executions.map((execution) => execution.node_id)).size !== 2 || input.executions.some((execution) => !nodeIds.includes(execution.node_id) || execution.status !== 'succeeded' || !digest(execution.execution_digest)))
        reasons.push('execution-not-closed');
    if (input.relay_receipts.length < 2 || new Set(input.relay_receipts.map((receipt) => receipt.node_id)).size < 2 || input.relay_receipts.some((receipt) => !nodeIds.includes(receipt.node_id) || receipt.status !== 'recorded' || !digest(receipt.envelope_digest)))
        reasons.push('relay-receipt-incomplete');
    if (input.aggregation.status !== 'passed' || !digest(input.aggregation.aggregation_digest))
        reasons.push('aggregation-not-passed');
    if (input.verification.status !== 'passed' || !digest(input.verification.verification_digest) || input.verification.aggregation_digest !== input.aggregation.aggregation_digest || nodeIds.includes(input.verification.verifier_id))
        reasons.push('verification-not-independent-or-bound');
    if (input.review_handoff.status !== 'accepted' || input.review_handoff.verification_digest !== input.verification.verification_digest || input.review_handoff.aggregation_digest !== input.aggregation.aggregation_digest || input.review_handoff.responsible_party !== input.center.human_id)
        reasons.push('review-handoff-not-closed');
    if (input.graph !== undefined) {
        if (input.graph.merge !== 'merged')
            reasons.push(input.graph.merge === 'outcome-uncertain' ? 'graph-merge-outcome-uncertain' : 'graph-merge-blocked');
        if (input.graph.post_merge_gate !== 'passed')
            reasons.push(input.graph.post_merge_gate === 'outcome-uncertain' ? 'graph-post-merge-outcome-uncertain' : 'graph-post-merge-blocked');
        if (input.graph.cleanup !== 'closed')
            reasons.push(input.graph.cleanup === 'cleanup-unresolved' ? 'graph-cleanup-unresolved' : 'graph-cleanup-outcome-uncertain');
        if (input.graph.replay !== 'idempotent')
            reasons.push('graph-replay-conflict');
    }
    const uniqueReasons = [...new Set(reasons)].sort();
    const phaseNames = ['enrollment', 'preflight', 'execution', 'relay', 'aggregation', 'verification', 'review-handoff', ...(input.graph === undefined ? [] : ['merge', 'post-merge-gate', 'cleanup', 'replay'])];
    const phaseReason = (name) => uniqueReasons.find((reason) => reason.startsWith(name) || (name === 'preflight' && reason.startsWith('preflight')) || (name === 'review-handoff' && reason.startsWith('review-handoff')) || (name === 'merge' && reason.startsWith('graph-merge')) || (name === 'post-merge-gate' && reason.startsWith('graph-post-merge')) || (name === 'cleanup' && reason.startsWith('graph-cleanup')) || (name === 'replay' && reason === 'graph-replay-conflict'));
    const phaseStatus = (name) => {
        const reason = phaseReason(name);
        if (!reason)
            return 'passed';
        return reason.includes('outcome-uncertain') || reason.includes('cleanup-unresolved') ? 'outcome-uncertain' : 'blocked';
    };
    const phases = phaseNames.map((name) => ({ name, status: phaseStatus(name), ...(phaseStatus(name) === 'passed' ? {} : { reason: phaseReason(name) ?? 'conformance-blocked' }) }));
    const status = uniqueReasons.length === 0 ? 'passed' : uniqueReasons.some((reason) => reason.includes('outcome-uncertain') || reason.includes('cleanup-unresolved')) && !uniqueReasons.some((reason) => reason.includes('blocked') || reason.endsWith('-not-closed') || reason.includes('mismatch') || reason.includes('incomplete') || reason.includes('invalid') || reason.includes('conflict')) ? 'outcome-uncertain' : 'blocked';
    const unsigned = { schema: NATIVE_OPN_TRACER_CONFORMANCE_REPORT_SCHEMA, fixture_version: input.fixture_version, network_id: input.network_id, event_id: input.event_id, status, side_effects_executed: false, plan: { ...input.plan }, center: { ...input.center }, phases, blocking_reasons: uniqueReasons, created_at: input.created_at, ...(input.graph === undefined ? {} : { graph: { ...input.graph } }) };
    return { ...unsigned, report_digest: reportDigest(unsigned) };
}
export function nativeOpnTracerConformanceReportDigest(report) { const { report_digest: _, ...unsigned } = report; return reportDigest(unsigned); }
