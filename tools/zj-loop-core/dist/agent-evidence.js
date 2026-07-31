import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
export const NATIVE_AGENT_EVIDENCE_SCHEMA = 'zj-loop.native_agent_evidence.v1';
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const ID = /^[^\s]{1,256}$/;
function id(value) { return typeof value === 'string' && ID.test(value); }
function digest(value) { return typeof value === 'string' && DIGEST.test(value); }
function text(value) { return typeof value === 'string' && value.trim().length > 0 && value.length <= 4096; }
function canonical(value) { const json = canonicalize(value); if (typeof json !== 'string')
    throw new Error('agent-evidence-canonicalization-invalid'); return json; }
function calculate(value) { return `sha256:${createHash('sha256').update(canonical(value), 'utf8').digest('hex')}`; }
export function createNativeAgentEvidence(input) {
    if (!id(input.evidence_id) || !id(input.execution_id) || !id(input.task_id) || !id(input.agent_id) || !id(input.kind) || !digest(input.artifact_ref) || !digest(input.content_sha256) || !Number.isInteger(input.attempt) || input.attempt < 1 || !Array.isArray(input.success_criteria) || input.success_criteria.length === 0 || !input.success_criteria.every(text) || !Number.isFinite(Date.parse(input.observed_at)))
        throw new Error('agent-evidence-input-invalid');
    const value = { schema: NATIVE_AGENT_EVIDENCE_SCHEMA, evidence_id: input.evidence_id, execution_id: input.execution_id, task_id: input.task_id, attempt: input.attempt, agent_id: input.agent_id, kind: input.kind, artifact_ref: input.artifact_ref, content_sha256: input.content_sha256, success_criteria: [...new Set(input.success_criteria)].sort(), observed_at: input.observed_at, status: input.status, side_effects_executed: false };
    if (!['passed', 'failed', 'informational'].includes(value.status))
        throw new Error('agent-evidence-status-invalid');
    return { ...value, evidence_digest: calculate(value) };
}
export function validateNativeAgentEvidence(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return { status: 'blocked', reason: 'agent-evidence-object-invalid' };
    const item = value;
    if (Object.keys(item).some((key) => !['schema', 'evidence_id', 'execution_id', 'task_id', 'attempt', 'agent_id', 'kind', 'artifact_ref', 'content_sha256', 'success_criteria', 'observed_at', 'status', 'side_effects_executed', 'evidence_digest'].includes(key)))
        return { status: 'blocked', reason: 'agent-evidence-field-invalid' };
    try {
        const { schema: _, side_effects_executed: __, evidence_digest: ___, ...input } = item;
        const rebuilt = createNativeAgentEvidence(input);
        if (item.schema !== rebuilt.schema || item.side_effects_executed !== false || item.evidence_digest !== rebuilt.evidence_digest)
            return { status: 'blocked', reason: 'agent-evidence-digest-invalid' };
        return { status: 'valid' };
    }
    catch (error) {
        return { status: 'blocked', reason: error instanceof Error ? error.message : 'agent-evidence-invalid' };
    }
}
