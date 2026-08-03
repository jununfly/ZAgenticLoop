import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';

const DIGEST = /^sha256:[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/i;
const PROFILE = 'provider-neutral-v1' as const;
const REF_KEYS = new Set(['schema', 'digest', 'kind', 'execution_id', 'attempt', 'provenance']);
const RECEIPT_KEYS = new Set(['schema', 'network_id', 'dogfood_id', 'execution_id', 'attempt', 'status', 'input_commit', 'manifest_digest', 'provider_proof_digest', 'verifier_fact_digest', 'review_package_digest', 'evidence_refs', 'receipt_digest']);

export type RedactedRealAgentDogfoodEvidence = { profile: typeof PROFILE; content: string; content_digest: string; redaction_digest: string };
export type RealAgentDogfoodScopedEvidenceRef = { schema: 'zj-loop.real_agent_dogfood_scoped_evidence_ref.v1'; digest: string; kind: string; execution_id: string; attempt: number; provenance: string };
export type RealAgentDogfoodDigestOnlyReceipt = {
  schema: 'zj-loop.real_agent_dogfood_digest_only_receipt.v1';
  network_id: string; dogfood_id: string; execution_id: string; attempt: number;
  status: 'review-pending' | 'blocked' | 'outcome-uncertain'; input_commit: string;
  manifest_digest: string; provider_proof_digest: string; verifier_fact_digest: string;
  review_package_digest: string; evidence_refs: RealAgentDogfoodScopedEvidenceRef[]; receipt_digest: string;
};

function canonical(value: unknown): string { const result = canonicalize(value); if (typeof result !== 'string') throw new Error('real-agent-dogfood-evidence-canonicalization-invalid'); return result; }
function digest(value: string | Uint8Array | unknown): string { const bytes = typeof value === 'string' || value instanceof Uint8Array ? value : canonical(value); return `sha256:${createHash('sha256').update(bytes).digest('hex')}`; }
function text(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0 && !value.includes('\0'); }

export function redactRealAgentDogfoodEvidence(input: { content: string; profile: typeof PROFILE }): RedactedRealAgentDogfoodEvidence {
  if (!input || input.profile !== PROFILE || typeof input.content !== 'string') throw new Error('real-agent-dogfood-redaction-input-invalid');
  const redacted = input.content.replace(/^\s*authorization\s*:\s*bearer.*$/gim, '[REDACTED]').replace(/^\s*(?:private-token|token|password)\s*[:=].*$/gim, '[REDACTED]');
  const unsigned = { profile: PROFILE, content: redacted, content_digest: digest(redacted) };
  return Object.freeze({ ...unsigned, redaction_digest: digest(unsigned) });
}

export function createRealAgentDogfoodScopedEvidenceRef(input: { digest: string; kind: string; execution_id: string; attempt: number; provenance: string }): RealAgentDogfoodScopedEvidenceRef {
  if (!input || !DIGEST.test(input.digest) || !text(input.kind) || !text(input.execution_id) || !Number.isInteger(input.attempt) || input.attempt < 1 || !text(input.provenance)) throw new Error('real-agent-dogfood-scoped-evidence-ref-invalid');
  return Object.freeze({ schema: 'zj-loop.real_agent_dogfood_scoped_evidence_ref.v1', digest: input.digest, kind: input.kind, execution_id: input.execution_id, attempt: input.attempt, provenance: input.provenance });
}

function unsignedReceipt(value: RealAgentDogfoodDigestOnlyReceipt | Omit<RealAgentDogfoodDigestOnlyReceipt, 'receipt_digest'>): Omit<RealAgentDogfoodDigestOnlyReceipt, 'receipt_digest'> { const { receipt_digest: _, ...unsigned } = value as RealAgentDogfoodDigestOnlyReceipt; return unsigned; }

export function createRealAgentDogfoodDigestOnlyReceipt(input: Omit<RealAgentDogfoodDigestOnlyReceipt, 'schema' | 'receipt_digest'> | RealAgentDogfoodDigestOnlyReceipt): RealAgentDogfoodDigestOnlyReceipt {
  const candidate = { schema: 'zj-loop.real_agent_dogfood_digest_only_receipt.v1' as const, ...input } as RealAgentDogfoodDigestOnlyReceipt;
  if (!candidate || Object.keys(candidate).some((key) => !RECEIPT_KEYS.has(key)) || !text(candidate.network_id) || !text(candidate.dogfood_id) || !text(candidate.execution_id) || !Number.isInteger(candidate.attempt) || candidate.attempt < 1 || !['review-pending', 'blocked', 'outcome-uncertain'].includes(candidate.status) || !COMMIT.test(candidate.input_commit) || !DIGEST.test(candidate.manifest_digest) || !DIGEST.test(candidate.provider_proof_digest) || !DIGEST.test(candidate.verifier_fact_digest) || !DIGEST.test(candidate.review_package_digest) || !Array.isArray(candidate.evidence_refs) || candidate.evidence_refs.some((ref) => !ref || Object.keys(ref).some((key) => !REF_KEYS.has(key)) || ref.schema !== 'zj-loop.real_agent_dogfood_scoped_evidence_ref.v1' || !DIGEST.test(ref.digest) || !text(ref.kind) || !text(ref.execution_id) || !Number.isInteger(ref.attempt) || ref.attempt < 1 || !text(ref.provenance))) throw new Error('real-agent-dogfood-digest-only-receipt-invalid');
  const unsigned = unsignedReceipt(candidate);
  if ('receipt_digest' in input && input.receipt_digest !== undefined && input.receipt_digest !== digest(unsigned)) throw new Error('real-agent-dogfood-digest-only-receipt-digest-invalid');
  return Object.freeze({ ...unsigned, receipt_digest: digest(unsigned) });
}
