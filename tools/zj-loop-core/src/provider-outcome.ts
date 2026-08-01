import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';

export const PROVIDER_OUTCOME_SCHEMA = 'zj-loop.provider_outcome.v2' as const;
export type ProviderOutcomeKind = 'confirmed-success' | 'confirmed-failure-no-side-effect' | 'partial-success' | 'outcome-uncertain';

export type ProviderOutcomeEvidence =
  | { kind: 'receipt'; receipt_id: string; receipt_digest: string }
  | { kind: 'no-side-effect-proof'; proof_id: string; proof_digest: string }
  | { kind: 'partial-observation'; completed_resource_scope: string[]; incomplete_resource_scope: string[]; observation_digest: string }
  | { kind: 'uncertainty'; reason: string; last_known_fact_digest: string; frozen_resource_scope: string[]; allowed_queries: string[]; forbidden_actions: string[]; reconciliation_budget: { max_queries: number; deadline: string; query_scope: string[]; max_cost: number }};

export type ProviderOutcome = {
  schema: typeof PROVIDER_OUTCOME_SCHEMA;
  outcome: ProviderOutcomeKind;
  network_id: string;
  event_id: string;
  plan_id: string;
  plan_revision: number;
  execution_id: string;
  attempt: number;
  task_id: string;
  provider_id: string;
  provider_kind: string;
  provider_request_id: string;
  request_digest: string;
  response_digest: string;
  resource_scope: string[];
  observed_at: string;
  side_effects_executed: boolean;
  evidence: ProviderOutcomeEvidence;
  outcome_digest: string;
};

export type ProviderOutcomeValidation = { status: 'valid' | 'blocked'; errors: string[]; outcome_digest: string };

const KINDS: readonly ProviderOutcomeKind[] = ['confirmed-success', 'confirmed-failure-no-side-effect', 'partial-success', 'outcome-uncertain'];
const DIGEST = /^sha256:[0-9a-f]{64}$/;

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function text(value: unknown): value is string { return typeof value === 'string' && value.length > 0; }
function strings(value: unknown): value is string[] { return Array.isArray(value) && value.every(text); }
function integer(value: unknown, minimum = 0): value is number { return typeof value === 'number' && Number.isInteger(value) && value >= minimum; }
function digestValue(value: Omit<ProviderOutcome, 'outcome_digest'>): string {
  const json = canonicalize(value);
  if (typeof json !== 'string') throw new Error('provider-outcome-canonicalization-invalid');
  return `sha256:${createHash('sha256').update(json).digest('hex')}`;
}
function error(code: string): string { return code; }

