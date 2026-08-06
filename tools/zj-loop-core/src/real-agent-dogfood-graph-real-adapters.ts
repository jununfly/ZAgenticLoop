import { createRealAgentDogfoodGraphCleanupAdapter } from './real-agent-dogfood-graph-cleanup-adapter.js';
import { createRealAgentDogfoodGraphConformanceCoordinator, type RealAgentDogfoodGraphConformanceCoordinator, type RealAgentDogfoodGraphPhaseAdapterResult } from './real-agent-dogfood-graph-conformance-coordinator.js';
import { createRealAgentDogfoodGraphHumanAcceptanceAdapter } from './real-agent-dogfood-graph-human-acceptance-adapter.js';
import { createRealAgentDogfoodGraphIndependentVerificationAdapter } from './real-agent-dogfood-graph-independent-verification-adapter.js';
import { createRealAgentDogfoodGraphMergeAdapter } from './real-agent-dogfood-graph-merge-adapter.js';
import { createRealAgentDogfoodGraphPostMergeGateAdapter } from './real-agent-dogfood-graph-post-merge-gate-adapter.js';
import { createRealAgentDogfoodGraphScopeObservationAdapter } from './real-agent-dogfood-graph-scope-observation-adapter.js';
import { createRealAgentDogfoodGraphSourceExecutionAdapter } from './real-agent-dogfood-graph-source-execution-adapter.js';
import { REAL_AGENT_DOGFOOD_GRAPH_PHASES, type RealAgentDogfoodGraphPhase, type RealAgentDogfoodGraphPlan } from './real-agent-dogfood-graph-orchestrator.js';
import { projectRealAgentDogfoodGraphPhaseRecord, type RealAgentDogfoodGraphPhaseRecord } from './real-agent-dogfood-graph-state.js';
import type { SqliteStateStore } from './sqlite-state-store.js';
import { validateOpnGraphAtomEnrollmentSnapshot, type OpnGraphAtomEnrollmentSnapshot } from './opn-graph-atom-enrollment.js';

type SourceConfig = Omit<Parameters<typeof createRealAgentDogfoodGraphSourceExecutionAdapter>[0], 'plan' | 'network_id'>;
type ScopeConfig = Omit<Parameters<typeof createRealAgentDogfoodGraphScopeObservationAdapter>[0], 'plan' | 'network_id' | 'source_phase'>;
type VerificationConfig = Omit<Parameters<typeof createRealAgentDogfoodGraphIndependentVerificationAdapter>[0], 'plan' | 'network_id' | 'source_phase' | 'scope_phase'>;
type HumanAcceptanceConfig = Omit<Parameters<typeof createRealAgentDogfoodGraphHumanAcceptanceAdapter>[0], 'plan' | 'network_id' | 'source_phase' | 'scope_phase' | 'verification_phase'>;
type MergeConfig = Omit<Parameters<typeof createRealAgentDogfoodGraphMergeAdapter>[0], 'plan' | 'network_id' | 'human_acceptance_phase'>;
type PostMergeGateConfig = Omit<Parameters<typeof createRealAgentDogfoodGraphPostMergeGateAdapter>[0], 'plan' | 'network_id' | 'merge_phase'>;
type CleanupConfig = Omit<Parameters<typeof createRealAgentDogfoodGraphCleanupAdapter>[0], 'plan' | 'network_id' | 'prior_phase'>;

export type RealAgentDogfoodGraphRealAdapterConfig = {
  source_execution: SourceConfig;
  scope_observation: ScopeConfig;
  independent_verification: VerificationConfig;
  human_acceptance: HumanAcceptanceConfig;
  merge: MergeConfig;
  post_merge_gate: PostMergeGateConfig;
  cleanup: CleanupConfig;
};

type PhaseResults = Partial<Record<RealAgentDogfoodGraphPhase, RealAgentDogfoodGraphPhaseRecord>>;

function remember(results: PhaseResults, result: RealAgentDogfoodGraphPhaseAdapterResult): void {
  if (result.record) results[result.record.phase] = result.record;
}

async function loadPhaseResults(input: { stateStore: SqliteStateStore; plan: RealAgentDogfoodGraphPlan; network_id: string }): Promise<PhaseResults> {
  const snapshot = await input.stateStore.readEvents({ network_id: input.network_id, aggregate_type: 'real-agent-dogfood-graph', aggregate_id: input.plan.dogfood_id });
  const results: PhaseResults = {};
  for (const event of snapshot.events) {
    const record = event.payload as RealAgentDogfoodGraphPhaseRecord;
    if (REAL_AGENT_DOGFOOD_GRAPH_PHASES.includes(record.phase)) results[record.phase] = record;
  }
  projectRealAgentDogfoodGraphPhaseRecord({ plan: input.plan, events: snapshot.events });
  return results;
}

