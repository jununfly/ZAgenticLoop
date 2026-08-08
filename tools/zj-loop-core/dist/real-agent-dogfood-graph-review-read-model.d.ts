import type { RealAgentDogfoodGraphPlan } from './real-agent-dogfood-graph-orchestrator.js';
import type { RealAgentDogfoodGraphReplayReadModel } from './real-agent-dogfood-replay.js';
export declare const REAL_AGENT_DOGFOOD_GRAPH_REVIEW_READ_MODEL_SCHEMA: "zj-loop.real_agent_dogfood_graph_review_read_model.v1";
export type RealAgentDogfoodGraphReviewStatus = 'in-progress' | 'pending-human-review' | 'approved' | 'blocked' | 'outcome-uncertain';
export type RealAgentDogfoodGraphReviewReadModel = {
    schema: typeof REAL_AGENT_DOGFOOD_GRAPH_REVIEW_READ_MODEL_SCHEMA;
    status: RealAgentDogfoodGraphReviewStatus;
    side_effects_executed: false;
    network_id: string;
    graph_id: string;
    event: {
        event_id: string;
        title: string;
    };
    plan: {
        plan_id: string;
        plan_revision: number;
        plan_digest: string;
    };
    lifecycle: RealAgentDogfoodGraphReplayReadModel['lifecycle'];
    current_phase: RealAgentDogfoodGraphReplayReadModel['graph']['current_phase'];
    phase_status: RealAgentDogfoodGraphReplayReadModel['graph']['phase_status'];
    completed_phases: RealAgentDogfoodGraphReplayReadModel['graph']['completed_phases'];
    next_phase: RealAgentDogfoodGraphReplayReadModel['graph']['next_phase'];
    evidence_refs: string[];
    blocking_reasons: string[];
    next_action: {
        kind: 'wait-graph' | 'human-review' | 'inspect-blocker' | 'done';
        label: string;
    };
    source_replay_digest: string;
    read_model_digest: string;
};
export declare function projectRealAgentDogfoodGraphReviewReadModel(input: {
    plan: RealAgentDogfoodGraphPlan;
    replay: RealAgentDogfoodGraphReplayReadModel;
    network_id: string;
}): RealAgentDogfoodGraphReviewReadModel;
