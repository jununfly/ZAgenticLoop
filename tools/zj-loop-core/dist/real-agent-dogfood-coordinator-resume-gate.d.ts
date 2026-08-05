import type { RealAgentDogfoodGraphPhaseRecord } from './real-agent-dogfood-graph-state.js';
import type { RealAgentDogfoodGraphPhase } from './real-agent-dogfood-graph-orchestrator.js';
export declare const REAL_AGENT_DOGFOOD_COORDINATOR_RESUME_GATE_SCHEMA: "zj-loop.real_agent_dogfood_coordinator_resume_gate.v1";
type ActiveLease = {
    status: 'acquired' | 'reused' | 'renewed';
    execution_id: string;
    execution_binding_digest: string;
    coordinator_lease_digest: string;
    expires_at: string;
};
type Lease = ActiveLease | {
    status: 'blocked';
    reason: string;
};
export type RealAgentDogfoodCoordinatorResumeGateResult = {
    schema: typeof REAL_AGENT_DOGFOOD_COORDINATOR_RESUME_GATE_SCHEMA;
    status: 'ready';
    next_phase: RealAgentDogfoodGraphPhase;
    coordinator_lease_digest: string;
} | {
    schema: typeof REAL_AGENT_DOGFOOD_COORDINATOR_RESUME_GATE_SCHEMA;
    status: 'blocked';
    reason: 'coordinator-lease-required' | 'coordinator-lease-expired' | 'coordinator-lease-binding-mismatch' | 'graph-phase-not-passed' | 'graph-phase-actor-binding-required';
};
export declare function evaluateRealAgentDogfoodCoordinatorResumeGate(input: {
    execution_id: string;
    execution_binding_digest: string;
    lease: Lease;
    phase: RealAgentDogfoodGraphPhaseRecord | null;
    next_phase: RealAgentDogfoodGraphPhase;
    now?: string;
}): RealAgentDogfoodCoordinatorResumeGateResult;
export {};
