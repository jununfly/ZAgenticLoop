import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
import type { ContentAddressedEvidenceStore } from './content-addressed-evidence-store.js';
import { projectRealAgentDogfoodLifecycle, type RealAgentDogfoodEvent, type RealAgentDogfoodLifecycle } from './real-agent-dogfood-lifecycle.js';
import { projectRealAgentDogfoodGraphPhaseRecord, type RealAgentDogfoodGraphPhaseRecord } from './real-agent-dogfood-graph-state.js';
import { REAL_AGENT_DOGFOOD_GRAPH_PHASES, type RealAgentDogfoodGraphPlan } from './real-agent-dogfood-graph-orchestrator.js';
import { sha256CanonicalJson, type StateEvent } from './sqlite-state-store.js';

const DIGEST = /^sha256:[0-9a-f]{64}$/;
const FAILURE_CLASSES = new Set(['known-rejection', 'unverifiable-cleanup', 'unverifiable-evidence', 'provider-timeout']);

export type RealAgentDogfoodFailureClass = 'known-rejection' | 'unverifiable-cleanup' | 'unverifiable-evidence' | 'provider-timeout';
export type RealAgentDogfoodReplayRecord = { status: 'recorded'; execution_id: string; attempt: number; result_digest: string };

export type RealAgentDogfoodGraphReplayReadModel = {
  schema: 'zj-loop.real_agent_dogfood_graph_replay.v1';
  status: 'passed' | 'blocked' | 'outcome-uncertain' | 'in-progress';
  integrity_status: 'complete' | 'incomplete';
  network_id: string;
  dogfood_id: string;
  execution_id: string;
  attempt: number;
  plan_digest: string;
  plan_definition_digest: string;
  lifecycle: Pick<RealAgentDogfoodLifecycle, 'status' | 'reason_code' | 'next_action' | 'lifecycle_digest'>;
  graph: { current_phase: RealAgentDogfoodGraphPhaseRecord['phase'] | null; phase_status: RealAgentDogfoodGraphPhaseRecord['status'] | null; completed_phases: RealAgentDogfoodGraphPhaseRecord['completed_phases']; next_phase: RealAgentDogfoodGraphPlan['plan_digest'] extends string ? typeof REAL_AGENT_DOGFOOD_GRAPH_PHASES[number] | null : never; evidence_refs: string[] };
  integrity_failures: string[];
  read_model_digest: string;
};

function canonical(value: unknown): string {
  const json = canonicalize(value);
  if (typeof json !== 'string') throw new Error('real-agent-dogfood-replay-canonicalization-invalid');
  return json;
}

function modelDigest(value: Omit<RealAgentDogfoodGraphReplayReadModel, 'read_model_digest'>): string {
  return `sha256:${createHash('sha256').update(canonical(value), 'utf8').digest('hex')}`;
}

function scopeFailure(parsed: unknown, input: { network_id: string; dogfood_id: string; execution_id: string; attempt: number; plan_digest: string }): string | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const value = parsed as Record<string, unknown>;
  const checks: Array<[string, unknown, unknown]> = [
    ['network-id', value.network_id, input.network_id],
    ['dogfood-id', value.dogfood_id, input.dogfood_id],
    ['execution-id', value.execution_id, input.execution_id],
    ['attempt', value.attempt, input.attempt],
    ['plan-digest', value.plan_digest, input.plan_digest],
  ];
  for (const [name, observed, expected] of checks) if (observed !== undefined && observed !== expected) return `evidence-${name}-mismatch`;
  return null;
}

function eventIdentity(event: StateEvent): string {
  return canonical({ schema: event.schema, network_id: event.network_id, revision: event.revision, event_id: event.event_id, aggregate_type: event.aggregate_type, aggregate_id: event.aggregate_id, event_type: event.event_type, occurred_at: event.occurred_at, created_at: event.created_at, payload: event.payload, payload_sha256: event.payload_sha256 });
}

