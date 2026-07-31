import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
import type { DispatchSemanticReview } from './dispatch-semantic-review.js';

export const NATIVE_OPN_TRACER_EVIDENCE_SET_SCHEMA = 'zj-loop.native_opn_tracer_evidence_set.v1' as const;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
type Scope = { network_id: string; event_id: string; plan_id: string; plan_revision: number; plan_digest: string };
export type NativeOpnTracerEvidenceSet = {
  schema: typeof NATIVE_OPN_TRACER_EVIDENCE_SET_SCHEMA;
  fixture_version: string; network_id: string; event_id: string; status: 'passed' | 'blocked'; side_effects_executed: false;
  plan: { plan_id: string; plan_revision: number; plan_digest: string };
  center: { responsibility_unit: 'human' | 'human+agent'; human_id: string };
  conformance_report_digest: string; semantic_review_digest: string;
  evidence_refs: Array<{ kind: string; artifact_id: string; content_sha256: string }>;
  relay: { receipt_count: number; message_ids: string[]; duplicate_message_ids: string[]; conflict_message_ids: string[]; out_of_order: boolean };
  blocking_reasons: string[]; created_at: string; evidence_set_digest: string;
};
type Input = Omit<NativeOpnTracerEvidenceSet, 'schema' | 'status' | 'side_effects_executed' | 'conformance_report_digest' | 'semantic_review_digest' | 'blocking_reasons' | 'evidence_set_digest'> & {
  conformance_report: { status: 'passed' | 'blocked'; report_digest: string; network_id: string; event_id: string; plan: { plan_id: string; plan_revision: number; plan_digest: string }; };
  semantic_review: Pick<DispatchSemanticReview, 'status' | 'review_digest' | 'intent_digest' | 'aggregation_digest' | 'verification_digest' | 'review_handoff_digest'>;
};
function digest(value: Omit<NativeOpnTracerEvidenceSet, 'evidence_set_digest'>): string { const json = canonicalize(value); if (typeof json !== 'string') throw new Error('native-opn-tracer-evidence-set-canonicalization-invalid'); return `sha256:${createHash('sha256').update(json).digest('hex')}`; }
function scopeMatches(value: Scope, input: Input): boolean { return value.network_id === input.network_id && value.event_id === input.event_id && value.plan_id === input.plan.plan_id && value.plan_revision === input.plan.plan_revision && value.plan_digest === input.plan.plan_digest; }

export function buildNativeOpnTracerEvidenceSet(input: Input): NativeOpnTracerEvidenceSet {
  const reasons: string[] = [];
  if (!scopeMatches({ network_id: input.conformance_report.network_id, event_id: input.conformance_report.event_id, ...input.conformance_report.plan }, input)) reasons.push('conformance-scope-mismatch');
  if (input.conformance_report.status !== 'passed' || !DIGEST.test(input.conformance_report.report_digest)) reasons.push('conformance-report-not-passed');
  if (input.semantic_review.status !== 'passed' || !DIGEST.test(input.semantic_review.review_digest) || !DIGEST.test(input.semantic_review.intent_digest) || !DIGEST.test(input.semantic_review.aggregation_digest) || !DIGEST.test(input.semantic_review.verification_digest) || !DIGEST.test(input.semantic_review.review_handoff_digest)) reasons.push('semantic-review-not-passed');
  if (!Array.isArray(input.evidence_refs) || input.evidence_refs.length === 0 || input.evidence_refs.some((ref) => !ref.kind || !ref.artifact_id || !DIGEST.test(ref.content_sha256)) || new Set(input.evidence_refs.map((ref) => ref.artifact_id)).size !== input.evidence_refs.length) reasons.push('evidence-references-invalid');
  if (!Number.isInteger(input.relay.receipt_count) || input.relay.receipt_count < 2 || new Set(input.relay.message_ids).size !== input.relay.message_ids.length || input.relay.duplicate_message_ids.length > 0 || input.relay.conflict_message_ids.length > 0 || input.relay.out_of_order) reasons.push('relay-delivery-not-converged');
  const blocking_reasons = [...new Set(reasons)].sort();
  const unsigned = { schema: NATIVE_OPN_TRACER_EVIDENCE_SET_SCHEMA, fixture_version: input.fixture_version, network_id: input.network_id, event_id: input.event_id, status: blocking_reasons.length === 0 ? 'passed' as const : 'blocked' as const, side_effects_executed: false as const, plan: { ...input.plan }, center: { ...input.center }, conformance_report_digest: input.conformance_report.report_digest, semantic_review_digest: input.semantic_review.review_digest, evidence_refs: input.evidence_refs.map((ref) => ({ ...ref })), relay: { ...input.relay, message_ids: [...input.relay.message_ids], duplicate_message_ids: [...input.relay.duplicate_message_ids], conflict_message_ids: [...input.relay.conflict_message_ids] }, blocking_reasons, created_at: input.created_at };
  return { ...unsigned, evidence_set_digest: digest(unsigned) };
}

export function nativeOpnTracerEvidenceSetDigest(report: NativeOpnTracerEvidenceSet): string { const { evidence_set_digest: _, ...unsigned } = report; return digest(unsigned); }
