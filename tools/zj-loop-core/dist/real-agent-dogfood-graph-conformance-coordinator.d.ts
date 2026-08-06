import { type RealAgentDogfoodGraphConformanceResult } from './real-agent-dogfood-conformance.js';
import { type RealAgentDogfoodGraphPhase, type RealAgentDogfoodGraphPlan } from './real-agent-dogfood-graph-orchestrator.js';
import { type RealAgentDogfoodGraphPhaseRecord } from './real-agent-dogfood-graph-state.js';
import type { SqliteStateStore } from './sqlite-state-store.js';
export type RealAgentDogfoodGraphPhaseAdapterResult = {
    status: 'passed' | 'blocked' | 'outcome-uncertain';
    reason?: string;
    evidence_digest?: string;
    record?: RealAgentDogfoodGraphPhaseRecord;
    /** StateStore revision after adapter-owned facts, before the phase CAS append. */
    state_revision?: number;
};
export type RealAgentDogfoodGraphConformanceCoordinator = {
    run(): Promise<RealAgentDogfoodGraphConformanceResult>;
};
type PhaseAdapters = {
    [phase in RealAgentDogfoodGraphPhase]: () => Promise<RealAgentDogfoodGraphPhaseAdapterResult>;
};
export declare function createRealAgentDogfoodGraphConformanceCoordinator(input: {
    plan: RealAgentDogfoodGraphPlan;
    network_id: string;
    human_id: string;
    coordinator_id: string;
    session_id: string;
    execution_binding_digest: string;
    state_store: SqliteStateStore;
    adapters: PhaseAdapters;
    replay: () => Promise<{
        status: 'passed' | 'blocked' | 'outcome-uncertain';
        integrity_status: 'complete' | 'incomplete';
        read_model_digest: string;
    }>;
}): Promise<RealAgentDogfoodGraphConformanceCoordinator>;
export {};
