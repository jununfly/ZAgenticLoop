import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';

export const BOUNDED_LOOP_TASK_SCHEMA = 'zj-loop.bounded_loop_task.v1' as const;

const DIGEST = /^sha256:[0-9a-f]{64}$/;
const ID = /^[^\s]{1,256}$/;
const TASK_KEYS = ['schema', 'task_id', 'execution_id', 'attempt', 'task_kind', 'objective', 'success_criteria', 'input_artifact_refs', 'dependency_refs', 'resource_isolation', 'budget', 'expected_evidence_kinds', 'idempotency_key', 'cancellation', 'task_digest'];
const RESOURCE_ISOLATION_KEYS = ['status', 'bindings'];
const RESOURCE_BINDING_KEYS = ['resource_id', 'strategy', 'evidence_refs'];
const BUDGET_KEYS = ['timeout_ms', 'max_iterations'];
const CANCELLATION_KEYS = ['mode', 'token'];

export type BoundedLoopTask = {
  schema: typeof BOUNDED_LOOP_TASK_SCHEMA;
  task_id: string;
  execution_id: string;
  attempt: number;
  task_kind: string;
  objective: string;
  success_criteria: string[];
  input_artifact_refs: string[];
  dependency_refs: string[];
  resource_isolation: {
    status: 'declared' | 'not-applicable';
    bindings: Array<{ resource_id: string; strategy: string; evidence_refs: string[] }>;
  };
  budget: { timeout_ms: number; max_iterations: number };
  expected_evidence_kinds: string[];
  idempotency_key: string;
  cancellation: { mode: 'cooperative'; token: string };
  task_digest: string;
};

type BoundedLoopTaskInput = Omit<BoundedLoopTask, 'schema' | 'task_digest'>;

function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function id(value: unknown): value is string { return typeof value === 'string' && ID.test(value); }
function text(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0 && value.length <= 4096; }
function list(value: unknown, allowEmpty = false): value is string[] { return Array.isArray(value) && (allowEmpty || value.length > 0) && value.every(id); }
function textList(value: unknown): value is string[] { return Array.isArray(value) && value.length > 0 && value.every(text); }
function normalized(value: string[]): string[] { return [...new Set(value)].sort(); }
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean { return Object.keys(value).every((key) => keys.includes(key)); }
function canonical(value: unknown): string { const json = canonicalize(value); if (typeof json !== 'string') throw new Error('bounded-loop-task-canonicalization-invalid'); return json; }
function unsigned(value: BoundedLoopTask): Omit<BoundedLoopTask, 'task_digest'> { const { task_digest: _, ...rest } = value; return rest; }
function digest(value: Omit<BoundedLoopTask, 'task_digest'>): string { return `sha256:${createHash('sha256').update(canonical(value), 'utf8').digest('hex')}`; }

