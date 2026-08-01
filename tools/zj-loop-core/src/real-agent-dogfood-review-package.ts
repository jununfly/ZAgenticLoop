import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
import type { ContentAddressedEvidenceStore } from './content-addressed-evidence-store.js';

export const REAL_AGENT_DOGFOOD_REVIEW_PACKAGE_SCHEMA = 'zj-loop.real_agent_dogfood_review_package.v1' as const;
export const REAL_AGENT_DOGFOOD_REVIEW_PACKAGE_EVIDENCE_SCHEMA = 'zj-loop.real_agent_dogfood_review_package_evidence.v1' as const;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const DECISIONS = ['accept', 'reject', 'request-revision'] as const;

export type RealAgentDogfoodReviewPackage = {
  schema: typeof REAL_AGENT_DOGFOOD_REVIEW_PACKAGE_SCHEMA;
  network_id: string;
  dogfood_id: string;
  execution_id: string;
  attempt: number;
  lifecycle_revision: number;
  lifecycle_digest: string;
  provider_id: string;
  provider_fact_digest: string;
  verification_digest: string;
  worktree_path: string;
  base_commit: string;
  branch: string;
  risks: string[];
  available_decisions: typeof DECISIONS;
  generated_at: string;
  package_digest: string;
};

type ReviewPackageInput = Omit<RealAgentDogfoodReviewPackage, 'schema' | 'package_digest'>;

function digest(value: Omit<RealAgentDogfoodReviewPackage, 'package_digest'>): string {
  const json = canonicalize(value);
  if (typeof json !== 'string') throw new Error('real-agent-dogfood-review-package-canonicalization-invalid');
  return `sha256:${createHash('sha256').update(json, 'utf8').digest('hex')}`;
}

function validText(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0; }
function validTime(value: unknown): value is string { return validText(value) && Number.isFinite(Date.parse(value)); }

export function createRealAgentDogfoodReviewPackage(input: ReviewPackageInput): RealAgentDogfoodReviewPackage {
  const candidate = { schema: REAL_AGENT_DOGFOOD_REVIEW_PACKAGE_SCHEMA, ...input, available_decisions: [...input.available_decisions] as typeof DECISIONS, risks: [...input.risks], package_digest: '' } as RealAgentDogfoodReviewPackage;
  const { package_digest: _, ...unsigned } = candidate;
  const validation = validateRealAgentDogfoodReviewPackage({ ...candidate, package_digest: digest(unsigned) });
  if (validation.status === 'blocked') throw new Error('real-agent-dogfood-review-package-input-invalid');
  return { ...unsigned, package_digest: digest(unsigned) };
}

export function validateRealAgentDogfoodReviewPackage(value: RealAgentDogfoodReviewPackage): { status: 'valid' | 'blocked'; errors: string[] } {
  const errors: string[] = [];
  if (!value || value.schema !== REAL_AGENT_DOGFOOD_REVIEW_PACKAGE_SCHEMA) errors.push('schema-invalid');
  for (const key of ['network_id', 'dogfood_id', 'execution_id', 'provider_id', 'worktree_path', 'base_commit', 'branch'] as const) if (!validText(value?.[key])) errors.push(`${key}-invalid`);
  if (!Number.isInteger(value?.attempt) || value.attempt < 1 || !Number.isInteger(value?.lifecycle_revision) || value.lifecycle_revision < 1) errors.push('revision-invalid');
  for (const key of ['lifecycle_digest', 'provider_fact_digest', 'verification_digest', 'package_digest'] as const) if (!DIGEST.test(value?.[key] ?? '')) errors.push(`${key}-invalid`);
  if (!Array.isArray(value?.risks) || !value.risks.every(validText)) errors.push('risks-invalid');
  if (JSON.stringify(value?.available_decisions) !== JSON.stringify(DECISIONS)) errors.push('available-decisions-invalid');
  if (!validTime(value?.generated_at)) errors.push('generated-at-invalid');
  if (errors.length === 0) { const { package_digest: _, ...unsigned } = value; if (value.package_digest !== digest(unsigned)) errors.push('package-digest-invalid'); }
  return { status: errors.length === 0 ? 'valid' : 'blocked', errors };
}

export async function persistRealAgentDogfoodReviewPackage(input: { evidenceStore: ContentAddressedEvidenceStore; review_package: RealAgentDogfoodReviewPackage }): Promise<{ evidence_digest: string; package_digest: string; size: number; path: string }> {
  if (validateRealAgentDogfoodReviewPackage(input.review_package).status !== 'valid') throw new Error('real-agent-dogfood-review-package-invalid');
  const evidence = await input.evidenceStore.put({ content: JSON.stringify(input.review_package), kind: 'real-agent-dogfood-review-package' });
  return { evidence_digest: evidence.digest, package_digest: input.review_package.package_digest, size: evidence.size, path: evidence.path };
}

export async function readRealAgentDogfoodReviewPackage(input: { evidenceStore: ContentAddressedEvidenceStore; evidence_digest: string; actor: string }): Promise<RealAgentDogfoodReviewPackage> {
  let value: unknown;
  try { value = JSON.parse((await input.evidenceStore.read({ digest: input.evidence_digest, actor: input.actor })).toString('utf8')); } catch (error) {
    if (error instanceof Error && error.message === 'evidence-not-found') throw error;
    throw new Error('real-agent-dogfood-review-package-evidence-invalid');
  }
  const validation = validateRealAgentDogfoodReviewPackage(value as RealAgentDogfoodReviewPackage);
  if (validation.status === 'blocked') throw new Error(`real-agent-dogfood-review-package-invalid:${validation.errors.join(',')}`);
  return value as RealAgentDogfoodReviewPackage;
}
