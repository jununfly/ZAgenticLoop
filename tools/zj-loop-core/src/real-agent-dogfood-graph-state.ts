import type { SqliteStateStore, StateEvent } from './sqlite-state-store.js';
import {
  REAL_AGENT_DOGFOOD_GRAPH_PHASES,
  type RealAgentDogfoodGraphPhase,
  type RealAgentDogfoodGraphPlan,
} from './real-agent-dogfood-graph-orchestrator.js';

export const REAL_AGENT_DOGFOOD_GRAPH_STATE_SCHEMA = 'zj-loop.real_agent_dogfood_graph_state.v1' as const;
export const REAL_AGENT_DOGFOOD_GRAPH_STATE_AGGREGATE = 'real-agent-dogfood-graph' as const;
export const REAL_AGENT_DOGFOOD_GRAPH_STATE_EVENT = 'real-agent-dogfood-graph.phase-recorded' as const;

export type RealAgentDogfoodGraphPhaseRecord = {
  schema: typeof REAL_AGENT_DOGFOOD_GRAPH_STATE_SCHEMA;
  network_id: string;
  dogfood_id: string;
  execution_id: string;
  plan_digest: string;
  phase: RealAgentDogfoodGraphPhase;
  status: 'passed' | 'blocked' | 'outcome-uncertain';
  completed_phases: RealAgentDogfoodGraphPhase[];
  reason: string | null;
  actor_kind?: RealAgentDogfoodGraphActorKind;
  actor_identity?: string;
};

export type RealAgentDogfoodGraphActorKind = 'agent-node' | 'coordinator' | 'trusted-runner' | 'core' | 'human';

const PHASE_ACTOR_KINDS: Record<RealAgentDogfoodGraphPhase, readonly RealAgentDogfoodGraphActorKind[]> = {
  source_execution: ['agent-node'],
  scope_observation: ['coordinator', 'trusted-runner', 'core'],
  independent_verification: ['coordinator', 'trusted-runner', 'core'],
  human_acceptance: ['human'],
  merge: ['coordinator', 'human'],
  post_merge_gate: ['coordinator', 'trusted-runner', 'core'],
  cleanup: ['coordinator', 'trusted-runner', 'core'],
};

function phasePrefix(phases: readonly string[]): phases is RealAgentDogfoodGraphPhase[] {
  return phases.every((phase, index) => phase === REAL_AGENT_DOGFOOD_GRAPH_PHASES[index]);
}

function assertPlanBinding(input: { plan: RealAgentDogfoodGraphPlan; network_id: string; dogfood_id: string; execution_id: string }): void {
  if (input.plan.dogfood_id !== input.dogfood_id || input.plan.execution_id !== input.execution_id || !input.network_id.trim()) throw new Error('graph-state-plan-binding-invalid');
}

function assertRecord(record: RealAgentDogfoodGraphPhaseRecord, plan: RealAgentDogfoodGraphPlan): void {
  if (record.schema !== REAL_AGENT_DOGFOOD_GRAPH_STATE_SCHEMA || record.network_id.trim() === '' || record.dogfood_id !== plan.dogfood_id || record.execution_id !== plan.execution_id || record.plan_digest !== plan.plan_digest || !phasePrefix(record.completed_phases) || record.completed_phases.length > REAL_AGENT_DOGFOOD_GRAPH_PHASES.length || record.status === 'passed' && record.completed_phases.at(-1) !== record.phase || record.status !== 'passed' && record.completed_phases.includes(record.phase)) throw new Error('graph-state-record-invalid');
  const hasKind = record.actor_kind !== undefined;
  const hasIdentity = record.actor_identity !== undefined;
  if (hasKind !== hasIdentity || hasKind && (!PHASE_ACTOR_KINDS[record.phase].includes(record.actor_kind as RealAgentDogfoodGraphActorKind) || !record.actor_identity?.trim())) throw new Error('graph-state-actor-binding-invalid');
}

