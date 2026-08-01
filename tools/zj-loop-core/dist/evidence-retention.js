import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
export const EVIDENCE_RETENTION_DRY_RUN_SCHEMA = 'zj-loop.evidence_retention_dry_run.v1';
const DIGEST = /^sha256:[0-9a-f]{64}$/;
function digest(value) { return typeof value === 'string' && DIGEST.test(value); }
function reportDigest(value) { const json = canonicalize(value); if (typeof json !== 'string')
    throw new Error('evidence-retention-canonicalization-invalid'); return `sha256:${createHash('sha256').update(json, 'utf8').digest('hex')}`; }
export function buildEvidenceRetentionDryRun(input) {
    if (!input.policy.version || input.policy.purpose !== 'retention-dry-run' || !input.policy.network_id || !Array.isArray(input.policy.task_ids) || input.policy.task_ids.length === 0 || new Set(input.policy.task_ids).size !== input.policy.task_ids.length || input.policy.task_ids.some((taskId) => !taskId) || !digest(input.policy.scope_digest) || !Number.isInteger(input.policy.state_revision) || input.policy.state_revision < 1 || !digest(input.policy.policy_digest) || !Number.isFinite(Date.parse(input.policy.effective_at)) || !Number.isFinite(Date.parse(input.policy.expires_at)) || Date.parse(input.policy.effective_at) >= Date.parse(input.policy.expires_at) || !Number.isFinite(Date.parse(input.now)) || Date.parse(input.now) < Date.parse(input.policy.effective_at) || Date.parse(input.now) >= Date.parse(input.policy.expires_at))
        throw new Error('evidence-retention-input-invalid');
    const items = input.items.map((item) => {
        let decision = 'eligible';
        let reason;
        if (item.network_id !== input.policy.network_id || !input.policy.task_ids.includes(item.task_id)) {
            decision = 'blocked';
            reason = 'retention-policy-scope-mismatch';
        }
        else if (!digest(item.artifact_id) || item.artifact_digest !== item.artifact_id || !digest(item.lifecycle_digest)) {
            decision = 'blocked';
            reason = 'evidence-integrity-invalid';
        }
        else if (item.review_status !== 'accepted') {
            decision = 'blocked';
            reason = 'human-review-not-complete';
        }
        else if (!Number.isFinite(Date.parse(item.retained_until)) || Date.parse(input.now) < Date.parse(item.retained_until)) {
            decision = 'not-due';
            reason = 'retention-window-open';
        }
        return { ...item, decision, ...(reason ? { reason } : {}) };
    }).sort((left, right) => left.artifact_id.localeCompare(right.artifact_id));
    const unsigned = { schema: EVIDENCE_RETENTION_DRY_RUN_SCHEMA, policy: { ...input.policy }, now: input.now, status: items.some((item) => item.decision === 'blocked') ? 'blocked' : 'passed', side_effects_executed: false, items };
    return { ...unsigned, report_digest: reportDigest(unsigned) };
}
export function evidenceRetentionDryRunDigest(value) { const { report_digest: _, ...unsigned } = value; return reportDigest(unsigned); }
