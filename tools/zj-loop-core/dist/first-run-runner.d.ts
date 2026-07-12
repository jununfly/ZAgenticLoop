import { ConsumerRunPlan, ConsumerRunPlanStatus } from './consumer-runner.js';
export type FirstRunGoal = 'auto' | 'smoke' | 'roadmap' | 'issue-backlog' | 'ci' | 'closeout';
export type FirstRunStopSignal = {
    stop_code: 'route-disabled' | 'route-contract-invalid' | 'runner-not-execution-ready' | 'precondition-failed' | 'execution-blocked';
    severity: 'warning' | 'blocked';
    stop_reason: string;
    responsible_layer: 'route-table' | 'route-contract' | 'consumer-runner-maturity' | 'consumer-runner' | 'first-run-precondition';
    evidence: string[];
    next_steps: string[];
    retry_policy: 'same-request' | 'new-request' | 'after-configuration-change';
    human_required: boolean;
    confirmation_location: string[];
};
export type FirstRunPrecondition = {
    id: 'route-enabled' | 'consumer-capability' | 'provider-support' | 'credentials-and-authority' | 'cost-budget' | 'workspace-safety' | 'verification-gates';
    status: 'pass' | 'warning' | 'fail';
    summary: string;
    evidence: string[];
    next_steps: string[];
    stop_if_failed: boolean;
};
export type FirstRunDispatchHandoff = {
    route_id: string;
    consumer: string;
    dispatch_status: 'ready' | 'report-only' | 'blocked';
    dispatch_mode: 'report-evidence' | 'request-carrier' | 'consumer-runner' | 'none';
    request_carrier_required: boolean;
    packaged_command: string | null;
    input_contract: string[];
    output_artifacts: Array<{
        path: string;
        role: 'primary-result' | 'supporting-evidence';
        description: string;
    }>;
    review_handoff: string[];
    closeout_handoff: string[];
    next_steps: string[];
};
export type FirstRunExecutionSummary = {
    status: 'automation-ready' | 'report-only' | 'blocked';
    one_line: string;
    recommended_next_action: string;
};
export type FirstRunEvidenceIndexItem = {
    source: 'route-table' | 'consumer-plan' | 'precondition' | 'stop-signal' | 'dispatch-handoff';
    key: string;
    status: string;
    evidence: string[];
};
export type FirstRunStateExplanation = {
    route_enabled: boolean;
    route_readiness: string;
    consumer_status: ConsumerRunPlanStatus;
    automation_allowed_reason: string;
    capability_level: {
        install_ready: boolean;
        execution_ready: boolean;
        user_project_ready: boolean;
    };
};
export type FirstRunFailureReplay = {
    available: boolean;
    failed_layers: string[];
    stop_codes: string[];
    replay_steps: string[];
    evidence: string[];
};
export type FirstRunPlan = {
    schema: 'zj-loop.first_run_plan.v1';
    goal: FirstRunGoal;
    recommended_route: string;
    recommended_consumer: string;
    recommendation_reason: string;
    automation_intent: string;
    automation_allowed: boolean;
    preconditions: FirstRunPrecondition[];
    automatic_next_steps: string[];
    stop_signals: FirstRunStopSignal[];
    dispatch_handoff: FirstRunDispatchHandoff;
    execution_summary: FirstRunExecutionSummary;
    evidence_index: FirstRunEvidenceIndexItem[];
    state_explanation: FirstRunStateExplanation;
    failure_replay: FirstRunFailureReplay;
    route_menu: Array<{
        route_id: string;
        consumer: string;
        enabled: boolean;
        execution_mode: string;
        readiness: string;
        side_effect_level: string;
        recommended_for_first_run: boolean;
        why: string;
    }>;
    consumer_plan: ConsumerRunPlan;
};
export declare function buildFirstRunPlan(input: {
    root: string;
    goal?: FirstRunGoal;
    source?: string;
    signalId?: string;
}): Promise<FirstRunPlan>;