export async function createRealAgentDogfoodGraphConformanceCoordinatorWithRealAdapters(input: {
  plan: RealAgentDogfoodGraphPlan;
  network_id: string;
  human_id: string;
  coordinator_id: string;
  session_id: string;
  execution_binding_digest: string;
  state_store: SqliteStateStore;
  enrollment?: OpnGraphAtomEnrollmentSnapshot;
  real_adapters: RealAgentDogfoodGraphRealAdapterConfig;
  replay: () => Promise<{ status: 'passed' | 'blocked' | 'outcome-uncertain'; integrity_status: 'complete' | 'incomplete'; read_model_digest: string }>;
}): Promise<RealAgentDogfoodGraphConformanceCoordinator> {
  if (input.enrollment) {
    const enrollment = validateOpnGraphAtomEnrollmentSnapshot(input.enrollment);
    if (enrollment.status === 'blocked') throw new Error(`graph-atom-enrollment-${enrollment.reason}`);
    if (input.enrollment.network_id !== input.network_id || input.enrollment.center.human_id !== input.human_id) throw new Error('graph-atom-enrollment-coordinator-binding-invalid');
  }
  const phaseResults = await loadPhaseResults({ stateStore: input.state_store, plan: input.plan, network_id: input.network_id });
  const runAndRemember = async (run: () => Promise<RealAgentDogfoodGraphPhaseAdapterResult>) => {
    const result = await run();
    remember(phaseResults, result);
    return result;
  };
  const adapters = {
    source_execution: () => runAndRemember(() => createRealAgentDogfoodGraphSourceExecutionAdapter({ ...input.real_adapters.source_execution, plan: input.plan, network_id: input.network_id })()),
    scope_observation: () => runAndRemember(() => {
      const source_phase = phaseResults.source_execution;
      return source_phase ? createRealAgentDogfoodGraphScopeObservationAdapter({ ...input.real_adapters.scope_observation, plan: input.plan, network_id: input.network_id, source_phase })() : Promise.resolve({ status: 'outcome-uncertain' as const, reason: 'real-adapter-source-phase-unavailable' });
    }),
    independent_verification: () => runAndRemember(() => {
      const source_phase = phaseResults.source_execution;
      const scope_phase = phaseResults.scope_observation;
      return source_phase && scope_phase ? createRealAgentDogfoodGraphIndependentVerificationAdapter({ ...input.real_adapters.independent_verification, plan: input.plan, network_id: input.network_id, source_phase, scope_phase })() : Promise.resolve({ status: 'outcome-uncertain' as const, reason: 'real-adapter-verification-prerequisite-unavailable' });
    }),
    human_acceptance: () => runAndRemember(() => {
      const source_phase = phaseResults.source_execution;
      const scope_phase = phaseResults.scope_observation;
      const verification_phase = phaseResults.independent_verification;
      return source_phase && scope_phase && verification_phase ? createRealAgentDogfoodGraphHumanAcceptanceAdapter({ ...input.real_adapters.human_acceptance, plan: input.plan, network_id: input.network_id, source_phase, scope_phase, verification_phase })() : Promise.resolve({ status: 'outcome-uncertain' as const, reason: 'real-adapter-human-acceptance-prerequisite-unavailable' });
    }),
    merge: () => runAndRemember(() => {
      const human_acceptance_phase = phaseResults.human_acceptance;
      return human_acceptance_phase ? createRealAgentDogfoodGraphMergeAdapter({ ...input.real_adapters.merge, plan: input.plan, network_id: input.network_id, human_acceptance_phase })() : Promise.resolve({ status: 'outcome-uncertain' as const, reason: 'real-adapter-merge-prerequisite-unavailable' });
    }),
    post_merge_gate: () => runAndRemember(() => {
      const merge_phase = phaseResults.merge;
      return merge_phase ? createRealAgentDogfoodGraphPostMergeGateAdapter({ ...input.real_adapters.post_merge_gate, plan: input.plan, network_id: input.network_id, merge_phase })() : Promise.resolve({ status: 'outcome-uncertain' as const, reason: 'real-adapter-post-merge-prerequisite-unavailable' });
    }),
    cleanup: () => runAndRemember(() => {
      const prior_phase = phaseResults.post_merge_gate ?? phaseResults.merge;
      return prior_phase ? createRealAgentDogfoodGraphCleanupAdapter({ ...input.real_adapters.cleanup, plan: input.plan, network_id: input.network_id, prior_phase })() : Promise.resolve({ status: 'outcome-uncertain' as const, reason: 'real-adapter-cleanup-prerequisite-unavailable' });
    }),
  };
  return createRealAgentDogfoodGraphConformanceCoordinator({ plan: input.plan, network_id: input.network_id, human_id: input.human_id, coordinator_id: input.coordinator_id, session_id: input.session_id, execution_binding_digest: input.execution_binding_digest, state_store: input.state_store, adapters, replay: input.replay });
}
