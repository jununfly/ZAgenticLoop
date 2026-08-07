import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';

export const OPN_READ_ONLY_GRAPH_VERIFICATION_RESULT_SCHEMA = 'zj-loop.opn_read_only_graph_verification_result.v1' as const;
type Digest = `sha256:${string}`;
const DIGEST = /^sha256:[0-9a-f]{64}$/;

export type OpnReadOnlyGraphVerificationResult = {
  schema: typeof OPN_READ_ONLY_GRAPH_VERIFICATION_RESULT_SCHEMA;
  graph_id: string;
  network_id: string;
  plan_id: string;
  plan_revision: number;
  task_id: string;
  plan_digest: Digest;
  source_evidence_ref: Digest;
  verification_evidence_ref: Digest;
  verifier_node_id: string;
  status: 'passed' | 'blocked' | 'outcome-uncertain';
  result_digest: Digest;
  side_effects_executed: false;
};

function canonical(value: unknown): string { const result = canonicalize(value); if (typeof result !== 'string') throw new Error('opn-read-only-graph-verification-canonicalization-invalid'); return result; }
function digest(value: unknown): Digest { return `sha256:${createHash('sha256').update(canonical(value), 'utf8').digest('hex')}`; }
function text(value: unknown): value is string { return typeof value === 'string' && value.trim() !== '' && !value.includes('\0'); }
function validDigest(value: unknown): value is Digest { return typeof value === 'string' && DIGEST.test(value); }

export function createOpnReadOnlyGraphVerificationResult(input: Omit<OpnReadOnlyGraphVerificationResult, 'schema' | 'result_digest' | 'side_effects_executed'>): OpnReadOnlyGraphVerificationResult {
  if (!text(input.graph_id) || !text(input.network_id) || !text(input.plan_id) || !Number.isInteger(input.plan_revision) || input.plan_revision < 1 || !text(input.task_id) || !validDigest(input.plan_digest) || !validDigest(input.source_evidence_ref) || !validDigest(input.verification_evidence_ref) || !text(input.verifier_node_id) || !['passed', 'blocked', 'outcome-uncertain'].includes(input.status)) throw new Error('opn-read-only-graph-verification-result-invalid');
  const unsigned = { schema: OPN_READ_ONLY_GRAPH_VERIFICATION_RESULT_SCHEMA, ...input, side_effects_executed: false as const };
  return Object.freeze({ ...unsigned, result_digest: digest(unsigned) });
}

export function validateOpnReadOnlyGraphVerificationResult(value: unknown): { status: 'valid' } | { status: 'blocked'; reason: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { status: 'blocked', reason: 'verification-result-shape-invalid' };
  const item = value as OpnReadOnlyGraphVerificationResult;
  if (item.schema !== OPN_READ_ONLY_GRAPH_VERIFICATION_RESULT_SCHEMA || item.side_effects_executed !== false || !text(item.graph_id) || !text(item.network_id) || !text(item.plan_id) || !Number.isInteger(item.plan_revision) || !text(item.task_id) || !validDigest(item.plan_digest) || !validDigest(item.source_evidence_ref) || !validDigest(item.verification_evidence_ref) || !text(item.verifier_node_id) || !['passed', 'blocked', 'outcome-uncertain'].includes(item.status) || !validDigest(item.result_digest)) return { status: 'blocked', reason: 'verification-result-shape-invalid' };
  const { result_digest: _, ...unsigned } = item;
  return item.result_digest === digest(unsigned) ? { status: 'valid' } : { status: 'blocked', reason: 'verification-result-digest-invalid' };
}
