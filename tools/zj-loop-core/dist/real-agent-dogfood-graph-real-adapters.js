import { createRealAgentDogfoodGraphCleanupAdapter } from './real-agent-dogfood-graph-cleanup-adapter.js';
import { createRealAgentDogfoodGraphConformanceCoordinator } from './real-agent-dogfood-graph-conformance-coordinator.js';
import { createRealAgentDogfoodGraphHumanAcceptanceAdapter } from './real-agent-dogfood-graph-human-acceptance-adapter.js';
import { createRealAgentDogfoodGraphHumanAcceptanceStateStoreAdapter } from './real-agent-dogfood-graph-human-acceptance-state-store-adapter.js';
import { createRealAgentDogfoodGraphIndependentVerificationAdapter } from './real-agent-dogfood-graph-independent-verification-adapter.js';
import { createRealAgentDogfoodGraphOpnIndependentVerificationAdapter } from './real-agent-dogfood-graph-opn-independent-verification-adapter.js';
import { createRealAgentDogfoodGraphMergeAdapter } from './real-agent-dogfood-graph-merge-adapter.js';
import { createRealAgentDogfoodGraphPostMergeGateAdapter } from './real-agent-dogfood-graph-post-merge-gate-adapter.js';
import { createRealAgentDogfoodGraphScopeObservationAdapter } from './real-agent-dogfood-graph-scope-observation-adapter.js';
import { createRealAgentDogfoodGraphSourceExecutionAdapter } from './real-agent-dogfood-graph-source-execution-adapter.js';
import { REAL_AGENT_DOGFOOD_GRAPH_PHASES } from './real-agent-dogfood-graph-orchestrator.js';
import { projectRealAgentDogfoodGraphPhaseRecord } from './real-agent-dogfood-graph-state.js';
import { validateOpnGraphAtomEnrollmentSnapshot } from './opn-graph-atom-enrollment.js';
function remember(results, result) {
    if (result.record)
        results[result.record.phase] = result.record;
}
async function loadPhaseResults(input) {
    const snapshot = await input.stateStore.readEvents({ network_id: input.network_id, aggregate_type: 'real-agent-dogfood-graph', aggregate_id: input.plan.dogfood_id });
    const results = {};
    for (const event of snapshot.events) {
        const record = event.payload;
        if (REAL_AGENT_DOGFOOD_GRAPH_PHASES.includes(record.phase))
            results[record.phase] = record;
    }
    projectRealAgentDogfoodGraphPhaseRecord({ plan: input.plan, events: snapshot.events });
    return results;
}
export async function createRealAgentDogfoodGraphConformanceCoordinatorWithRealAdapters(input) {
    if (input.enrollment) {
        const enrollment = validateOpnGraphAtomEnrollmentSnapshot(input.enrollment);
        if (enrollment.status === 'blocked')
            throw new Error(`graph-atom-enrollment-${enrollment.reason}`);
        if (input.enrollment.network_id !== input.network_id || input.enrollment.center.human_id !== input.human_id)
            throw new Error('graph-atom-enrollment-coordinator-binding-invalid');
    }
    const phaseResults = await loadPhaseResults({ stateStore: input.state_store, plan: input.plan, network_id: input.network_id });
    const runAndRemember = async (run) => {
        const result = await run();
        remember(phaseResults, result);
        return result;
    };
    const adapters = {
        source_execution: () => runAndRemember(() => createRealAgentDogfoodGraphSourceExecutionAdapter({ ...input.real_adapters.source_execution, plan: input.plan, network_id: input.network_id })()),
        scope_observation: () => runAndRemember(() => {
            const source_phase = phaseResults.source_execution;
            return source_phase ? createRealAgentDogfoodGraphScopeObservationAdapter({ ...input.real_adapters.scope_observation, plan: input.plan, network_id: input.network_id, source_phase })() : Promise.resolve({ status: 'outcome-uncertain', reason: 'real-adapter-source-phase-unavailable' });
        }),
        independent_verification: () => runAndRemember(() => {
            const source_phase = phaseResults.source_execution;
            const scope_phase = phaseResults.scope_observation;
            if (!source_phase || !scope_phase)
                return Promise.resolve({ status: 'outcome-uncertain', reason: 'real-adapter-verification-prerequisite-unavailable' });
            const config = input.real_adapters.independent_verification;
            return config.opn
                ? createRealAgentDogfoodGraphOpnIndependentVerificationAdapter({ ...config.opn, plan: input.plan, network_id: input.network_id, source_phase, scope_phase })()
                : createRealAgentDogfoodGraphIndependentVerificationAdapter({ ...config, plan: input.plan, network_id: input.network_id, source_phase, scope_phase })();
        }),
        human_acceptance: () => runAndRemember(() => {
            const source_phase = phaseResults.source_execution;
            const scope_phase = phaseResults.scope_observation;
            const verification_phase = phaseResults.independent_verification;
            if (!source_phase || !scope_phase || !verification_phase)
                return Promise.resolve({ status: 'outcome-uncertain', reason: 'real-adapter-human-acceptance-prerequisite-unavailable' });
            const config = input.real_adapters.human_acceptance;
            if (config.state_store) {
                return createRealAgentDogfoodGraphHumanAcceptanceStateStoreAdapter({ ...config, stateStore: config.state_store, plan: input.plan, network_id: input.network_id, source_phase, scope_phase, verification_phase })();
            }
            return config.acceptance ? createRealAgentDogfoodGraphHumanAcceptanceAdapter({ ...config, acceptance: config.acceptance, plan: input.plan, network_id: input.network_id, source_phase, scope_phase, verification_phase })() : Promise.resolve({ status: 'outcome-uncertain', reason: 'real-adapter-human-acceptance-fact-source-unavailable' });
        }),
        merge: () => runAndRemember(() => {
            const human_acceptance_phase = phaseResults.human_acceptance;
            return human_acceptance_phase ? createRealAgentDogfoodGraphMergeAdapter({ ...input.real_adapters.merge, plan: input.plan, network_id: input.network_id, human_acceptance_phase })() : Promise.resolve({ status: 'outcome-uncertain', reason: 'real-adapter-merge-prerequisite-unavailable' });
        }),
        post_merge_gate: () => runAndRemember(() => {
            const merge_phase = phaseResults.merge;
            return merge_phase ? createRealAgentDogfoodGraphPostMergeGateAdapter({ ...input.real_adapters.post_merge_gate, plan: input.plan, network_id: input.network_id, merge_phase })() : Promise.resolve({ status: 'outcome-uncertain', reason: 'real-adapter-post-merge-prerequisite-unavailable' });
        }),
        cleanup: () => runAndRemember(() => {
            const prior_phase = phaseResults.post_merge_gate ?? phaseResults.merge;
            return prior_phase ? createRealAgentDogfoodGraphCleanupAdapter({ ...input.real_adapters.cleanup, plan: input.plan, network_id: input.network_id, prior_phase })() : Promise.resolve({ status: 'outcome-uncertain', reason: 'real-adapter-cleanup-prerequisite-unavailable' });
        }),
    };
    return createRealAgentDogfoodGraphConformanceCoordinator({ plan: input.plan, network_id: input.network_id, human_id: input.human_id, coordinator_id: input.coordinator_id, session_id: input.session_id, execution_binding_digest: input.execution_binding_digest, state_store: input.state_store, adapters, replay: input.replay });
}
