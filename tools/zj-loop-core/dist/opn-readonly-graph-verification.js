import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
export const OPN_READ_ONLY_GRAPH_VERIFICATION_RESULT_SCHEMA = 'zj-loop.opn_read_only_graph_verification_result.v1';
const DIGEST = /^sha256:[0-9a-f]{64}$/;
function canonical(value) { const result = canonicalize(value); if (typeof result !== 'string')
    throw new Error('opn-read-only-graph-verification-canonicalization-invalid'); return result; }
function digest(value) { return `sha256:${createHash('sha256').update(canonical(value), 'utf8').digest('hex')}`; }
function text(value) { return typeof value === 'string' && value.trim() !== '' && !value.includes('\0'); }
function validDigest(value) { return typeof value === 'string' && DIGEST.test(value); }
export function createOpnReadOnlyGraphVerificationResult(input) {
    if (!text(input.graph_id) || !text(input.network_id) || !text(input.plan_id) || !Number.isInteger(input.plan_revision) || input.plan_revision < 1 || !text(input.task_id) || !validDigest(input.plan_digest) || !validDigest(input.source_evidence_ref) || !validDigest(input.verification_evidence_ref) || !text(input.verifier_node_id) || !['passed', 'blocked', 'outcome-uncertain'].includes(input.status))
        throw new Error('opn-read-only-graph-verification-result-invalid');
    const unsigned = { schema: OPN_READ_ONLY_GRAPH_VERIFICATION_RESULT_SCHEMA, ...input, side_effects_executed: false };
    return Object.freeze({ ...unsigned, result_digest: digest(unsigned) });
}
export function validateOpnReadOnlyGraphVerificationResult(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return { status: 'blocked', reason: 'verification-result-shape-invalid' };
    const item = value;
    if (item.schema !== OPN_READ_ONLY_GRAPH_VERIFICATION_RESULT_SCHEMA || item.side_effects_executed !== false || !text(item.graph_id) || !text(item.network_id) || !text(item.plan_id) || !Number.isInteger(item.plan_revision) || !text(item.task_id) || !validDigest(item.plan_digest) || !validDigest(item.source_evidence_ref) || !validDigest(item.verification_evidence_ref) || !text(item.verifier_node_id) || !['passed', 'blocked', 'outcome-uncertain'].includes(item.status) || !validDigest(item.result_digest))
        return { status: 'blocked', reason: 'verification-result-shape-invalid' };
    const { result_digest: _, ...unsigned } = item;
    return item.result_digest === digest(unsigned) ? { status: 'valid' } : { status: 'blocked', reason: 'verification-result-digest-invalid' };
}
