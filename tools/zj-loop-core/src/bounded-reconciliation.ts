import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';

export const BOUNDED_RECONCILIATION_SCHEMA = 'zj-loop.bounded_reconciliation.v1' as const;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const REASON_CODES = new Set(['outcome-uncertain', 'reconciliation-exhausted']);
const FORBIDDEN_ACTIONS = ['provider.invoke', 'execution.restart', 'resource.write'] as const;

export type BoundedReconciliationPlan = {
  schema: typeof BOUNDED_RECONCILIATION_SCHEMA;
  status: 'required';
  network_id: string;
  execution_id: string;
  attempt: number;
  outcome_digest: string;
  reason_code: 'outcome-uncertain' | 'reconciliation-exhausted';
  max_queries: number;
  deadline: string;
  query_scope: string[];
  forbidden_actions: [...typeof FORBIDDEN_ACTIONS];
  observed_fact_digests: string[];
  side_effects_executed: false;
  plan_digest: string;
};

function canonical(value: unknown): string {
  const json = canonicalize(value);
  if (typeof json !== 'string') throw new Error('bounded-reconciliation-canonicalization-invalid');
  return json;
}

function digest(value: Omit<BoundedReconciliationPlan, 'plan_digest'>): string {
  return 'sha256:' + createHash('sha256').update(canonical(value), 'utf8').digest('hex');
}

function text(value: unknown): value is string { return typeof value === 'string' && value.length > 0 && value.length <= 1024; }
function validDigest(value: unknown): value is string { return typeof value === 'string' && DIGEST.test(value); }
function unsigned(value: BoundedReconciliationPlan): Omit<BoundedReconciliationPlan, 'plan_digest'> { const { plan_digest: _, ...rest } = value; return rest; }

export function createBoundedReconciliationPlan(input: Omit<BoundedReconciliationPlan, 'schema' | 'status' | 'forbidden_actions' | 'side_effects_executed' | 'plan_digest'>): BoundedReconciliationPlan {
  if (!text(input.network_id) || !text(input.execution_id) || !Number.isInteger(input.attempt) || input.attempt < 1 || !validDigest(input.outcome_digest) || !REASON_CODES.has(input.reason_code) || !Number.isInteger(input.max_queries) || input.max_queries < 1 || !Number.isFinite(Date.parse(input.deadline)) || !Array.isArray(input.query_scope) || input.query_scope.length === 0 || !input.query_scope.every(text) || !Array.isArray(input.observed_fact_digests) || !input.observed_fact_digests.every(validDigest)) throw new Error('bounded-reconciliation-input-invalid');
  const value: Omit<BoundedReconciliationPlan, 'plan_digest'> = {
    schema: BOUNDED_RECONCILIATION_SCHEMA,
    status: 'required',
    network_id: input.network_id,
    execution_id: input.execution_id,
    attempt: input.attempt,
    outcome_digest: input.outcome_digest,
    reason_code: input.reason_code,
    max_queries: input.max_queries,
    deadline: input.deadline,
    query_scope: [...new Set(input.query_scope)].sort(),
    forbidden_actions: [...FORBIDDEN_ACTIONS],
    observed_fact_digests: [...new Set(input.observed_fact_digests)].sort(),
    side_effects_executed: false,
  };
  return { ...value, plan_digest: digest(value) };
}

export function validateBoundedReconciliationPlan(value: BoundedReconciliationPlan): { status: 'valid' | 'blocked'; errors: string[] } {
  const errors: string[] = [];
  if (!value || value.schema !== BOUNDED_RECONCILIATION_SCHEMA || value.status !== 'required' || value.side_effects_executed !== false || !Array.isArray(value.forbidden_actions) || value.forbidden_actions.join(',') !== FORBIDDEN_ACTIONS.join(',') || !validDigest(value.plan_digest)) errors.push('schema-invalid');
  if (errors.length === 0 && value.plan_digest !== digest(unsigned(value))) errors.push('plan-digest-invalid');
  return { status: errors.length === 0 ? 'valid' : 'blocked', errors };
}
