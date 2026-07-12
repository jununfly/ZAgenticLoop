import { ConsumerRunPlan } from './consumer-runner.js';
import type { OrchestrationEnvelope, SignalEnvelope } from './dispatch-runner.js';
export type ConsumerAdapterStatus = 'executed_to_review_artifact' | 'hard_stopped';
export type ConsumerAdapterResult = {
    schema: 'zj-loop.consumer_adapter_result.v1';
    route_id: string;
    consumer: string;
    consumer_kind: string;
    adapter_status: ConsumerAdapterStatus;
    review_artifacts: Array<{
        path: string;
        kind: string;
        schema: string;
    }>;
    repairs_applied: Array<{
        field: string;
        value: string;
        reason: string;
    }>;
    live_side_effects: {
        attempted: boolean;
        reason?: string;
        execution_scope?: 'external_tool';
        external_tool?: 'github' | 'gitlab';
        side_effect_level?: 'branch_pr';
        status?: 'completed' | 'failed' | 'refused' | 'dry-run';
        idempotency_key?: string;
        review?: {
            kind: 'pull-request' | 'merge-request';
            number?: number | null;
            url?: string;
        };
        branch?: {
            name: string;
            target: string;
        };
        operations?: Array<Record<string, unknown>>;
        refusals?: Array<Record<string, unknown>>;
        provider_result?: Record<string, unknown>;
    };
    next_steps: string[];
    stop_signal?: {
        reason: string;
        next_steps: string[];
    };
};
export declare function runConsumerLiveSideEffects(input: {
    root: string;
    signal: SignalEnvelope;
    envelope: OrchestrationEnvelope;
    env?: Record<string, string | undefined>;
    fetchImpl?: typeof fetch;
}): Promise<ConsumerAdapterResult>;
export declare function executeRoadmapActivationLiveSideEffects(input: {
    signal: SignalEnvelope;
    contractPlan: any;
    env?: Record<string, string | undefined>;
    fetchImpl?: typeof fetch;
}): Promise<ConsumerAdapterResult['live_side_effects']>;
export declare function runConsumerToReviewArtifact(input: {
    root: string;
    signal: SignalEnvelope;
    orchestrationId: string;
    consumerRunPlan: ConsumerRunPlan;
}): Promise<ConsumerAdapterResult>;
