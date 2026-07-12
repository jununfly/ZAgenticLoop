import { buildConsumerRunPlan } from './consumer-runner.js';
import { collectProjectEvidenceFacts, createNodeProjectFileSystem } from './project.js';
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
    const projectFacts = await collectProjectEvidenceFacts(createNodeProjectFileSystem(input.root));
    const preconditions = preconditionsFor(route, projectFacts);
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
        automation_allowed: consumerPlan.status !== 'blocked' && !preconditions.some((item) => item.status === 'fail'),
        preconditions,
        automatic_next_steps: automaticNextStepsFor(consumerPlan),
        stop_signals: [
            ...stopSignalsForPreconditions(preconditions),
            ...stopSignalsFor(consumerPlan),
        ],
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
            stop_code: stopCodeFor(plan),
            severity: 'blocked',
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
function preconditionsFor(route, projectFacts) {
    const routeEnabled = route.enabled
        ? pass('route-enabled', `Route ${route.route_id} is enabled`, [`route=${route.route_id}`])
        : fail('route-enabled', `Route ${route.route_id} is disabled`, [`route=${route.route_id}`], [
            `Enable explicitly if appropriate: zj-loop-route enable ${route.route_id}`,
        ]);
    const consumerCapability = route.capability_scopes.length > 0 && route.capability_verifiers.length > 0
        ? pass('consumer-capability', 'Consumer declares scopes and verifiers', [
            `scopes=${route.capability_scopes.join(',')}`,
            `verifiers=${route.capability_verifiers.join(',')}`,
            `max_side_effect_level=${route.max_side_effect_level}`,
        ])
        : fail('consumer-capability', 'Consumer capability metadata is incomplete', [
            `scopes=${route.capability_scopes.join(',') || 'none'}`,
            `verifiers=${route.capability_verifiers.join(',') || 'none'}`,
        ], ['Add Route Table capabilities.scopes and capabilities.verifiers before automatic execution.']);
    const providerSupport = providerPrecondition(route, projectFacts);
    const credentialsAndAuthority = credentialsPrecondition(route, projectFacts);
    const costBudget = costBudgetPrecondition(route, projectFacts);
    const workspaceSafety = workspaceSafetyPrecondition(projectFacts);
    const verificationGates = route.capability_verifiers.length > 0
        ? pass('verification-gates', 'Verification gates are declared by the route capability contract', route.capability_verifiers)
        : fail('verification-gates', 'No verification gates are declared for this route', [], [
            'Add at least one verifier before automatic execution.',
        ]);
    return [
        routeEnabled,
        consumerCapability,
        providerSupport,
        credentialsAndAuthority,
        costBudget,
        workspaceSafety,
        verificationGates,
    ];
}
function providerPrecondition(route, projectFacts) {
    const provider = projectFacts.provider.kind;
    const evidence = [
        `provider=${provider}`,
        `github_actions=${projectFacts.provider.githubActions}`,
        `gitlab_ci=${projectFacts.provider.gitlabCi}`,
    ];
    if (provider === 'manual' && route.side_effecting) {
        return warning('provider-support', 'Provider adapter is not detected; automatic side effects may need manual/local execution', evidence, [
            'Install a matching provider adapter or keep this route in report-only/manual mode.',
        ]);
    }
    return pass('provider-support', `Provider support detected for ${provider}`, evidence);
}
function credentialsPrecondition(route, projectFacts) {
    if (!route.side_effecting || route.request_kind === 'report-only') {
        return pass('credentials-and-authority', 'No provider write credentials are required for report-only first-run evidence', [
            `request_kind=${route.request_kind}`,
        ]);
    }
    return warning('credentials-and-authority', 'Provider credentials and actor permissions must be available at runtime', [
        `provider=${projectFacts.provider.kind}`,
        `side_effect_level=${route.side_effect_level}`,
    ], [
        'Verify workflow token or provider token permissions before live execution.',
        'Verify the triggering actor is allowed by the route or consumer guard.',
    ]);
}
function costBudgetPrecondition(route, projectFacts) {
    const hasBudget = projectFacts.requiredLoopFiles.includes('zj-loop/zj-loop-budget.md');
    if (route.route_id === 'roadmap-sliced-development') {
        return hasBudget
            ? pass('cost-budget', 'Budget file exists and Roadmap-Sliced bounded execution defaults to max_slices=30', [
                'zj-loop/zj-loop-budget.md',
                'max_slices=30',
            ])
            : warning('cost-budget', 'Roadmap-Sliced bounded execution has max_slices=30 but no budget file was found', [
                'max_slices=30',
            ], ['Add zj-loop/zj-loop-budget.md before long-running automation.']);
    }
    return hasBudget
        ? pass('cost-budget', 'Budget file exists', ['zj-loop/zj-loop-budget.md'])
        : warning('cost-budget', 'No budget file found; first-run evidence can continue, but long-running automation should declare a budget', [], [
            'Add zj-loop/zj-loop-budget.md before scheduling recurring or multi-slice automation.',
        ]);
}
function workspaceSafetyPrecondition(projectFacts) {
    return projectFacts.safety.docPresent
        ? pass('workspace-safety', 'Safety policy file exists', ['zj-loop/zj-loop-safety.md'])
        : warning('workspace-safety', 'Safety policy file is missing', [], [
            'Run zj-loop-init . --add safety or add zj-loop/zj-loop-safety.md before side-effecting automation.',
        ]);
}
function stopSignalsForPreconditions(preconditions) {
    return preconditions
        .filter((item) => item.status === 'fail' && item.stop_if_failed)
        .map((item) => ({
        stop_code: 'precondition-failed',
        severity: 'blocked',
        stop_reason: item.summary,
        responsible_layer: 'first-run-precondition',
        evidence: item.evidence,
        next_steps: item.next_steps,
        retry_policy: 'after-configuration-change',
        human_required: true,
        confirmation_location: ['terminal command', 'Route Table or loop policy file review'],
    }));
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
function stopCodeFor(plan) {
    if (!plan.dispatch_allowed)
        return 'route-disabled';
    if (!plan.validation.valid)
        return 'route-contract-invalid';
    if (!plan.execution_ready)
        return 'runner-not-execution-ready';
    return 'execution-blocked';
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
function pass(id, summary, evidence) {
    return { id, status: 'pass', summary, evidence, next_steps: [], stop_if_failed: false };
}
function warning(id, summary, evidence, nextSteps) {
    return { id, status: 'warning', summary, evidence, next_steps: nextSteps, stop_if_failed: false };
}
function fail(id, summary, evidence, nextSteps) {
    return { id, status: 'fail', summary, evidence, next_steps: nextSteps, stop_if_failed: true };
}
