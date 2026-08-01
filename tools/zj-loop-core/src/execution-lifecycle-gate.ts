import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';

export const EXECUTION_LIFECYCLE_SCHEMA = 'zj-loop.execution_lifecycle.v1' as const;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const TRANSITIONS: Record<ExecutionLifecycleStatus, ExecutionLifecycleStatus[]> = {
  'provider-completed': ['task-verified', 'blocked'],
  'task-verified': ['review-pending', 'blocked'],
  'review-pending': ['completed', 'rejected', 'blocked'],
  completed: [],
  rejected: [],
  blocked: [],
};

export type ExecutionLifecycleStatus = 'provider-completed' | 'task-verified' | 'review-pending' | 'completed' | 'rejected' | 'blocked';
export type ExecutionLifecycle = {
  schema: typeof EXECUTION_LIFECYCLE_SCHEMA;
  network_id: string;
  execution_id: string;
  attempt: number;
  status: ExecutionLifecycleStatus;
  outcome_digest: string;
  verification_digest?: string;
  review_handoff_digest?: string;
  human_acceptance_digest?: string;
  transitions: Array<{ from: ExecutionLifecycleStatus; to: ExecutionLifecycleStatus; reason?: string; actor_role: 'system' | 'verifier' | 'human' }>;
  lifecycle_digest: string;
};

function canonical(value: unknown): string {
  const json = canonicalize(value);
  if (typeof json !== 'string') throw new Error('execution-lifecycle-canonicalization-invalid');
  return json;
}

function digest(value: Omit<ExecutionLifecycle, 'lifecycle_digest'>): string {
  return 'sha256:' + createHash('sha256').update(canonical(value), 'utf8').digest('hex');
}

function unsigned(value: ExecutionLifecycle): Omit<ExecutionLifecycle, 'lifecycle_digest'> {
  const { lifecycle_digest: _, ...rest } = value;
  return rest;
}

function identity(value: string): boolean { return typeof value === 'string' && value.length > 0 && value.length <= 256; }
function validDigest(value: unknown): value is string { return typeof value === 'string' && DIGEST.test(value); }

export function createExecutionLifecycle(input: { network_id: string; execution_id: string; attempt: number; outcome_digest: string }): ExecutionLifecycle {
  if (!identity(input.network_id) || !identity(input.execution_id) || !Number.isInteger(input.attempt) || input.attempt < 1 || !validDigest(input.outcome_digest)) throw new Error('execution-lifecycle-input-invalid');
  const value: Omit<ExecutionLifecycle, 'lifecycle_digest'> = { schema: EXECUTION_LIFECYCLE_SCHEMA, network_id: input.network_id, execution_id: input.execution_id, attempt: input.attempt, status: 'provider-completed', outcome_digest: input.outcome_digest, transitions: [] };
  return { ...value, lifecycle_digest: digest(value) };
}

export function transitionExecutionLifecycle(input: { lifecycle: ExecutionLifecycle; to: ExecutionLifecycleStatus; verification_digest?: string; review_handoff_digest?: string; human_acceptance_digest?: string; actor_role?: 'system' | 'verifier' | 'human'; reason?: string }): ExecutionLifecycle {
  const current = input.lifecycle;
  if (!current || current.schema !== EXECUTION_LIFECYCLE_SCHEMA || current.lifecycle_digest !== digest(unsigned(current))) throw new Error('execution-lifecycle-invalid');
  if (!TRANSITIONS[current.status].includes(input.to)) throw new Error('execution-lifecycle-transition-invalid');
  const actor_role = input.actor_role ?? (input.to === 'task-verified' ? 'verifier' : 'system');
  if (input.to === 'task-verified' && (actor_role !== 'verifier' || !validDigest(input.verification_digest))) throw new Error('execution-lifecycle-verification-required');
  if (input.to === 'review-pending' && (!validDigest(input.review_handoff_digest) || actor_role !== 'system')) throw new Error('execution-lifecycle-review-handoff-required');
  if (input.to === 'completed' && (!validDigest(input.human_acceptance_digest) || actor_role !== 'human')) throw new Error('execution-lifecycle-human-acceptance-required');
  if (['blocked', 'rejected'].includes(input.to) && !input.reason?.trim()) throw new Error('execution-lifecycle-reason-required');
  const { lifecycle_digest: _, ...base } = current;
  const value: Omit<ExecutionLifecycle, 'lifecycle_digest'> = {
    ...base,
    status: input.to,
    ...(input.verification_digest === undefined ? {} : { verification_digest: input.verification_digest }),
    ...(input.review_handoff_digest === undefined ? {} : { review_handoff_digest: input.review_handoff_digest }),
    ...(input.human_acceptance_digest === undefined ? {} : { human_acceptance_digest: input.human_acceptance_digest }),
    transitions: [...current.transitions, { from: current.status, to: input.to, actor_role, ...(input.reason === undefined ? {} : { reason: input.reason }) }],
  };
  return { ...value, lifecycle_digest: digest(value) };
}
