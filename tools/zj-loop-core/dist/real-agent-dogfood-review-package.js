import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
export const REAL_AGENT_DOGFOOD_REVIEW_PACKAGE_SCHEMA = 'zj-loop.real_agent_dogfood_review_package.v1';
export const REAL_AGENT_DOGFOOD_REVIEW_PACKAGE_EVIDENCE_SCHEMA = 'zj-loop.real_agent_dogfood_review_package_evidence.v1';
export const REAL_AGENT_DOGFOOD_REVIEW_PACKAGE_MAX_BYTES = 256 * 1024;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const PACKAGE_KEYS = new Set(['schema', 'network_id', 'dogfood_id', 'execution_id', 'attempt', 'lifecycle_revision', 'lifecycle_digest', 'provider_id', 'provider_fact_digest', 'verification_digest', 'worktree_path', 'base_commit', 'branch', 'risks', 'available_decisions', 'generated_at', 'goal', 'success_criteria', 'input_manifest_digest', 'result_envelope_digest', 'receipt_digest', 'evidence_refs', 'findings', 'decisionability', 'package_digest']);
const EVIDENCE_REF_KEYS = new Set(['schema', 'digest', 'kind', 'execution_id', 'attempt', 'provenance']);
const FINDING_KEYS = new Set(['finding_id', 'severity', 'claim', 'status', 'key_claim', 'evidence_refs', 'verification_refs']);
const MAX_ITEMS = 256;
const DECISIONS = ['accept', 'reject', 'request-revision'];
function digest(value) {
    const json = canonicalize(value);
    if (typeof json !== 'string')
        throw new Error('real-agent-dogfood-review-package-canonicalization-invalid');
    return `sha256:${createHash('sha256').update(json, 'utf8').digest('hex')}`;
}
function validText(value) { return typeof value === 'string' && value.trim().length > 0; }
function validTime(value) { return validText(value) && Number.isFinite(Date.parse(value)); }
function canonicalBytes(value) {
    const json = canonicalize(value);
    return typeof json === 'string' ? Buffer.byteLength(json, 'utf8') : null;
}
export function isRealAgentDogfoodReviewKeyClaim(finding) {
    return finding.key_claim || finding.severity === 'high' || finding.severity === 'critical';
}
export function getRealAgentDogfoodReviewWarningIds(value) {
    return value.findings.filter((finding) => finding.status === 'warning').map((finding) => finding.finding_id).sort();
}
export function createRealAgentDogfoodReviewPackage(input) {
    const candidate = { schema: REAL_AGENT_DOGFOOD_REVIEW_PACKAGE_SCHEMA, ...input, available_decisions: [...input.available_decisions], risks: [...input.risks], package_digest: '' };
    const { package_digest: _, ...unsigned } = candidate;
    const validation = validateRealAgentDogfoodReviewPackage({ ...candidate, package_digest: digest(unsigned) });
    if (validation.status === 'blocked')
        throw new Error('real-agent-dogfood-review-package-input-invalid');
    return { ...unsigned, package_digest: digest(unsigned) };
}
export function validateRealAgentDogfoodReviewPackage(value) {
    const errors = [];
    if (!value || value.schema !== REAL_AGENT_DOGFOOD_REVIEW_PACKAGE_SCHEMA)
        errors.push('schema-invalid');
    if (!value || Object.keys(value).some((key) => !PACKAGE_KEYS.has(key)))
        errors.push('unknown-field');
    for (const key of ['network_id', 'dogfood_id', 'execution_id', 'provider_id', 'worktree_path', 'base_commit', 'branch'])
        if (!validText(value?.[key]))
            errors.push(`${key}-invalid`);
    if (!Number.isInteger(value?.attempt) || value.attempt < 1 || !Number.isInteger(value?.lifecycle_revision) || value.lifecycle_revision < 1)
        errors.push('revision-invalid');
    for (const key of ['lifecycle_digest', 'provider_fact_digest', 'verification_digest', 'package_digest'])
        if (!DIGEST.test(value?.[key] ?? ''))
            errors.push(`${key}-invalid`);
    if (!Array.isArray(value?.risks) || !value.risks.every(validText))
        errors.push('risks-invalid');
    if (!validText(value?.goal) || !Array.isArray(value?.success_criteria) || value.success_criteria.length > MAX_ITEMS || !value.success_criteria.every(validText))
        errors.push('goal-or-success-criteria-invalid');
    for (const key of ['input_manifest_digest', 'result_envelope_digest', 'receipt_digest'])
        if (!DIGEST.test(value?.[key] ?? ''))
            errors.push(`${key}-invalid`);
    if (!Array.isArray(value?.evidence_refs) || value.evidence_refs.length > MAX_ITEMS || value.evidence_refs.some((ref) => !ref || Object.keys(ref).some((key) => !EVIDENCE_REF_KEYS.has(key)) || ref.schema !== 'zj-loop.real_agent_dogfood_scoped_evidence_ref.v1' || !DIGEST.test(ref.digest) || !validText(ref.kind) || !validText(ref.execution_id) || ref.execution_id !== value.execution_id || ref.attempt !== value.attempt || !Number.isInteger(ref.attempt) || !validText(ref.provenance)))
        errors.push('evidence-refs-invalid');
    if (!Array.isArray(value?.findings) || value.findings.length > MAX_ITEMS)
        errors.push('findings-invalid');
    else {
        const findingIds = new Set();
        for (const finding of value.findings) {
            if (!finding || Object.keys(finding).some((key) => !FINDING_KEYS.has(key)) || !validText(finding.finding_id) || findingIds.has(finding.finding_id) || !['info', 'low', 'medium', 'high', 'critical'].includes(finding.severity) || !validText(finding.claim) || !['verified', 'warning'].includes(finding.status) || typeof finding.key_claim !== 'boolean' || !Array.isArray(finding.evidence_refs) || !finding.evidence_refs.every((ref) => DIGEST.test(ref)) || !Array.isArray(finding.verification_refs) || !finding.verification_refs.every((ref) => DIGEST.test(ref)) || (isRealAgentDogfoodReviewKeyClaim(finding) && finding.status !== 'verified'))
                errors.push('finding-invalid');
            else
                findingIds.add(finding.finding_id);
        }
    }
    if (!['ready', 'blocked'].includes(value?.decisionability ?? ''))
        errors.push('decisionability-invalid');
    if (Array.isArray(value?.findings) && value.findings.every((finding) => finding && validText(finding.finding_id))) {
        const hasUnverifiedKeyClaim = value.findings.some((finding) => isRealAgentDogfoodReviewKeyClaim(finding) && finding.status !== 'verified');
        if (value.decisionability !== (hasUnverifiedKeyClaim ? 'blocked' : 'ready'))
            errors.push('decisionability-policy-mismatch');
    }
    if (JSON.stringify(value?.available_decisions) !== JSON.stringify(DECISIONS))
        errors.push('available-decisions-invalid');
    if (!validTime(value?.generated_at))
        errors.push('generated-at-invalid');
    if (errors.length === 0) {
        const { package_digest: _, ...unsigned } = value;
        if (value.package_digest !== digest(unsigned))
            errors.push('package-digest-invalid');
    }
    if (errors.length === 0 && (canonicalBytes(value) ?? REAL_AGENT_DOGFOOD_REVIEW_PACKAGE_MAX_BYTES + 1) >= REAL_AGENT_DOGFOOD_REVIEW_PACKAGE_MAX_BYTES)
        errors.push('review-package-size-limit-exceeded');
    return { status: errors.length === 0 ? 'valid' : 'blocked', errors };
}
export async function persistRealAgentDogfoodReviewPackage(input) {
    if (validateRealAgentDogfoodReviewPackage(input.review_package).status !== 'valid')
        throw new Error('real-agent-dogfood-review-package-invalid');
    const evidence = await input.evidenceStore.put({ content: JSON.stringify(input.review_package), kind: 'real-agent-dogfood-review-package' });
    return { evidence_digest: evidence.digest, package_digest: input.review_package.package_digest, size: evidence.size, path: evidence.path };
}
export async function readRealAgentDogfoodReviewPackage(input) {
    let value;
    try {
        value = JSON.parse((await input.evidenceStore.read({ digest: input.evidence_digest, actor: input.actor })).toString('utf8'));
    }
    catch (error) {
        if (error instanceof Error && error.message === 'evidence-not-found')
            throw error;
        throw new Error('real-agent-dogfood-review-package-evidence-invalid');
    }
    const validation = validateRealAgentDogfoodReviewPackage(value);
    if (validation.status === 'blocked')
        throw new Error(`real-agent-dogfood-review-package-invalid:${validation.errors.join(',')}`);
    return value;
}
