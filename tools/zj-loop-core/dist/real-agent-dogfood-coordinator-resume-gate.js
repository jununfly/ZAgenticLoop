export const REAL_AGENT_DOGFOOD_COORDINATOR_RESUME_GATE_SCHEMA = 'zj-loop.real_agent_dogfood_coordinator_resume_gate.v1';
export function evaluateRealAgentDogfoodCoordinatorResumeGate(input) {
    const prefix = { schema: REAL_AGENT_DOGFOOD_COORDINATOR_RESUME_GATE_SCHEMA };
    if (input.lease.status === 'blocked')
        return { ...prefix, status: 'blocked', reason: 'coordinator-lease-required' };
    if (input.lease.execution_id !== input.execution_id || input.lease.execution_binding_digest !== input.execution_binding_digest)
        return { ...prefix, status: 'blocked', reason: 'coordinator-lease-binding-mismatch' };
    if (Date.parse(input.now ?? new Date().toISOString()) >= Date.parse(input.lease.expires_at))
        return { ...prefix, status: 'blocked', reason: 'coordinator-lease-expired' };
    if (!input.phase)
        return { ...prefix, status: 'ready', next_phase: input.next_phase, coordinator_lease_digest: input.lease.coordinator_lease_digest };
    if (input.phase.status !== 'passed')
        return { ...prefix, status: 'blocked', reason: 'graph-phase-not-passed' };
    if (!input.phase.actor_kind || !input.phase.actor_identity)
        return { ...prefix, status: 'blocked', reason: 'graph-phase-actor-binding-required' };
    return { ...prefix, status: 'ready', next_phase: input.next_phase, coordinator_lease_digest: input.lease.coordinator_lease_digest };
}
