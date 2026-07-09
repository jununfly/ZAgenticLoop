import { RouteDecision, RouteStatus } from './route.js';
export type ConsumerRunPlanStatus = 'ready' | 'report-only' | 'blocked';
export type ConsumerRunPlan = {
    schema: 'zj-loop.consumer_run_plan.v1';
    route_id: string;
    consumer: string;
    consumer_kind: string;
    execution_mode: string;
    request_kind: string;
    readiness: string;
    user_project_ready: boolean;
    allowed: boolean;
    status: ConsumerRunPlanStatus;
    reason: string;
    next_steps: string[];
    route_decision: RouteDecision;
    validation: {
        valid: boolean;
        errors: string[];
        warnings: string[];
    };
};
export declare function buildConsumerRunPlan(input: {
    root: string;
    selector: string;
    source?: string;
    signalId?: string;
}): Promise<ConsumerRunPlan>;
export declare function buildConsumerRunPlanFromRoute(input: {
    route: RouteStatus;
    routeDecision: RouteDecision;
}): ConsumerRunPlan;