function schemaErrors(candidate: unknown): string[] {
  if (!isRecord(candidate)) return [error('schema-invalid')];
  const common = ['schema', 'outcome', 'network_id', 'event_id', 'plan_id', 'plan_revision', 'execution_id', 'attempt', 'task_id', 'provider_id', 'provider_kind', 'provider_request_id', 'request_digest', 'response_digest', 'resource_scope', 'observed_at', 'side_effects_executed', 'evidence', 'outcome_digest'];
  if (Object.keys(candidate).some((key) => !common.includes(key))) return [error('schema-unknown-field')];
  for (const key of ['schema', 'network_id', 'event_id', 'plan_id', 'execution_id', 'task_id', 'provider_id', 'provider_kind', 'provider_request_id', 'request_digest', 'response_digest', 'observed_at', 'outcome_digest']) if (!text(candidate[key])) return [error(`required-${key}`)];
  if (candidate.schema !== PROVIDER_OUTCOME_SCHEMA || !KINDS.includes(candidate.outcome as ProviderOutcomeKind)) return [error('outcome-kind-invalid')];
  if (!integer(candidate.plan_revision) || !integer(candidate.attempt, 1) || !strings(candidate.resource_scope) || typeof candidate.side_effects_executed !== 'boolean') return [error('common-field-invalid')];
  if (!DIGEST.test(candidate.request_digest as string) || !DIGEST.test(candidate.response_digest as string) || !DIGEST.test(candidate.outcome_digest as string)) return [error('digest-invalid')];
  const evidence = candidate.evidence;
  if (!isRecord(evidence) || typeof evidence.kind !== 'string') return [error('evidence-invalid')];
  if (candidate.outcome === 'confirmed-success' && (evidence.kind !== 'receipt' || !text(evidence.receipt_id) || !text(evidence.receipt_digest) || !DIGEST.test(evidence.receipt_digest))) return [error('success-evidence-invalid')];
  if (candidate.outcome === 'confirmed-failure-no-side-effect' && (candidate.side_effects_executed !== false || evidence.kind !== 'no-side-effect-proof' || !text(evidence.proof_id) || !text(evidence.proof_digest) || !DIGEST.test(evidence.proof_digest))) return [error('failure-evidence-invalid')];
  if (candidate.outcome === 'partial-success' && (evidence.kind !== 'partial-observation' || !strings(evidence.completed_resource_scope) || !strings(evidence.incomplete_resource_scope) || evidence.completed_resource_scope.length === 0 || evidence.incomplete_resource_scope.length === 0 || !text(evidence.observation_digest) || !DIGEST.test(evidence.observation_digest))) return [error('partial-evidence-invalid')];
  if (candidate.outcome === 'outcome-uncertain') {
    const budget = evidence.kind === 'uncertainty' ? evidence.reconciliation_budget : undefined;
    if (evidence.kind !== 'uncertainty' || !text(evidence.reason) || !text(evidence.last_known_fact_digest) || !DIGEST.test(evidence.last_known_fact_digest) || !strings(evidence.frozen_resource_scope) || !strings(evidence.allowed_queries) || !strings(evidence.forbidden_actions) || !isRecord(budget) || !integer(budget.max_queries) || budget.max_queries < 1 || !text(budget.deadline) || !strings(budget.query_scope) || typeof budget.max_cost !== 'number' || budget.max_cost < 0) return [error('uncertainty-evidence-invalid')];
  }
  return [];
}

export function createProviderOutcome(input: Omit<ProviderOutcome, 'schema' | 'outcome_digest' | 'attempt'> & { attempt?: number; outcome_digest?: string }): ProviderOutcome {
  const candidate = { schema: PROVIDER_OUTCOME_SCHEMA, ...structuredClone(input), attempt: input.attempt ?? 1, outcome_digest: input.outcome_digest ?? `sha256:${'0'.repeat(64)}` } as ProviderOutcome;
  if (schemaErrors(candidate).length > 0) throw new Error('provider-outcome-schema-invalid');
  const { outcome_digest: _, ...unsigned } = candidate;
  candidate.outcome_digest = digestValue(unsigned);
  return candidate;
}

export function providerOutcomeDigest(outcome: ProviderOutcome): string {
  const { outcome_digest: _, ...unsigned } = outcome;
  return digestValue(unsigned);
}

export function validateProviderOutcome(outcome: ProviderOutcome): ProviderOutcomeValidation {
  const errors = schemaErrors(outcome);
  if (errors.length === 0 && outcome.outcome_digest !== providerOutcomeDigest(outcome)) errors.push(error('outcome-digest-invalid'));
  return { status: errors.length === 0 ? 'valid' : 'blocked', errors, outcome_digest: typeof outcome.outcome_digest === 'string' ? outcome.outcome_digest : '' };
}

export function validateProviderOutcomeBinding(input: { outcome: ProviderOutcome; expected: Pick<ProviderOutcome, 'network_id' | 'event_id' | 'plan_id' | 'plan_revision' | 'execution_id' | 'task_id' | 'provider_request_id' | 'resource_scope'> }): ProviderOutcomeValidation {
  const result = validateProviderOutcome(input.outcome);
  const mismatches = (['network_id', 'event_id', 'plan_id', 'plan_revision', 'execution_id', 'task_id', 'provider_request_id'] as const).filter((key) => input.outcome[key] !== input.expected[key]).map((key) => `binding-${key}-mismatch`);
  if (input.outcome.resource_scope.join('\u0000') !== input.expected.resource_scope.join('\u0000')) mismatches.push('binding-resource-scope-mismatch');
  return { ...result, status: result.errors.length === 0 && mismatches.length === 0 ? 'valid' : 'blocked', errors: [...result.errors, ...mismatches] };
}
