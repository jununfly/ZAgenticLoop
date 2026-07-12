import { ConsumerRunPlan } from './consumer-runner.js';
export type FirstRunGoal = 'auto' | 'smoke' | 'roadmap' | 'issue-backlog' | 'ci' | 'closeout';
export type FirstRunStopSignal = {
    stop_reason: string;
    responsible_layer: string;
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
