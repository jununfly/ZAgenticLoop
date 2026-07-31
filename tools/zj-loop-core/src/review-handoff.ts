import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
import { validateProviderOutcomeVerification, type ProviderOutcomeVerification } from './provider-outcome-verification.js';

export const REVIEW_HANDOFF_SCHEMA = 'zj-loop.review_handoff.v1' as const;
export type ExternalResourceState = { resource_id: string; last_known_status: string; responsible_party: string };
export type ReviewHandoffRecord = {
  schema: typeof REVIEW_HANDOFF_SCHEMA;
  status: 'accepted' | 'blocked';
  outcome_digest: string;
  verification_digest: string;
  network_id: string;
  event_id: string;
  plan_id: string;
  plan_revision: number;
  execution_id: string;
  task_id: string;
  dependencies_closed: boolean;
  remaining_risks: string[];
  external_resource_states: ExternalResourceState[];
  responsible_party: string;
  accepted_at: string;
  event_completed: false;
  task_completed: false;
  side_effects_executed: false;
  handoff_digest: string;
  reason?: 'verification-not-passed' | 'dependencies-not-closed' | 'unresolved-risks';
};

function digest(value: Omit<ReviewHandoffRecord, 'handoff_digest'>): string { const json = canonicalize(value); if (typeof json !== 'string') throw new Error('review-handoff-canonicalization-invalid'); return `sha256:${createHash('sha256').update(json).digest('hex')}`; }
function text(value: unknown): value is string { return typeof value === 'string' && value.length > 0; }
function strings(value: unknown): value is string[] { return Array.isArray(value) && value.every(text); }
function resourceStates(value: unknown): value is ExternalResourceState[] { return Array.isArray(value) && value.every((item) => typeof item === 'object' && item !== null && text((item as ExternalResourceState).resource_id) && text((item as ExternalResourceState).last_known_status) && text((item as ExternalResourceState).responsible_party)); }

export function createReviewHandoff(input: { verification: ProviderOutcomeVerification; dependencies_closed: boolean; remaining_risks: string[]; external_resource_states: ExternalResourceState[]; responsible_party: string; accepted_at: string }): ReviewHandoffRecord {
  const verificationCheck = validateProviderOutcomeVerification(input.verification);
  if (verificationCheck.status === 'blocked') throw new Error('review-handoff-verification-invalid');
  if (!text(input.responsible_party) || !text(input.accepted_at) || !strings(input.remaining_risks) || !resourceStates(input.external_resource_states) || typeof input.dependencies_closed !== 'boolean') throw new Error('review-handoff-input-invalid');
  const risks = [...new Set(input.remaining_risks)].sort();
  const status = input.verification.status === 'passed' && input.dependencies_closed && risks.length === 0 ? 'accepted' as const : 'blocked' as const;
  const reason = input.verification.status !== 'passed' ? 'verification-not-passed' as const : !input.dependencies_closed ? 'dependencies-not-closed' as const : risks.length > 0 ? 'unresolved-risks' as const : undefined;
  const unsigned = { schema: REVIEW_HANDOFF_SCHEMA, status, outcome_digest: input.verification.outcome_digest, verification_digest: input.verification.verification_digest, network_id: input.verification.network_id, event_id: input.verification.event_id, plan_id: input.verification.plan_id, plan_revision: input.verification.plan_revision, execution_id: input.verification.execution_id, task_id: input.verification.task_id, dependencies_closed: input.dependencies_closed, remaining_risks: risks, external_resource_states: input.external_resource_states.map((state) => ({ ...state })), responsible_party: input.responsible_party, accepted_at: input.accepted_at, event_completed: false as const, task_completed: false as const, side_effects_executed: false as const, ...(reason === undefined ? {} : { reason }) };
  return { ...unsigned, handoff_digest: digest(unsigned) };
}

export function validateReviewHandoff(value: ReviewHandoffRecord): { status: 'valid' | 'blocked'; errors: string[] } {
  const errors: string[] = [];
  if (value.schema !== REVIEW_HANDOFF_SCHEMA || !['accepted', 'blocked'].includes(value.status)) errors.push('schema-invalid');
  if (value.status === 'accepted' && (value.verification_digest.length === 0 || !value.dependencies_closed || value.remaining_risks.length > 0)) errors.push('accepted-gate-invalid');
  if (value.event_completed !== false || value.task_completed !== false || value.side_effects_executed !== false) errors.push('safety-boundary-invalid');
  if (value.status === 'blocked' && !value.reason) errors.push('blocked-reason-missing');
  if (errors.length === 0) { const { handoff_digest: _, ...unsigned } = value; if (value.handoff_digest !== digest(unsigned)) errors.push('handoff-digest-invalid'); }
  return { status: errors.length === 0 ? 'valid' : 'blocked', errors };
}
