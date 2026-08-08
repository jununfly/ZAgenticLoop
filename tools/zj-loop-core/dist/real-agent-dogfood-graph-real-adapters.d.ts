import { createRealAgentDogfoodGraphCleanupAdapter } from './real-agent-dogfood-graph-cleanup-adapter.js';
import { type RealAgentDogfoodGraphConformanceCoordinator } from './real-agent-dogfood-graph-conformance-coordinator.js';
import { createRealAgentDogfoodGraphHumanAcceptanceAdapter } from './real-agent-dogfood-graph-human-acceptance-adapter.js';
import { createRealAgentDogfoodGraphIndependentVerificationAdapter } from './real-agent-dogfood-graph-independent-verification-adapter.js';
import { createRealAgentDogfoodGraphOpnIndependentVerificationAdapter } from './real-agent-dogfood-graph-opn-independent-verification-adapter.js';
import { createRealAgentDogfoodGraphMergeAdapter } from './real-agent-dogfood-graph-merge-adapter.js';
import { createRealAgentDogfoodGraphPostMergeGateAdapter } from './real-agent-dogfood-graph-post-merge-gate-adapter.js';
import { createRealAgentDogfoodGraphScopeObservationAdapter } from './real-agent-dogfood-graph-scope-observation-adapter.js';
import { createRealAgentDogfoodGraphSourceExecutionAdapter } from './real-agent-dogfood-graph-source-execution-adapter.js';
import { type RealAgentDogfoodGraphPlan } from './real-agent-dogfood-graph-orchestrator.js';
import type { SqliteStateStore } from './sqlite-state-store.js';
import { type OpnGraphAtomEnrollmentSnapshot } from './opn-graph-atom-enrollment.js';
type SourceConfig = Omit<Parameters<typeof createRealAgentDogfoodGraphSourceExecutionAdapter>[0], 'plan' | 'network_id'>;
type ScopeConfig = Omit<Parameters<typeof createRealAgentDogfoodGraphScopeObservationAdapter>[0], 'plan' | 'network_id' | 'source_phase'>;
type VerificationConfig = Omit<Parameters<typeof createRealAgentDogfoodGraphIndependentVerificationAdapter>[0], 'plan' | 'network_id' | 'source_phase' | 'scope_phase'>;
type OpnVerificationConfig = Omit<Parameters<typeof createRealAgentDogfoodGraphOpnIndependentVerificationAdapter>[0], 'plan' | 'network_id' | 'source_phase' | 'scope_phase'>;
type HumanAcceptanceConfig = Omit<Parameters<typeof createRealAgentDogfoodGraphHumanAcceptanceAdapter>[0], 'plan' | 'network_id' | 'source_phase' | 'scope_phase' | 'verification_phase' | 'acceptance'> & {
    acceptance?: Parameters<typeof createRealAgentDogfoodGraphHumanAcceptanceAdapter>[0]['acceptance'];
    state_store?: SqliteStateStore;
};
type MergeConfig = Omit<Parameters<typeof createRealAgentDogfoodGraphMergeAdapter>[0], 'plan' | 'network_id' | 'human_acceptance_phase'>;
type PostMergeGateConfig = Omit<Parameters<typeof createRealAgentDogfoodGraphPostMergeGateAdapter>[0], 'plan' | 'network_id' | 'merge_phase'>;
type CleanupConfig = Omit<Parameters<typeof createRealAgentDogfoodGraphCleanupAdapter>[0], 'plan' | 'network_id' | 'prior_phase'>;
export type RealAgentDogfoodGraphRealAdapterConfig = {
    source_execution: SourceConfig;
    scope_observation: ScopeConfig;
    independent_verification: VerificationConfig & {
        opn?: OpnVerificationConfig;
    };
    human_acceptance: HumanAcceptanceConfig;
    merge: MergeConfig;
    post_merge_gate: PostMergeGateConfig;
    cleanup: CleanupConfig;
};
export declare function createRealAgentDogfoodGraphConformanceCoordinatorWithRealAdapters(input: {
    plan: RealAgentDogfoodGraphPlan;
    network_id: string;
    human_id: string;
    coordinator_id: string;
    session_id: string;
    execution_binding_digest: string;
    state_store: SqliteStateStore;
    enrollment?: OpnGraphAtomEnrollmentSnapshot;
    real_adapters: RealAgentDogfoodGraphRealAdapterConfig;
    replay: () => Promise<{
        status: 'passed' | 'blocked' | 'outcome-uncertain';
        integrity_status: 'complete' | 'incomplete';
        read_model_digest: string;
    }>;
}): Promise<RealAgentDogfoodGraphConformanceCoordinator>;
export {};