function validateGraphEvents(input: { network_id: string; plan: RealAgentDogfoodGraphPlan; graph_events: readonly StateEvent[] }): { events: StateEvent[]; failures: string[] } {
  const events: StateEvent[] = [];
  const failures: string[] = [];
  const byId = new Map<string, string>();
  const byRevision = new Map<number, string>();
  let previousRevision = 0;
  for (const event of input.graph_events) {
    if (!event || event.schema !== 'zj-loop.state_event.v1' || event.network_id !== input.network_id || event.aggregate_type !== 'real-agent-dogfood-graph' || event.aggregate_id !== input.plan.dogfood_id || event.event_type !== 'real-agent-dogfood-graph.phase-recorded') {
      failures.push(`graph-event-scope-invalid:${event?.event_id ?? 'unknown'}`);
      continue;
    }
    if (!Number.isInteger(event.revision) || event.revision < 1) {
      failures.push(`graph-event-revision-invalid:${event.event_id}`);
      continue;
    }
    let identity: string;
    try { identity = eventIdentity(event); } catch { failures.push(`graph-event-encoding-invalid:${event.event_id}`); continue; }
    const priorId = byId.get(event.event_id);
    if (priorId !== undefined) {
      if (priorId !== identity) failures.push(`graph-event-id-conflict:${event.event_id}`);
      continue;
    }
    const priorRevision = byRevision.get(event.revision);
    if (priorRevision !== undefined) {
      failures.push(`${priorRevision === identity ? 'graph-event-revision-duplicate' : 'graph-event-revision-conflict'}:${event.revision}`);
      continue;
    }
    if (event.revision < previousRevision) {
      failures.push(`graph-event-revision-order-invalid:${event.event_id}`);
      continue;
    }
    let payloadDigest: string;
    try { payloadDigest = sha256CanonicalJson(event.payload); } catch { failures.push(`graph-event-payload-invalid:${event.event_id}`); continue; }
    if (payloadDigest !== event.payload_sha256) {
      failures.push(`graph-event-payload-digest-mismatch:${event.event_id}`);
      continue;
    }
    byId.set(event.event_id, identity);
    byRevision.set(event.revision, identity);
    previousRevision = event.revision;
    events.push(event);
  }
  return { events, failures };
}

