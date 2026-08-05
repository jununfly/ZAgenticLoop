import type { RealAgentDogfoodGraphPhaseRecord } from './real-agent-dogfood-graph-state.js';
import type { RealAgentDogfoodGraphPhase } from './real-agent-dogfood-graph-orchestrator.js';

export const REAL_AGENT_DOGFOOD_COORDINATOR_RESUME_GATE_SCHEMA = 'zj-loop.real_agent_dogfood_coordinator_resume_gate.v1' as const;

type ActiveLease = {
  status: 'acquired' | 'reused' | 'renewed';
  execution_id: string;
  execution_binding_digest: string;
  coordinator_lease_digest: string;
  expires_at: string;
};

type Lease = ActiveLease | { status: 'blocked'; reason: string };

export type RealAgentDogfoodCoordinatorResumeGateResult =
  | { schema: typeof REAL_AGENT_DOGFOOD_COORDINATOR_RESUME_GATE_SCHEMA; status: 'ready'; next_phase: RealAgentDogfoodGraphPhase; coordinator_lease_digest: string }
  | { schema: typeof REAL_AGENT_DOGFOOD_COORDINATOR_RESUME_GATE_SCHEMA; status: 'blocked'; reason: 'coordinator-lease-required' | 'coordinator-lease-expired' | 'coordinator-lease-binding-mismatch' | 'graph-phase-not-passed' | 'graph-phase-actor-binding-required' };

export function evaluateRealAgentDogfoodCoordinatorResumeGate(input: { execution_id: string; execution_binding_digest: string; lease: Lease; phase: RealAgentDogfoodGraphPhaseRecord | null; next_phase: RealAgentDogfoodGraphPhase; now?: string }): RealAgentDogfoodCoordinatorResumeGateResult {
  const prefix = { schema: REAL_AGENT_DOGFOOD_COORDINATOR_RESUME_GATE_SCHEMA } as const;
  if (input.lease.status === 'blocked') return { ...prefix, status: 'blocked', reason: 'coordinator-lease-required' };
  if (input.lease.execution_id !== input.execution_id || input.lease.execution_binding_digest !== input.execution_binding_digest) return { ...prefix, status: 'blocked', reason: 'coordinator-lease-binding-mismatch' };
  if (Date.parse(input.now ?? new Date().toISOString()) >= Date.parse(input.lease.expires_at)) return { ...prefix, status: 'blocked', reason: 'coordinator-lease-expired' };
  if (!input.phase) return { ...prefix, status: 'ready', next_phase: input.next_phase, coordinator_lease_digest: input.lease.coordinator_lease_digest };
  if (input.phase.status !== 'passed') return { ...prefix, status: 'blocked', reason: 'graph-phase-not-passed' };
  if (!input.phase.actor_kind || !input.phase.actor_identity) return { ...prefix, status: 'blocked', reason: 'graph-phase-actor-binding-required' };
  return { ...prefix, status: 'ready', next_phase: input.next_phase, coordinator_lease_digest: input.lease.coordinator_lease_digest };
}
