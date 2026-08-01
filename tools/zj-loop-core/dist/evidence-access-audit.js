import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
export const EVIDENCE_ACCESS_AUDIT_SCHEMA = 'zj-loop.evidence_access_audit.v1';
const DIGEST = /^sha256:[0-9a-f]{64}$/;
function reportDigest(value) { const json = canonicalize(value); if (typeof json !== 'string')
    throw new Error('evidence-access-audit-canonicalization-invalid'); return `sha256:${createHash('sha256').update(json, 'utf8').digest('hex')}`; }
export function buildEvidenceAccessAudit(input) {
    if (!input.network_id || !input.task_id || !input.execution_id || input.attempt < 1 || !input.actor || !input.role || !input.purpose || !DIGEST.test(input.authorization_scope_digest) || !Number.isFinite(Date.parse(input.occurred_at)) || !Number.isInteger(input.state_revision) || input.state_revision < 1)
        throw new Error('evidence-access-audit-input-invalid');
    if (input.decision === 'allowed' && (!input.returned_content_digest || !DIGEST.test(input.returned_content_digest)))
        throw new Error('evidence-access-audit-return-digest-invalid');
    const value = { schema: EVIDENCE_ACCESS_AUDIT_SCHEMA, ...input, returned_content_digest: input.decision === 'blocked' ? null : input.returned_content_digest, side_effects_executed: false };
    return { ...value, audit_digest: reportDigest(value) };
}
export function evidenceAccessAuditDigest(value) { const { audit_digest: _, ...unsigned } = value; return reportDigest(unsigned); }
