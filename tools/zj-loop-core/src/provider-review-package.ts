import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';

export const PROVIDER_REVIEW_PACKAGE_SCHEMA = 'zj-loop.provider_review_package.v1' as const;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const PACKAGE_KEYS = ['schema', 'network_id', 'task_id', 'execution_id', 'attempt', 'task_summary', 'verification_conditions', 'verification_status', 'policy_evidence', 'file_refs', 'artifact_refs', 'risks', 'unknowns', 'excerpts', 'package_digest'];
const FILE_REF_KEYS = ['repository', 'commit', 'path', 'start_line', 'end_line', 'content_sha256'];
const POLICY_KEYS = ['policy_version', 'rule_ids', 'match_count', 'secret_digests', 'sandbox_policy_digest', 'network_policy_digest'];
const EXCERPT_KEYS = ['source_artifact_digest', 'start_offset', 'end_offset', 'content', 'excerpt_digest'];
const STATUSES = ['passed', 'blocked', 'pending'] as const;

export type ProviderReviewFileRef = { repository: string; commit: string; path: string; start_line: number; end_line: number; content_sha256: string };
export type ProviderReviewExcerpt = { source_artifact_digest: string; start_offset: number; end_offset: number; content: string; excerpt_digest: string };
export type ProviderReviewPolicyEvidence = { policy_version: string; rule_ids: string[]; match_count: number; secret_digests: string[]; sandbox_policy_digest: string; network_policy_digest: string };
export type ProviderReviewPackage = {
  schema: typeof PROVIDER_REVIEW_PACKAGE_SCHEMA;
  network_id: string;
  task_id: string;
  execution_id: string;
  attempt: number;
  task_summary: string;
  verification_conditions: string[];
  verification_status: typeof STATUSES[number];
  policy_evidence: ProviderReviewPolicyEvidence;
  file_refs: ProviderReviewFileRef[];
  artifact_refs: string[];
  risks: string[];
  unknowns: string[];
  excerpts: ProviderReviewExcerpt[];
  package_digest: string;
};

function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function text(value: unknown, max = 4096): value is string { return typeof value === 'string' && value.length > 0 && value.length <= max; }
function digest(value: unknown): value is string { return typeof value === 'string' && DIGEST.test(value); }
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean { return Object.keys(value).length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key)); }
function strings(value: unknown, max = 64): value is string[] { return Array.isArray(value) && value.length <= max && value.every((item) => text(item)); }
function integer(value: unknown, minimum = 0): value is number { return typeof value === 'number' && Number.isInteger(value) && value >= minimum; }
function contentDigest(value: string): string { return 'sha256:' + createHash('sha256').update(value, 'utf8').digest('hex'); }
function unsigned(value: ProviderReviewPackage): Omit<ProviderReviewPackage, 'package_digest'> { const { package_digest: _, ...rest } = value; return rest; }

export function providerReviewPackageDigest(value: Omit<ProviderReviewPackage, 'package_digest'> | ProviderReviewPackage): string {
  const json = canonicalize('package_digest' in value ? unsigned(value as ProviderReviewPackage) : value);
  if (typeof json !== 'string') throw new Error('provider-review-package-canonicalization-invalid');
  return 'sha256:' + createHash('sha256').update(json, 'utf8').digest('hex');
}

function validateFileRef(value: unknown): value is ProviderReviewFileRef {
  if (!record(value) || !exactKeys(value, FILE_REF_KEYS)) return false;
  return text(value.repository, 256) && /^[0-9a-f]{40,64}$/.test(value.commit as string) && text(value.path, 1024) && integer(value.start_line, 1) && integer(value.end_line, value.start_line) && digest(value.content_sha256);
}

function validatePolicy(value: unknown): value is ProviderReviewPolicyEvidence {
  if (!record(value) || !exactKeys(value, POLICY_KEYS)) return false;
  return text(value.policy_version, 128) && strings(value.rule_ids) && integer(value.match_count) && Array.isArray(value.secret_digests) && value.secret_digests.every(digest) && digest(value.sandbox_policy_digest) && digest(value.network_policy_digest);
}

function validateExcerpt(value: unknown): value is ProviderReviewExcerpt {
  if (!record(value) || !exactKeys(value, EXCERPT_KEYS)) return false;
  return digest(value.source_artifact_digest) && integer(value.start_offset) && integer(value.end_offset, value.start_offset) && value.end_offset - value.start_offset <= 4096 && text(value.content, 4096) && digest(value.excerpt_digest) && value.excerpt_digest === contentDigest(value.content);
}

export function validateProviderReviewPackage(value: unknown): { status: 'valid' | 'blocked'; errors: string[] } {
  const errors: string[] = [];
  if (!record(value) || !exactKeys(value, PACKAGE_KEYS)) return { status: 'blocked', errors: ['schema-unknown-or-missing-field'] };
  if (value.schema !== PROVIDER_REVIEW_PACKAGE_SCHEMA) errors.push('schema-invalid');
  if (!text(value.network_id) || !text(value.task_id) || !text(value.execution_id) || !integer(value.attempt, 1) || !text(value.task_summary) || !strings(value.verification_conditions) || !STATUSES.includes(value.verification_status as typeof STATUSES[number])) errors.push('identity-or-verification-invalid');
  if (!validatePolicy(value.policy_evidence)) errors.push('policy-evidence-invalid');
  if (!Array.isArray(value.file_refs) || value.file_refs.length > 64 || !value.file_refs.every(validateFileRef)) errors.push('file-refs-invalid');
  if (!Array.isArray(value.artifact_refs) || value.artifact_refs.length > 64 || !value.artifact_refs.every(digest)) errors.push('artifact-refs-invalid');
  if (!strings(value.risks) || !strings(value.unknowns)) errors.push('risk-or-unknown-invalid');
  if (!Array.isArray(value.excerpts) || value.excerpts.length > 16 || !value.excerpts.every(validateExcerpt)) errors.push('excerpts-invalid');
  if (!digest(value.package_digest)) errors.push('package-digest-invalid');
  if (errors.length === 0 && value.package_digest !== providerReviewPackageDigest(value as ProviderReviewPackage)) errors.push('package-digest-invalid');
  return { status: errors.length === 0 ? 'valid' : 'blocked', errors };
}

export function createProviderReviewPackage(input: Omit<ProviderReviewPackage, 'schema' | 'package_digest'>): ProviderReviewPackage {
  const value = {
    schema: PROVIDER_REVIEW_PACKAGE_SCHEMA,
    network_id: input.network_id,
    task_id: input.task_id,
    execution_id: input.execution_id,
    attempt: input.attempt,
    task_summary: input.task_summary,
    verification_conditions: [...input.verification_conditions],
    verification_status: input.verification_status,
    policy_evidence: { ...input.policy_evidence, rule_ids: [...input.policy_evidence.rule_ids].sort(), secret_digests: [...input.policy_evidence.secret_digests].sort() },
    file_refs: input.file_refs.map((item) => ({ ...item })),
    artifact_refs: [...new Set(input.artifact_refs)].sort(),
    risks: [...new Set(input.risks)].sort(),
    unknowns: [...new Set(input.unknowns)].sort(),
    excerpts: input.excerpts.map((item) => ({ ...item })),
  } as Omit<ProviderReviewPackage, 'package_digest'>;
  const candidate = { ...value, package_digest: providerReviewPackageDigest(value) };
  if (validateProviderReviewPackage(candidate).status === 'blocked') throw new Error('provider-review-package-input-invalid');
  return candidate;
}
