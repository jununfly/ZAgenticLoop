import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
export const AGENT_REVIEW_HANDOFF_SCHEMA = 'zj-loop.agent_review_handoff.v1';
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const ID = /^[^\s]{1,256}$/;
function id(value) { return typeof value === 'string' && ID.test(value); }
function digest(value) { return typeof value === 'string' && DIGEST.test(value); }
function text(value) { return typeof value === 'string' && value.trim().length > 0 && value.length <= 4096; }
function calculate(value) { const json = canonicalize(value); if (typeof json !== 'string')
    throw new Error('agent-review-handoff-canonicalization-invalid'); return `sha256:${createHash('sha256').update(json, 'utf8').digest('hex')}`; }
export function createAgentReviewHandoff(input) {
    if (!id(input.execution_id) || !id(input.task_id) || !id(input.agent_id) || !Number.isInteger(input.attempt) || input.attempt < 1 || !Array.isArray(input.evidence_refs) || input.evidence_refs.length === 0 || !input.evidence_refs.every(digest) || !['accept', 'reject', 'needs-more-work'].includes(input.recommendation) || !text(input.recommendation_reason) || !Array.isArray(input.risks) || !input.risks.every(text))
        throw new Error('agent-review-handoff-input-invalid');
    const value = { schema: AGENT_REVIEW_HANDOFF_SCHEMA, status: 'review-pending', execution_id: input.execution_id, task_id: input.task_id, attempt: input.attempt, agent_id: input.agent_id, evidence_refs: [...new Set(input.evidence_refs)].sort(), recommendation: input.recommendation, recommendation_reason: input.recommendation_reason, risks: [...new Set(input.risks)].sort(), side_effects_executed: false };
    return { ...value, handoff_digest: calculate(value) };
}
export function validateAgentReviewHandoff(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return { status: 'blocked', reason: 'agent-review-handoff-object-invalid' };
    const item = value;
    if (item.status !== 'review-pending' || item.schema !== AGENT_REVIEW_HANDOFF_SCHEMA || item.side_effects_executed !== false || typeof item.handoff_digest !== 'string' || item.handoff_digest !== calculate({ ...item, handoff_digest: undefined }))
        return { status: 'blocked', reason: 'agent-review-handoff-invalid' };
    return { status: 'valid' };
}