export function createRealAgentDogfoodGraphPhaseRecord(input: {
  plan: RealAgentDogfoodGraphPlan;
  network_id: string;
  phase: RealAgentDogfoodGraphPhase;
  status: RealAgentDogfoodGraphPhaseRecord['status'];
  completed_phases: readonly RealAgentDogfoodGraphPhase[];
  reason?: string;
  actor_kind?: RealAgentDogfoodGraphActorKind;
  actor_identity?: string;
}): RealAgentDogfoodGraphPhaseRecord {
  assertPlanBinding({ plan: input.plan, network_id: input.network_id, dogfood_id: input.plan.dogfood_id, execution_id: input.plan.execution_id });
  const completed = [...input.completed_phases];
  if (!phasePrefix(completed) || completed.length > REAL_AGENT_DOGFOOD_GRAPH_PHASES.length || !REAL_AGENT_DOGFOOD_GRAPH_PHASES.includes(input.phase)) throw new Error('graph-state-phase-invalid');
  const record: RealAgentDogfoodGraphPhaseRecord = {
    schema: REAL_AGENT_DOGFOOD_GRAPH_STATE_SCHEMA,
    network_id: input.network_id,
    dogfood_id: input.plan.dogfood_id,
    execution_id: input.plan.execution_id,
    plan_digest: input.plan.plan_digest,
    phase: input.phase,
    status: input.status,
    completed_phases: completed,
    reason: input.reason ?? null,
    ...(input.actor_kind !== undefined || input.actor_identity !== undefined ? { actor_kind: input.actor_kind, actor_identity: input.actor_identity } : {}),
  };
  assertRecord(record, input.plan);
  return Object.freeze(record);
}

export function projectRealAgentDogfoodGraphPhaseRecord(input: { plan: RealAgentDogfoodGraphPlan; events: readonly StateEvent[] }): RealAgentDogfoodGraphPhaseRecord | null {
  let current: RealAgentDogfoodGraphPhaseRecord | null = null;
  for (const event of input.events) {
    if (event.aggregate_type !== REAL_AGENT_DOGFOOD_GRAPH_STATE_AGGREGATE || event.aggregate_id !== input.plan.dogfood_id || event.event_type !== REAL_AGENT_DOGFOOD_GRAPH_STATE_EVENT) continue;
    const record = event.payload as RealAgentDogfoodGraphPhaseRecord;
    assertRecord(record, input.plan);
    if (current && record.status === 'passed' && record.completed_phases.length <= current.completed_phases.length) throw new Error('graph-state-phase-order-invalid');
    current = record;
  }
  return current;
}

export async function appendRealAgentDogfoodGraphPhaseRecord(input: {
  stateStore: SqliteStateStore;
  plan: RealAgentDogfoodGraphPlan;
  network_id: string;
  record: RealAgentDogfoodGraphPhaseRecord;
  expected_revision: number;
  now?: string;
}): Promise<{ status: 'recorded' | 'duplicate' | 'conflict'; revision?: number; current_revision: number; reason?: string }> {
  assertPlanBinding({ plan: input.plan, network_id: input.network_id, dogfood_id: input.record.dogfood_id, execution_id: input.record.execution_id });
  assertRecord(input.record, input.plan);
  const event = {
    event_id: `${input.plan.dogfood_id}:graph:${input.record.completed_phases.length}:${input.record.phase}:${input.record.status}`,
    aggregate_type: REAL_AGENT_DOGFOOD_GRAPH_STATE_AGGREGATE,
    aggregate_id: input.plan.dogfood_id,
    event_type: REAL_AGENT_DOGFOOD_GRAPH_STATE_EVENT,
    occurred_at: input.now ?? new Date().toISOString(),
    payload: input.record,
  };
  return input.stateStore.appendEvent({ network_id: input.network_id, expected_revision: input.expected_revision, now: input.now, event });
}
