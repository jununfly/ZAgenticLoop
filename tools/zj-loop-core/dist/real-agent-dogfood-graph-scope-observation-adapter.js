import { createRealAgentDogfoodGraphPhaseRecord } from './real-agent-dogfood-graph-state.js';
import { observeRealAgentDogfoodGitScope } from './real-agent-dogfood-git-scope.js';
const DIGEST = /^sha256:[0-9a-f]{64}$/;
export function createRealAgentDogfoodGraphScopeObservationAdapter(input) {
    return async () => {
        if (input.source_phase.phase !== 'source_execution' || input.source_phase.status !== 'passed' || !input.source_phase.completed_phases.includes('source_execution'))
            return { status: 'outcome-uncertain', reason: 'scope-observation-source-phase-not-passed' };
        if (input.source_phase.network_id !== input.network_id || input.source_phase.dogfood_id !== input.plan.dogfood_id || input.source_phase.execution_id !== input.plan.execution_id || input.source_phase.plan_digest !== input.plan.plan_digest)
            return { status: 'outcome-uncertain', reason: 'scope-observation-source-phase-binding-invalid' };
        if (input.source_phase.actor_kind !== 'agent-node' || !input.source_phase.actor_identity || !DIGEST.test(input.source_phase.execution_binding_digest ?? '') || !DIGEST.test(input.source_phase.worker_lease_digest ?? ''))
            return { status: 'outcome-uncertain', reason: 'scope-observation-source-phase-evidence-invalid' };
        let observation;
        try {
            observation = await (input.observe ?? observeRealAgentDogfoodGitScope)({ repo_root: input.plan.source_worktree, baseline_commit: input.plan.baseline_commit, allowed_files: [...input.plan.allowed_files] });
        }
        catch {
            return { status: 'outcome-uncertain', reason: 'scope-observation-fact-unavailable' };
        }
        let evidence;
        try {
            evidence = await input.evidence_store.put({ content: JSON.stringify(observation), kind: 'real-agent-dogfood-graph-scope-observation' });
        }
        catch {
            return { status: 'outcome-uncertain', reason: 'scope-observation-evidence-write-failed' };
        }
        if (!DIGEST.test(evidence.digest) || !DIGEST.test(observation.observation_digest))
            return { status: 'outcome-uncertain', reason: 'scope-observation-evidence-invalid' };
        const status = observation.scope.status === 'valid' ? 'passed' : 'blocked';
        const reason = observation.scope.status === 'blocked' ? observation.scope.reason : 'scope-observed';
        const record = createRealAgentDogfoodGraphPhaseRecord({ plan: input.plan, network_id: input.network_id, phase: 'scope_observation', status, completed_phases: status === 'passed' ? ['source_execution', 'scope_observation'] : ['source_execution'], reason, actor_kind: 'coordinator', actor_identity: input.coordinator_id, evidence_digest: evidence.digest, evidence_refs: [evidence.digest, observation.observation_digest], execution_binding_digest: input.source_phase.execution_binding_digest, worker_lease_digest: input.source_phase.worker_lease_digest });
        return { status, reason, evidence_digest: evidence.digest, record };
    };
}