function validateShape(value: unknown): string | null {
  if (!isRecord(value) || !exactKeys(value, TASK_KEYS)) return 'bounded-loop-task-field-invalid';
  if (value.schema !== BOUNDED_LOOP_TASK_SCHEMA || !id(value.task_id) || !id(value.execution_id) || !id(value.task_kind) || !id(value.idempotency_key)) return 'bounded-loop-task-identity-invalid';
  if (!Number.isInteger(value.attempt) || (value.attempt as number) < 1) return 'bounded-loop-task-attempt-invalid';
  if (!text(value.objective) || !textList(value.success_criteria) || !list(value.input_artifact_refs) || !list(value.dependency_refs, true) || !list(value.expected_evidence_kinds)) return 'bounded-loop-task-fields-invalid';
  if (!isRecord(value.resource_isolation) || !exactKeys(value.resource_isolation, RESOURCE_ISOLATION_KEYS) || (value.resource_isolation.status !== 'declared' && value.resource_isolation.status !== 'not-applicable') || !Array.isArray(value.resource_isolation.bindings)) return 'bounded-loop-task-resource-isolation-invalid';
  const bindings = value.resource_isolation.bindings;
  if (value.resource_isolation.status === 'declared' && bindings.length === 0 || value.resource_isolation.status === 'not-applicable' && bindings.length > 0) return 'bounded-loop-task-resource-isolation-invalid';
  for (const binding of bindings) if (!isRecord(binding) || !exactKeys(binding, RESOURCE_BINDING_KEYS) || !id(binding.resource_id) || !id(binding.strategy) || !list(binding.evidence_refs)) return 'bounded-loop-task-resource-binding-invalid';
  if (!isRecord(value.budget) || !exactKeys(value.budget, BUDGET_KEYS) || !Number.isInteger(value.budget.timeout_ms) || (value.budget.timeout_ms as number) < 1 || !Number.isInteger(value.budget.max_iterations) || (value.budget.max_iterations as number) < 1) return 'bounded-loop-task-budget-invalid';
  if (!isRecord(value.cancellation) || !exactKeys(value.cancellation, CANCELLATION_KEYS) || value.cancellation.mode !== 'cooperative' || !id(value.cancellation.token)) return 'bounded-loop-task-cancellation-invalid';
  if (typeof value.task_digest !== 'string' || !DIGEST.test(value.task_digest)) return 'bounded-loop-task-digest-invalid';
  return null;
}

export function createBoundedLoopTask(input: BoundedLoopTaskInput): BoundedLoopTask {
  if (!isRecord(input) || !exactKeys(input, TASK_KEYS.filter((key) => key !== 'schema' && key !== 'task_digest'))) throw new Error('bounded-loop-task-field-invalid');
  const candidate = {
    schema: BOUNDED_LOOP_TASK_SCHEMA,
    task_id: input.task_id,
    execution_id: input.execution_id,
    attempt: input.attempt,
    task_kind: input.task_kind,
    objective: input.objective,
    success_criteria: normalized(input.success_criteria),
    input_artifact_refs: normalized(input.input_artifact_refs),
    dependency_refs: normalized(input.dependency_refs),
    resource_isolation: { status: input.resource_isolation.status, bindings: input.resource_isolation.bindings.map((binding) => ({ resource_id: binding.resource_id, strategy: binding.strategy, evidence_refs: normalized(binding.evidence_refs) })) },
    budget: { timeout_ms: input.budget.timeout_ms, max_iterations: input.budget.max_iterations },
    expected_evidence_kinds: normalized(input.expected_evidence_kinds),
    idempotency_key: input.idempotency_key,
    cancellation: { mode: input.cancellation.mode, token: input.cancellation.token },
  } satisfies Omit<BoundedLoopTask, 'task_digest'>;
  const error = validateShape({ ...candidate, task_digest: 'sha256:' + '0'.repeat(64) });
  if (error) throw new Error(error);
  return { ...candidate, task_digest: digest(candidate) };
}

export function boundedLoopTaskDigest(value: BoundedLoopTask): string { return digest(unsigned(value)); }

export function validateBoundedLoopTask(value: unknown): { status: 'valid' } | { status: 'blocked'; reason: string } {
  const error = validateShape(value);
  if (error) return { status: 'blocked', reason: error };
  const item = value as BoundedLoopTask;
  if (JSON.stringify(item.success_criteria) !== JSON.stringify(normalized(item.success_criteria)) || JSON.stringify(item.input_artifact_refs) !== JSON.stringify(normalized(item.input_artifact_refs)) || JSON.stringify(item.dependency_refs) !== JSON.stringify(normalized(item.dependency_refs)) || JSON.stringify(item.expected_evidence_kinds) !== JSON.stringify(normalized(item.expected_evidence_kinds))) return { status: 'blocked', reason: 'bounded-loop-task-normalization-invalid' };
  if (item.task_digest !== boundedLoopTaskDigest(item)) return { status: 'blocked', reason: 'bounded-loop-task-digest-invalid' };
  return { status: 'valid' };
}
