import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';

export const NATIVE_OPN_TRACER_CONFORMANCE_REPORT_SCHEMA = 'zj-loop.native_opn_tracer_conformance_report.v1' as const;
export type NativeOpnTracerConformanceReport = {
  schema: typeof NATIVE_OPN_TRACER_CONFORMANCE_REPORT_SCHEMA;
  fixture_version: string;
  network_id: string;
  event_id: string;
  status: 'passed' | 'blocked';
  side_effects_executed: false;
  plan: { plan_id: string; plan_revision: number; plan_digest: string };
  center: { responsibility_unit: 'human' | 'human+agent'; human_id: string };
  phases: Array<{ name: 'enrollment' | 'preflight' | 'execution' | 'relay' | 'aggregation' | 'verification' | 'review-handoff'; status: 'passed' | 'blocked'; reason?: string }>;
  blocking_reasons: string[];
  created_at: string;
  report_digest: string;
};

type Input = Omit<NativeOpnTracerConformanceReport, 'schema' | 'status' | 'side_effects_executed' | 'phases' | 'blocking_reasons' | 'report_digest'> & {
  enrollments: Array<{ node_id: string; network_id: string; status: 'enrolled-active' | 'blocked' }>;
  preflight: { status: 'execution-ready' | 'blocked'; plan_id: string; plan_revision: number; plan_digest: string };
  executions: Array<{ node_id: string; execution_id: string; status: 'succeeded' | 'blocked'; execution_digest: string }>;
  relay_receipts: Array<{ node_id: string; message_id: string; envelope_digest: string; status: 'recorded' | 'blocked' }>;
  aggregation: { status: 'passed' | 'blocked'; aggregation_digest: string };
  verification: { status: 'passed' | 'blocked'; verification_digest: string; aggregation_digest: string; verifier_id: string };
  review_handoff: { status: 'accepted' | 'blocked'; verification_digest: string; aggregation_digest: string; responsible_party: string };
};

function text(value: unknown): value is string { return typeof value === 'string' && value.length > 0; }
function digest(value: unknown): value is string { return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/.test(value); }
function reportDigest(report: Omit<NativeOpnTracerConformanceReport, 'report_digest'>): string { const json = canonicalize(report); if (typeof json !== 'string') throw new Error('native-opn-tracer-conformance-canonicalization-invalid'); return `sha256:${createHash('sha256').update(json).digest('hex')}`; }

export function buildNativeOpnTracerConformanceReport(input: Input): NativeOpnTracerConformanceReport {
  const reasons: string[] = [];
  const nodeIds = input.enrollments.map((node) => node.node_id);
  if (!text(input.fixture_version) || !text(input.network_id) || !text(input.event_id) || !text(input.created_at)) reasons.push('report-identity-invalid');
  if (!['human', 'human+agent'].includes(input.center.responsibility_unit) || !text(input.center.human_id)) reasons.push('center-responsibility-invalid');
  if (input.enrollments.length !== 2 || new Set(nodeIds).size !== 2 || input.enrollments.some((node) => node.network_id !== input.network_id || node.status !== 'enrolled-active')) reasons.push('enrollment-not-closed');
  if (input.preflight.status !== 'execution-ready' || input.preflight.plan_id !== input.plan.plan_id || input.preflight.plan_revision !== input.plan.plan_revision || input.preflight.plan_digest !== input.plan.plan_digest) reasons.push('preflight-plan-binding-mismatch');
  if (input.executions.length !== 2 || new Set(input.executions.map((execution) => execution.node_id)).size !== 2 || input.executions.some((execution) => !nodeIds.includes(execution.node_id) || execution.status !== 'succeeded' || !digest(execution.execution_digest))) reasons.push('execution-not-closed');
  if (input.relay_receipts.length < 2 || new Set(input.relay_receipts.map((receipt) => receipt.node_id)).size < 2 || input.relay_receipts.some((receipt) => !nodeIds.includes(receipt.node_id) || receipt.status !== 'recorded' || !digest(receipt.envelope_digest))) reasons.push('relay-receipt-incomplete');
  if (input.aggregation.status !== 'passed' || !digest(input.aggregation.aggregation_digest)) reasons.push('aggregation-not-passed');
  if (input.verification.status !== 'passed' || !digest(input.verification.verification_digest) || input.verification.aggregation_digest !== input.aggregation.aggregation_digest || nodeIds.includes(input.verification.verifier_id)) reasons.push('verification-not-independent-or-bound');
  if (input.review_handoff.status !== 'accepted' || input.review_handoff.verification_digest !== input.verification.verification_digest || input.review_handoff.aggregation_digest !== input.aggregation.aggregation_digest || input.review_handoff.responsible_party !== input.center.human_id) reasons.push('review-handoff-not-closed');
  const uniqueReasons = [...new Set(reasons)].sort();
  const phaseNames: NativeOpnTracerConformanceReport['phases'][number]['name'][] = ['enrollment', 'preflight', 'execution', 'relay', 'aggregation', 'verification', 'review-handoff'];
  const phases = phaseNames.map((name) => ({ name, status: uniqueReasons.length === 0 ? 'passed' as const : 'blocked' as const, ...(uniqueReasons.length === 0 ? {} : { reason: uniqueReasons.find((reason) => reason.startsWith(name) || (name === 'preflight' && reason.startsWith('preflight')) || (name === 'review-handoff' && reason.startsWith('review-handoff'))) ?? 'conformance-blocked' }) }));
  const unsigned = { schema: NATIVE_OPN_TRACER_CONFORMANCE_REPORT_SCHEMA, fixture_version: input.fixture_version, network_id: input.network_id, event_id: input.event_id, status: uniqueReasons.length === 0 ? 'passed' as const : 'blocked' as const, side_effects_executed: false as const, plan: { ...input.plan }, center: { ...input.center }, phases, blocking_reasons: uniqueReasons, created_at: input.created_at };
  return { ...unsigned, report_digest: reportDigest(unsigned) };
}

export function nativeOpnTracerConformanceReportDigest(report: NativeOpnTracerConformanceReport): string { const { report_digest: _, ...unsigned } = report; return reportDigest(unsigned); }