export async function replayRealAgentDogfoodGraphReadModel(input: {
  network_id: string;
  plan: RealAgentDogfoodGraphPlan;
  lifecycle_events: readonly RealAgentDogfoodEvent[];
  graph_events: readonly StateEvent[];
  evidenceStore: Pick<ContentAddressedEvidenceStore, 'readOnly'>;
}): Promise<RealAgentDogfoodGraphReplayReadModel> {
  if (!input.network_id.trim()) throw new Error('real-agent-dogfood-replay-network-id-required');
  const plan = input.plan;
  if (plan.dogfood_id === '' || plan.execution_id === '') throw new Error('real-agent-dogfood-replay-plan-invalid');
  const lifecycle = projectRealAgentDogfoodLifecycle([...input.lifecycle_events]);
  if (lifecycle.network_id !== input.network_id || lifecycle.dogfood_id !== plan.dogfood_id || lifecycle.execution_id !== plan.execution_id || lifecycle.attempt !== plan.attempt) {
    throw new Error('real-agent-dogfood-replay-scope-mismatch');
  }
  const validated = validateGraphEvents({ network_id: input.network_id, plan, graph_events: input.graph_events });
  let phase: RealAgentDogfoodGraphPhaseRecord | null = null;
  const failures: string[] = [...validated.failures];
  try { phase = projectRealAgentDogfoodGraphPhaseRecord({ plan, events: validated.events }); } catch (error) { failures.push(`graph-projection-invalid:${error instanceof Error ? error.message : 'unknown'}`); }
  if (!phase) failures.push('graph-phase-missing');
  const refs = [...new Set(phase?.evidence_refs ?? [])].sort();
  if (phase?.status === 'passed' && refs.length === 0) failures.push('phase-evidence-missing');
  for (const ref of refs) {
    try {
      const content = await input.evidenceStore.readOnly({ digest: ref });
      let parsed: unknown;
      try { parsed = JSON.parse(content.toString('utf8')); } catch { parsed = null; }
      const failure = scopeFailure(parsed, { network_id: input.network_id, dogfood_id: plan.dogfood_id, execution_id: plan.execution_id, attempt: plan.attempt, plan_digest: plan.plan_digest });
      if (failure) failures.push(failure);
    } catch (error) {
      failures.push(error instanceof Error && error.message === 'evidence-digest-drift' ? `evidence-digest-drift:${ref}` : `evidence-missing:${ref}`);
    }
  }
  const terminalGraph = phase?.phase === 'cleanup' && phase.status === 'passed' && phase.completed_phases.at(-1) === 'cleanup' && phase.completed_phases.includes('post_merge_gate');
  if (lifecycle.status === 'accepted' && !terminalGraph) failures.push('lifecycle-graph-terminal-mismatch');
  if (terminalGraph && lifecycle.status !== 'accepted') failures.push('lifecycle-graph-terminal-mismatch');
  const status: RealAgentDogfoodGraphReplayReadModel['status'] = failures.length > 0 ? 'outcome-uncertain' : phase?.status === 'blocked' ? 'blocked' : phase?.status === 'outcome-uncertain' ? 'outcome-uncertain' : terminalGraph ? 'passed' : 'in-progress';
  const unsigned: Omit<RealAgentDogfoodGraphReplayReadModel, 'read_model_digest'> = {
    schema: 'zj-loop.real_agent_dogfood_graph_replay.v1' as const,
    status,
    integrity_status: failures.length > 0 ? 'incomplete' as const : 'complete' as const,
    network_id: input.network_id,
    dogfood_id: plan.dogfood_id,
    execution_id: plan.execution_id,
    attempt: plan.attempt,
    plan_digest: plan.plan_digest,
    plan_definition_digest: plan.plan_definition_digest,
    lifecycle: { status: lifecycle.status, reason_code: lifecycle.reason_code, next_action: lifecycle.next_action, lifecycle_digest: lifecycle.lifecycle_digest },
    graph: { current_phase: phase?.phase ?? null, phase_status: phase?.status ?? null, completed_phases: phase?.completed_phases ?? [], next_phase: REAL_AGENT_DOGFOOD_GRAPH_PHASES[phase?.completed_phases.length ?? 0] ?? null, evidence_refs: refs },
    integrity_failures: [...new Set(failures)].sort(),
  };
  return Object.freeze({ ...unsigned, read_model_digest: modelDigest(unsigned) });
}

export function classifyRealAgentDogfoodFailure(failure: string): { status: 'blocked' | 'outcome-uncertain'; reason_code: RealAgentDogfoodFailureClass } {
  if (!FAILURE_CLASSES.has(failure)) throw new Error('real-agent-dogfood-failure-class-invalid');
  return { status: failure.startsWith('unverifiable-') ? 'outcome-uncertain' : 'blocked', reason_code: failure as RealAgentDogfoodFailureClass };
}

export function replayRealAgentDogfoodAttempt(input: { execution_id: string; attempt: number; result_digest: string; prior: RealAgentDogfoodReplayRecord | { status: string; execution_id: string; attempt: number; result_digest: string } | null }):
  | RealAgentDogfoodReplayRecord
  | { status: 'idempotent'; execution_id: string; attempt: number }
  | { status: 'conflict'; reason_code: 'attempt-digest-conflict' }
  | { status: 'new-attempt'; execution_id: string; attempt: number } {
  if (!input || !input.execution_id.trim() || !Number.isInteger(input.attempt) || input.attempt < 1 || !DIGEST.test(input.result_digest)) throw new Error('real-agent-dogfood-replay-input-invalid');
  if (!input.prior) return { status: 'recorded', execution_id: input.execution_id, attempt: input.attempt, result_digest: input.result_digest };
  if (input.attempt === input.prior.attempt && input.execution_id === input.prior.execution_id) {
    return input.result_digest === input.prior.result_digest ? { status: 'idempotent', execution_id: input.execution_id, attempt: input.attempt } : { status: 'conflict', reason_code: 'attempt-digest-conflict' };
  }
  if (input.attempt <= input.prior.attempt) throw new Error('real-agent-dogfood-retry-attempt-invalid');
  if (input.execution_id === input.prior.execution_id) throw new Error('real-agent-dogfood-retry-execution-binding-invalid');
  return { status: 'new-attempt', execution_id: input.execution_id, attempt: input.attempt };
}
