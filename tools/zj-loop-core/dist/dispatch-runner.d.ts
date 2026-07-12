import { ConsumerRunPlan } from './consumer-runner.js';
import { ConsumerAdapterResult } from './consumer-adapter.js';
export type DispatchMode = 'auto' | 'plan-only' | 'execute' | 'resume';
export type SignalEnvelope = {
    schema: 'zj-loop.signal.v1';
    signal_id: string;
    source: 'github_issue' | 'gitlab_issue' | 'workflow_dispatch' | 'codex' | 'local';
    provider: 'github' | 'gitlab' | 'none';
    subject: {
        kind: 'issue' | 'pr' | 'mr' | 'ci_run' | 'dependency_alert' | 'plan' | 'local_goal';
        id: string;
        url?: string;
    };
    intent: 'triage' | 'fix' | 'activate_roadmap' | 'review_pr' | 'draft_changelog' | 'closeout';
    payload: Record<string, unknown>;
};
export type OrchestrationStatus = 'planned' | 'executed_to_review_artifact' | 'hard_stopped' | 'duplicate' | 'resume' | 'superseded';
export type OrchestrationEnvelope = {
    schema: 'zj-loop.orchestration.v1';
    orchestration_id: string;
    duplicate_key: string;
    duplicate_of?: string;
    resumes?: string;
    status: OrchestrationStatus;
    mode: DispatchMode;
    created_at: string;
    updated_at: string;
    signal: SignalEnvelope;
    route_decision: ConsumerRunPlan['route_decision'];
    carrier_plan: {
        action: 'reuse-source-carrier' | 'create-carrier' | 'none';
        carrier_kind: 'issue' | 'pr' | 'mr' | 'new-issue' | 'local-file' | 'none';
        source_subject: SignalEnvelope['subject'];
        comment_required: boolean;
        reason: string;
    };
    consumer_run_plan: ConsumerRunPlan;
    review_artifact: {
        kind: string;
        path?: string;
        description: string;
    };
    consumer_adapter_result?: ConsumerAdapterResult;
    closeout_hint: {
        required: boolean;
        reason: string;
    };
    stop_signal: null | {
        reason: string;
        next_steps: string[];
    };
    storage: {
        path: string;
    };
};
export declare function readSignalEnvelope(input: {
    path: string;
}): Promise<SignalEnvelope>;
export declare function validateSignalEnvelope(value: unknown): SignalEnvelope;
export declare function dispatchSignal(input: {
    root?: string;
    signal: SignalEnvelope;
    mode?: DispatchMode;
    now?: string;
    env?: Record<string, string | undefined>;
    fetchImpl?: typeof fetch;
}): Promise<OrchestrationEnvelope>;
export declare function getOrchestrationPath(orchestrationId: string): string;
export declare function writeOrchestrationEnvelope(input: {
    root?: string;
    envelope: OrchestrationEnvelope;
}): Promise<void>;
