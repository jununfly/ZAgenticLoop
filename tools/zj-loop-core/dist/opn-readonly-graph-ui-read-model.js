import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
import { validateOpnReadOnlyGraphAtomReviewHandoff } from './opn-readonly-graph-atom.js';
export const OPN_READ_ONLY_GRAPH_UI_READ_MODEL_SCHEMA = 'zj-loop.opn_read_only_graph_ui_read_model.v1';
function digest(value) {
    const json = canonicalize(value);
    if (typeof json !== 'string')
        throw new Error('opn-read-only-graph-ui-canonicalization-invalid');
    return `sha256:${createHash('sha256').update(json, 'utf8').digest('hex')}`;
}
function validDigest(value) { return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/.test(value); }
export function projectOpnReadOnlyGraphUiReadModel(input) {
    if (!input.graph_id.trim() || !input.network_id.trim() || !input.result || !validDigest(input.result.plan_digest) || input.result.side_effects_executed !== false || !Array.isArray(input.result.phases))
        throw new Error('opn-read-only-graph-ui-facts-invalid');
    const result = input.result;
    const pending = result.status === 'awaiting-verification' ? result : undefined;
    const handoff = 'review_handoff' in result ? result.review_handoff : undefined;
    if (handoff && validateOpnReadOnlyGraphAtomReviewHandoff(handoff).status === 'blocked')
        throw new Error('opn-read-only-graph-ui-handoff-invalid');
    const status = pending ? 'awaiting-verification' : handoff?.status === 'pending' ? 'pending-human-review' : handoff?.status === 'approved' ? 'approved' : handoff?.status === 'rejected' ? 'rejected' : result.status === 'passed' ? 'approved' : result.status;
    const blocking_reasons = 'reason' in result && result.reason ? [result.reason] : handoff?.status === 'rejected' ? ['human-rejected'] : [];
    const next_action = status === 'awaiting-verification' ? { kind: 'wait-agent2', label: '等待 Agent2 独立验证' } : status === 'pending-human-review' ? { kind: 'human-review', label: '等待 Human 最终审查' } : status === 'approved' ? { kind: 'done', label: 'Graph Atom 已批准' } : status === 'rejected' ? { kind: 'done', label: 'Graph Atom 已拒绝' } : { kind: 'inspect-blocker', label: '检查阻塞原因' };
    if (pending && !validDigest(pending.verification_request.envelope_digest))
        throw new Error('opn-read-only-graph-ui-transport-digest-invalid');
    const unsigned = { schema: OPN_READ_ONLY_GRAPH_UI_READ_MODEL_SCHEMA, status, side_effects_executed: false, graph_id: input.graph_id, network_id: input.network_id, plan_digest: result.plan_digest, phases: result.phases.map((phase) => ({ ...phase })), ...(pending ? { source_evidence_ref: pending.source_evidence_ref, verification_request: { message_id: pending.verification_request.message_id, target_node_id: pending.verification_request.target_node_id, envelope_digest: pending.verification_request.envelope_digest } } : {}), ...(handoff ? { source_evidence_ref: handoff.source_evidence_ref, verification_evidence_ref: handoff.verification_evidence_ref, ...(handoff.decision ? { decision: { ...handoff.decision } } : {}) } : {}), blocking_reasons, next_action };
    return { ...unsigned, read_model_digest: digest(unsigned) };
}
