const DIGEST = /^sha256:[0-9a-f]{64}$/;
const ID = /^[^\s]{1,256}$/;

export const NATIVE_AGENT_EXECUTION_SCHEMA = 'zj-loop.native_agent_execution.v1' as const;
export const NATIVE_AGENT_EXECUTION_STATUS = {
  received: 'received',
  validated: 'validated',
  dispatched: 'dispatched',
  running: 'running',
  succeeded: 'succeeded',
  failed: 'failed',
  timedOut: 'timed-out',
  cancelled: 'cancelled',
  blocked: 'blocked',
  evidenceRecorded: 'evidence-recorded',
  reviewPending: 'review-pending',
  accepted: 'accepted',
  rejected: 'rejected',
} as const;

export type NativeAgentExecutionStatus = typeof NATIVE_AGENT_EXECUTION_STATUS[keyof typeof NATIVE_AGENT_EXECUTION_STATUS];
export type NativeAgentExecutionTransition = { from: NativeAgentExecutionStatus; to: NativeAgentExecutionStatus; at: string; reason?: string };
export type NativeAgentExecution = {
  schema: typeof NATIVE_AGENT_EXECUTION_SCHEMA;
  execution_id: string;
  task_id: string;
  attempt: number;
  agent_id: string;
  task_digest: string;
  registration_digest: string;
  started_at: string;
  status: NativeAgentExecutionStatus;
  evidence_refs: string[];
  transitions: NativeAgentExecutionTransition[];
};

const TERMINAL = new Set<NativeAgentExecutionStatus>(['blocked', 'failed', 'timed-out', 'cancelled', 'accepted', 'rejected']);
const EDGES: Record<NativeAgentExecutionStatus, NativeAgentExecutionStatus[]> = {
  received: ['validated', 'blocked'],
  validated: ['dispatched', 'blocked'],
  dispatched: ['running', 'blocked', 'cancelled'],
  running: ['succeeded', 'failed', 'timed-out', 'blocked', 'cancelled'],
  succeeded: ['evidence-recorded'],
  failed: [],
  'timed-out': [],
  cancelled: [],
  blocked: [],
  'evidence-recorded': ['review-pending'],
  'review-pending': ['accepted', 'rejected', 'blocked'],
  accepted: [],
  rejected: [],
};

function id(value: unknown, error: string): asserts value is string { if (typeof value !== 'string' || !ID.test(value)) throw new Error(error); }
function digest(value: unknown, error: string): asserts value is string { if (typeof value !== 'string' || !DIGEST.test(value)) throw new Error(error); }
function timestamp(value: string): void { if (!Number.isFinite(Date.parse(value))) throw new Error('agent-execution-timestamp-invalid'); }

export function createNativeAgentExecution(input: { execution_id: string; task_id: string; attempt: number; agent_id: string; task_digest: string; registration_digest: string; started_at: string }): NativeAgentExecution {
  id(input.execution_id, 'agent-execution-id-invalid');
  id(input.task_id, 'agent-task-id-invalid');
  id(input.agent_id, 'agent-id-invalid');
  digest(input.task_digest, 'agent-task-digest-invalid');
  digest(input.registration_digest, 'agent-registration-digest-invalid');
  if (!Number.isInteger(input.attempt) || input.attempt < 1) throw new Error('agent-execution-attempt-invalid');
  timestamp(input.started_at);
  return { schema: NATIVE_AGENT_EXECUTION_SCHEMA, execution_id: input.execution_id, task_id: input.task_id, attempt: input.attempt, agent_id: input.agent_id, task_digest: input.task_digest, registration_digest: input.registration_digest, started_at: input.started_at, status: NATIVE_AGENT_EXECUTION_STATUS.received, evidence_refs: [], transitions: [] };
}

export function transitionNativeAgentExecution(input: { execution: NativeAgentExecution; status: NativeAgentExecutionStatus; at: string; evidence_refs?: string[]; reason?: string }): NativeAgentExecution {
  const current = input.execution;
  timestamp(input.at);
  if (TERMINAL.has(current.status)) throw new Error('agent-execution-terminal');
  if (!EDGES[current.status].includes(input.status)) throw new Error('agent-execution-transition-invalid');
  if (['blocked', 'failed', 'timed-out', 'cancelled', 'rejected', 'accepted'].includes(input.status) && !input.reason?.trim()) throw new Error('agent-execution-reason-required');
  const evidence_refs = [...new Set(input.evidence_refs ?? current.evidence_refs)].sort();
  if (['evidence-recorded', 'review-pending'].includes(input.status) && evidence_refs.length === 0) throw new Error('agent-execution-evidence-required');
  for (const ref of evidence_refs) id(ref, 'agent-execution-evidence-ref-invalid');
  const transition: NativeAgentExecutionTransition = { from: current.status, to: input.status, at: input.at, ...(input.reason ? { reason: input.reason } : {}) };
  return { ...current, status: input.status, evidence_refs, transitions: [...current.transitions, transition] };
}
