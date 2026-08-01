import { validateLocalExecutionPreflight, type LocalExecutionPreflight } from './local-execution-preflight.js';

export const EXECUTION_POLICY_DECISION_SCHEMA = 'zj-loop.execution_policy_decision.v1' as const;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const REASONS = [
  'preflight-invalid',
  'approval-invalid',
  'approval-expired',
  'preflight-expired',
  'policy-drift',
  'artifact-persistence-failed',
  'artifact-ref-invalid',
  'provider-protocol-invalid',
  'outcome-uncertain',
] as const;

export type ExecutionPolicyFailureReason = typeof REASONS[number];
export type ExecutionPolicyDecision = {
  schema: typeof EXECUTION_POLICY_DECISION_SCHEMA;
  status: 'provider-completed' | 'outcome-uncertain' | 'blocked';
  outcome: 'confirmed-success' | 'outcome-uncertain';
  network_id: string;
  execution_id: string;
  attempt: number;
  preflight_digest: string;
  approval_digest: string;
  artifact_refs: string[];
  reason_codes: ExecutionPolicyFailureReason[];
  side_effects_executed: false;
};

type PolicyInput = {
  preflight: LocalExecutionPreflight;
  approval: { status: 'accepted' | 'blocked'; preflight_digest: string; approval_digest: string; expires_at: string };
  now: string;
  artifacts: { status: 'persisted' | 'blocked'; refs: string[] };
  process: { status: 'completed' | 'failed' | 'cancelled' | 'timed-out'; success: boolean; exit_code: number | null; signal: string | null };
};

function decision(input: PolicyInput, status: ExecutionPolicyDecision['status'], outcome: ExecutionPolicyDecision['outcome'], reasons: ExecutionPolicyFailureReason[]): ExecutionPolicyDecision {
  return {
    schema: EXECUTION_POLICY_DECISION_SCHEMA,
    status,
    outcome,
    network_id: input.preflight.network_id,
    execution_id: input.preflight.execution_id,
    attempt: input.preflight.attempt,
    preflight_digest: input.preflight.preflight_digest,
    approval_digest: input.approval.approval_digest,
    artifact_refs: [...input.artifacts.refs],
    reason_codes: [...new Set(reasons)].sort(),
    side_effects_executed: false,
  };
}

export function evaluateExecutionPolicy(input: PolicyInput): ExecutionPolicyDecision {
  const reasons: ExecutionPolicyFailureReason[] = [];
  const preflightCheck = validateLocalExecutionPreflight(input.preflight);
  if (preflightCheck.status === 'blocked') reasons.push('preflight-invalid');
  if (input.approval.status !== 'accepted' || !DIGEST.test(input.approval.approval_digest) || !DIGEST.test(input.approval.preflight_digest)) reasons.push('approval-invalid');
  if (input.approval.preflight_digest !== input.preflight.preflight_digest) reasons.push('policy-drift');
  if (!Number.isFinite(Date.parse(input.now)) || !Number.isFinite(Date.parse(input.approval.expires_at)) || Date.parse(input.now) >= Date.parse(input.approval.expires_at)) reasons.push('approval-expired');
  if (!Number.isFinite(Date.parse(input.preflight.expires_at)) || Date.parse(input.now) >= Date.parse(input.preflight.expires_at)) reasons.push('preflight-expired');
  if (!Array.isArray(input.artifacts.refs) || input.artifacts.refs.length === 0 || !input.artifacts.refs.every((ref) => DIGEST.test(ref))) reasons.push('artifact-ref-invalid');
  if (input.artifacts.status !== 'persisted') reasons.push('artifact-persistence-failed');
  if (!['completed', 'failed', 'cancelled', 'timed-out'].includes(input.process.status)) reasons.push('provider-protocol-invalid');
  if (reasons.length > 0) return decision(input, 'blocked', 'outcome-uncertain', reasons);
  if (input.process.status !== 'completed' || input.process.success !== true || input.process.exit_code !== 0 || input.process.signal !== null) return decision(input, 'outcome-uncertain', 'outcome-uncertain', ['outcome-uncertain']);
  return decision(input, 'provider-completed', 'confirmed-success', []);
}
