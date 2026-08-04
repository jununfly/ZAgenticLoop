import type { SqliteStateStore, StateEvent } from './sqlite-state-store.js';
import { type RealAgentDogfoodGraphPhase, type RealAgentDogfoodGraphPlan } from './real-agent-dogfood-graph-orchestrator.js';
export declare const REAL_AGENT_DOGFOOD_GRAPH_STATE_SCHEMA: "zj-loop.real_agent_dogfood_graph_state.v1";
export declare const REAL_AGENT_DOGFOOD_GRAPH_STATE_AGGREGATE: "real-agent-dogfood-graph";
export declare const REAL_AGENT_DOGFOOD_GRAPH_STATE_EVENT: "real-agent-dogfood-graph.phase-recorded";
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
};
export declare function createRealAgentDogfoodGraphPhaseRecord(input: {
    plan: RealAgentDogfoodGraphPlan;
    network_id: string;
    phase: RealAgentDogfoodGraphPhase;
    status: RealAgentDogfoodGraphPhaseRecord['status'];
    completed_phases: readonly RealAgentDogfoodGraphPhase[];
    reason?: string;
}): RealAgentDogfoodGraphPhaseRecord;
export declare function projectRealAgentDogfoodGraphPhaseRecord(input: {
    plan: RealAgentDogfoodGraphPlan;
    events: readonly StateEvent[];
}): RealAgentDogfoodGraphPhaseRecord | null;
export declare function appendRealAgentDogfoodGraphPhaseRecord(input: {
    stateStore: SqliteStateStore;
    plan: RealAgentDogfoodGraphPlan;
    network_id: string;
    record: RealAgentDogfoodGraphPhaseRecord;
    expected_revision: number;
    now?: string;
}): Promise<{
    status: 'recorded' | 'duplicate' | 'conflict';
    revision?: number;
    current_revision: number;
    reason?: string;
}>;
