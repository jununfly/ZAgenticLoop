import type { ContentAddressedEvidenceStore } from './content-addressed-evidence-store.js';
import { type RealAgentDogfoodEvent, type RealAgentDogfoodLifecycle } from './real-agent-dogfood-lifecycle.js';
import { type RealAgentDogfoodGraphPhaseRecord } from './real-agent-dogfood-graph-state.js';
import { REAL_AGENT_DOGFOOD_GRAPH_PHASES, type RealAgentDogfoodGraphPlan } from './real-agent-dogfood-graph-orchestrator.js';
import type { StateEvent } from './sqlite-state-store.js';
export type RealAgentDogfoodFailureClass = 'known-rejection' | 'unverifiable-cleanup' | 'unverifiable-evidence' | 'provider-timeout';
export type RealAgentDogfoodReplayRecord = {
    status: 'recorded';
    execution_id: string;
    attempt: number;
    result_digest: string;
};
export type RealAgentDogfoodGraphReplayReadModel = {
    schema: 'zj-loop.real_agent_dogfood_graph_replay.v1';
    status: 'passed' | 'blocked' | 'outcome-uncertain' | 'in-progress';
    integrity_status: 'complete' | 'incomplete';
    network_id: string;
    dogfood_id: string;
    execution_id: string;
    attempt: number;
    plan_digest: string;
    plan_definition_digest: string;
    lifecycle: Pick<RealAgentDogfoodLifecycle, 'status' | 'reason_code' | 'next_action' | 'lifecycle_digest'>;
    graph: {
        current_phase: RealAgentDogfoodGraphPhaseRecord['phase'] | null;
        phase_status: RealAgentDogfoodGraphPhaseRecord['status'] | null;
        completed_phases: RealAgentDogfoodGraphPhaseRecord['completed_phases'];
        next_phase: RealAgentDogfoodGraphPlan['plan_digest'] extends string ? typeof REAL_AGENT_DOGFOOD_GRAPH_PHASES[number] | null : never;
        evidence_refs: string[];
    };
    integrity_failures: string[];
    read_model_digest: string;
};
export declare function replayRealAgentDogfoodGraphReadModel(input: {
    network_id: string;
    plan: RealAgentDogfoodGraphPlan;
    lifecycle_events: readonly RealAgentDogfoodEvent[];
    graph_events: readonly StateEvent[];
    evidenceStore: Pick<ContentAddressedEvidenceStore, 'readOnly'>;
}): Promise<RealAgentDogfoodGraphReplayReadModel>;
export declare function classifyRealAgentDogfoodFailure(failure: string): {
    status: 'blocked' | 'outcome-uncertain';
    reason_code: RealAgentDogfoodFailureClass;
};
export declare function replayRealAgentDogfoodAttempt(input: {
    execution_id: string;
    attempt: number;
    result_digest: string;
    prior: RealAgentDogfoodReplayRecord | {
        status: string;
        execution_id: string;
        attempt: number;
        result_digest: string;
    } | null;
}): RealAgentDogfoodReplayRecord | {
    status: 'idempotent';
    execution_id: string;
    attempt: number;
} | {
    status: 'conflict';
    reason_code: 'attempt-digest-conflict';
} | {
    status: 'new-attempt';
    execution_id: string;
    attempt: number;
};
