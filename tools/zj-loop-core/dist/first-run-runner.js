import { buildConsumerRunPlan } from './consumer-runner.js';
import { listRoutes, loadRouteTable } from './route.js';
const GOAL_ROUTE_PREFERENCES = {
    auto: [
        'manual-smoke-report',
        'issue-backlog-triage',
        'roadmap-sliced-development',
        'ci-sweeper',
        'post-merge-roadmap-closeout',
    ],
    smoke: ['manual-smoke-report'],
    roadmap: ['roadmap-sliced-development'],
    'issue-backlog': ['issue-backlog-triage', 'issue-triage-transition'],
    ci: ['ci-sweeper'],
    closeout: ['post-merge-roadmap-closeout'],
};
export async function buildFirstRunPlan(input) {
    const goal = input.goal ?? 'auto';
    const table = await loadRouteTable(input.root);
    const routes = listRoutes(table);
    const route = chooseFirstRunRoute(routes, goal);
    const consumerPlan = await buildConsumerRunPlan({
        root: input.root,
        selector: route.route_id,
        source: input.source ?? 'first-run',
        signalId: input.signalId,
    });
    return {
        schema: 'zj-loop.first_run_plan.v1',
        goal,
        recommended_route: route.route_id,
        recommended_consumer: route.consumer,
        recommendation_reason: recommendationReason(route, goal),
        automation_intent: automationIntent(route),
        automatic_next_steps: automaticNextStepsFor(consumerPlan),
        stop_signals: stopSignalsFor(consumerPlan),
        route_menu: routes.map((item) => routeMenuItem(item, route.route_id)),
        consumer_plan: consumerPlan,
    };
}
function chooseFirstRunRoute(routes, goal) {
    const preferences = GOAL_ROUTE_PREFERENCES[goal];
    for (const routeId of preferences) {
        const route = routes.find((item) => item.route_id === routeId);
        if (route)
            return route;
    }
    const fallback = routes.find((item) => item.enabled) ?? routes[0];
    if (!fallback)
        throw new Error('No routes found in Route Table');
    return fallback;
}
function recommendationReason(route, goal) {
    if (goal === 'auto' && route.route_id === 'manual-smoke-report') {
        return 'manual smoke is the safest first run because it proves provider wiring and Route Table visibility without worker side effects';
    }
    if (!route.enabled)
        return 'route matches the requested goal, but it must be enabled before dispatch';
    if (route.execution_ready)
        return 'route matches the requested goal and is execution-ready';
    if (route.request_kind === 'report-only')
        return 'route records first-run evidence without mutating project state';
    return `route matches the requested goal; current readiness is ${route.readiness}`;
}
function automationIntent(route) {
    if (route.request_kind === 'report-only') {
        return 'record evidence, explain current route readiness, and stop before worker side effects';
    }
    if (route.execution_ready) {
        return 'run the matching consumer automatically until it reaches a bounded review artifact or stop signal';
    }
    return 'prepare the route-specific plan and stop with explicit readiness or authority gaps before live side effects';
}
function automaticNextStepsFor(plan) {
    if (plan.status === 'ready') {
        return [
            `Run packaged ${plan.consumer} consumer for route ${plan.route_id}.`,
            'Write runner evidence and open or update the review artifact when bounded work completes.',
        ];
    }
    if (plan.status === 'report-only') {
        return [
            `Run ${plan.route_id} in report-only mode.`,
            'Write route decision and consumer plan evidence to the workflow summary or configured evidence store.',
        ];
    }
    return [];
}
function stopSignalsFor(plan) {
    if (plan.status !== 'blocked')
        return [];
    const humanRequired = /human|confirm|enable explicitly|permission/i.test(plan.next_steps.join('\n'));
    return [
        {
            stop_reason: plan.reason,
            responsible_layer: responsibleLayerFor(plan),
            evidence: [
                `route=${plan.route_id}`,
                `readiness=${plan.readiness}`,
                `dispatch_allowed=${plan.dispatch_allowed}`,
                `execution_allowed=${plan.execution_allowed}`,
            ],
            next_steps: plan.next_steps,
            retry_policy: retryPolicyFor(plan),
            human_required: humanRequired,
            confirmation_location: humanRequired
                ? ['terminal command', 'workflow_dispatch input', 'GitHub or GitLab issue comment when route-specific protocol requires it']
                : [],
        },
    ];
}
function responsibleLayerFor(plan) {
    if (!plan.dispatch_allowed)
        return 'route-table';
    if (!plan.validation.valid)
        return 'route-contract';
    if (!plan.execution_ready)
        return 'consumer-runner-maturity';
    return 'consumer-runner';
}
function retryPolicyFor(plan) {
    if (!plan.dispatch_allowed || !plan.execution_ready || !plan.validation.valid)
        return 'after-configuration-change';
    return 'same-request';
}
function routeMenuItem(route, recommendedRouteId) {
    return {
        route_id: route.route_id,
        consumer: route.consumer,
        enabled: route.enabled,
        execution_mode: route.execution_mode,
        readiness: route.readiness,
        side_effect_level: route.side_effect_level,
        recommended_for_first_run: route.route_id === recommendedRouteId,
        why: route.route_id === recommendedRouteId ? recommendationReason(route, 'auto') : route.readiness_reasons.join('; '),
    };
}
