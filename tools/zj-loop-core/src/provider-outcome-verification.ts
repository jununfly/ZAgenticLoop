import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
import { validateProviderOutcome, type ProviderOutcome } from './provider-outcome.js';

export const PROVIDER_OUTCOME_VERIFICATION_SCHEMA = 'zj-loop.provider_outcome_verification.v1' as const;
export type ProviderOutcomeVerification = {
  schema: typeof PROVIDER_OUTCOME_VERIFICATION_SCHEMA;
  status: 'passed' | 'failed' | 'blocked';
  outcome_digest: string;
  network_id: string;
  event_id: string;
  plan_id: string;
  plan_revision: number;
  execution_id: string;
  task_id: string;
  verifier_id: string;
  verification_conditions: string[];
  satisfied_conditions: string[];
  failed_conditions: string[];
  evidence_digest: string;
  checked_at: string;
  review_handoff_required: true;
  provider_retry_allowed: false;
  side_effects_executed: false;
  verification_digest: string;
};

const DIGEST = /^sha256:[0-9a-f]{64}$/;
function digest(value: Omit<ProviderOutcomeVerification, 'verification_digest'>): string { const json = canonicalize(value); if (typeof json !== 'string') throw new Error('provider-verification-canonicalization-invalid'); return `sha256:${createHash('sha256').update(json).digest('hex')}`; }
function text(value: unknown): value is string { return typeof value === 'string' && value.length > 0; }
function strings(value: unknown): value is string[] { return Array.isArray(value) && value.every(text); }

export function createProviderOutcomeVerification(input: { outcome: ProviderOutcome; verifier_id: string; verification_conditions: string[]; satisfied_conditions: string[]; failed_conditions: string[]; evidence_digest: string; checked_at: string }): ProviderOutcomeVerification {
  const outcomeCheck = validateProviderOutcome(input.outcome);
  if (outcomeCheck.status === 'blocked') throw new Error('provider-verification-outcome-invalid');
  if (input.outcome.outcome !== 'confirmed-success') throw new Error('provider-verification-outcome-not-success');
  if (!text(input.verifier_id) || input.verifier_id === input.outcome.provider_id) throw new Error('provider-verification-independent-verifier-required');
  if (!strings(input.verification_conditions) || input.verification_conditions.length === 0 || !strings(input.satisfied_conditions) || !strings(input.failed_conditions) || !DIGEST.test(input.evidence_digest) || !text(input.checked_at)) throw new Error('provider-verification-input-invalid');
  const conditions = [...new Set(input.verification_conditions)].sort();
  const satisfied = [...new Set(input.satisfied_conditions)].sort();
  const failed = [...new Set(input.failed_conditions)].sort();
  if (satisfied.some((condition) => !conditions.includes(condition)) || failed.some((condition) => !conditions.includes(condition)) || new Set([...satisfied, ...failed]).size !== satisfied.length + failed.length) throw new Error('provider-verification-condition-binding-invalid');
  if (satisfied.length + failed.length !== conditions.length) throw new Error('provider-verification-condition-incomplete');
  const unsigned = { schema: PROVIDER_OUTCOME_VERIFICATION_SCHEMA, status: failed.length === 0 ? 'passed' as const : 'failed' as const, outcome_digest: input.outcome.outcome_digest, network_id: input.outcome.network_id, event_id: input.outcome.event_id, plan_id: input.outcome.plan_id, plan_revision: input.outcome.plan_revision, execution_id: input.outcome.execution_id, task_id: input.outcome.task_id, verifier_id: input.verifier_id, verification_conditions: conditions, satisfied_conditions: satisfied, failed_conditions: failed, evidence_digest: input.evidence_digest, checked_at: input.checked_at, review_handoff_required: true as const, provider_retry_allowed: false as const, side_effects_executed: false as const };
  return { ...unsigned, verification_digest: digest(unsigned) };
}

export function validateProviderOutcomeVerification(value: ProviderOutcomeVerification): { status: 'valid' | 'blocked'; errors: string[] } {
  const errors: string[] = [];
  if (value.schema !== PROVIDER_OUTCOME_VERIFICATION_SCHEMA) errors.push('schema-invalid');
  if (!['passed', 'failed'].includes(value.status)) errors.push('status-invalid');
  if (!DIGEST.test(value.outcome_digest) || !DIGEST.test(value.evidence_digest) || !DIGEST.test(value.verification_digest)) errors.push('digest-invalid');
  if (value.provider_retry_allowed !== false || value.review_handoff_required !== true || value.side_effects_executed !== false) errors.push('safety-boundary-invalid');
  if (!text(value.verifier_id) || !strings(value.verification_conditions) || !strings(value.satisfied_conditions) || !strings(value.failed_conditions)) errors.push('fields-invalid');
  if (value.status === 'passed' && value.failed_conditions.length > 0) errors.push('passed-with-failures');
  if (value.status === 'failed' && value.failed_conditions.length === 0) errors.push('failed-without-failures');
  if (errors.length === 0) { const { verification_digest: _, ...unsigned } = value; if (value.verification_digest !== digest(unsigned)) errors.push('verification-digest-invalid'); }
  return { status: errors.length === 0 ? 'valid' : 'blocked', errors };
}
