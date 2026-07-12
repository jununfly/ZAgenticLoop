import { ConsumerRunPlan } from './consumer-runner.js';
import type { OrchestrationEnvelope, SignalEnvelope } from './dispatch-runner.js';
export type ConsumerAdapterStatus = 'executed_to_review_artifact' | 'executed_to_live_side_effects' | 'resumable' | 'failed' | 'hard_stopped';
export type ActivationFailureClass = 'none' | 'recoverable' | 'terminal';
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
        attempts?: Array<{
            attempt_id: string;
            attempt_number: number;
            attempted_at: string;
            mode: 'execute';
            external_tool: 'github' | 'gitlab';
            operation: string;
            status: 'completed' | 'failed' | 'refused';
            failure_class: ActivationFailureClass;
            reason: string;
            http_status?: number;
            retry_consumed: boolean;
            next_retry_allowed: boolean;
            idempotency_key: string;
            review_url?: string;
            branch_name?: string;
            provider_request_id?: string;
        }>;
    };
    activation_lifecycle?: {
        schema: 'zj-loop.activation_lifecycle_evidence.v1';
        activation_state: 'completed' | 'resumable' | 'failed';
        failure_class: ActivationFailureClass;
        attempt_count: number;
        next_command: string;
        resume_allowed: boolean;
        retry_budget_remaining: number;
        where_to_continue: string;
        reason: string;
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
