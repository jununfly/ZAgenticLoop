import {
  buildRouteDecision,
  findRoute,
  loadRouteTable,
  RouteDecision,
  RouteStatus,
  validateRouteExecutionContract,
} from './route.js';

export type ConsumerRunPlanStatus = 'ready' | 'report-only' | 'blocked';

export type ConsumerRunPlan = {
  schema: 'zj-loop.consumer_run_plan.v1';
  route_id: string;
  consumer: string;
  consumer_kind: string;
  execution_mode: string;
  request_kind: string;
  readiness: string;
  install_ready: boolean;
  execution_ready: boolean;
  user_project_ready: boolean;
  allowed: boolean;
  dispatch_allowed: boolean;
  execution_allowed: boolean;
  status: ConsumerRunPlanStatus;
  reason: string;
  next_steps: string[];
  route_specific_artifacts: Array<{
    path: string;
    role: 'primary-result' | 'supporting-evidence';
    description: string;
  }>;
  route_decision: RouteDecision;
  validation: {
    valid: boolean;
    errors: string[];
    warnings: string[];
  };
};

export async function buildConsumerRunPlan(input: {
  root: string;
  selector: string;
  source?: string;
  signalId?: string;
}): Promise<ConsumerRunPlan> {
  const table = await loadRouteTable(input.root);
  const route = findRoute(table, input.selector);
  const routeDecision = buildRouteDecision({
    table,
    selector: route.route_id,
    source: input.source ?? 'workflow-dispatch',
    signalId: input.signalId,
  });
  return buildConsumerRunPlanFromRoute({ route, routeDecision });
}

export function buildConsumerRunPlanFromRoute(input: {
  route: RouteStatus;
  routeDecision: RouteDecision;
}): ConsumerRunPlan {
  const validation = validateRouteExecutionContract(input.route);
  const routeSpecificArtifacts = routeSpecificArtifactsFor(input.route.route_id);
  const blocked = (reason: string, nextSteps: string[]): ConsumerRunPlan => ({
    schema: 'zj-loop.consumer_run_plan.v1',
    route_id: input.route.route_id,
    consumer: input.route.consumer,
    consumer_kind: input.route.consumer_kind,
    execution_mode: input.route.execution_mode,
    request_kind: input.route.request_kind,
    readiness: input.route.readiness,
    install_ready: input.route.install_ready,
    execution_ready: input.route.execution_ready,
    user_project_ready: input.route.user_project_ready,
    allowed: false,
    dispatch_allowed: input.routeDecision.allowed,
    execution_allowed: false,
    status: 'blocked',
    reason,
    next_steps: [
      ...nextSteps,
      ...artifactNextSteps(routeSpecificArtifacts),
    ],
    route_specific_artifacts: routeSpecificArtifacts,
    route_decision: input.routeDecision,
    validation,
  });

  if (!input.routeDecision.allowed) {
    return blocked('route disabled by Route Table', [
      `Inspect: zj-loop-route status ${input.route.route_id}`,
      `Enable explicitly if appropriate: zj-loop-route enable ${input.route.route_id}`,
    ]);
  }

  if (!validation.valid) {
    return blocked('route execution contract invalid', validation.errors);
  }

  if (input.route.request_kind === 'report-only' && input.route.execution_mode === 'report-only') {
    return {
      schema: 'zj-loop.consumer_run_plan.v1',
      route_id: input.route.route_id,
      consumer: input.route.consumer,
      consumer_kind: input.route.consumer_kind,
      execution_mode: input.route.execution_mode,
      request_kind: input.route.request_kind,
      readiness: input.route.readiness,
      install_ready: input.route.install_ready,
      execution_ready: input.route.execution_ready,
      user_project_ready: input.route.user_project_ready,
      allowed: true,
      dispatch_allowed: true,
      execution_allowed: false,
      status: 'report-only',
      reason: 'report-only route records evidence and does not run worker side effects',
      next_steps: ['Write report evidence to the workflow summary or configured evidence store.'],
      route_specific_artifacts: routeSpecificArtifacts,
      route_decision: input.routeDecision,
      validation,
    };
  }

  if (!input.route.execution_ready) {
    return blocked('route runner is not execution-ready', [
      `Current readiness: ${input.route.readiness}`,
      'Do not run user-project side effects until the route can process real signals into durable carriers and bounded outcomes.',
    ]);
  }

  return {
    schema: 'zj-loop.consumer_run_plan.v1',
    route_id: input.route.route_id,
    consumer: input.route.consumer,
    consumer_kind: input.route.consumer_kind,
    execution_mode: input.route.execution_mode,
    request_kind: input.route.request_kind,
    readiness: input.route.readiness,
    install_ready: input.route.install_ready,
    execution_ready: input.route.execution_ready,
    user_project_ready: input.route.user_project_ready,
    allowed: true,
    dispatch_allowed: true,
    execution_allowed: true,
    status: 'ready',
    reason: 'route is enabled and execution-ready',
    next_steps: [`Run packaged ${input.route.consumer} runner.`],
    route_specific_artifacts: routeSpecificArtifacts,
    route_decision: input.routeDecision,
    validation,
  };
}

function routeSpecificArtifactsFor(routeId: string): ConsumerRunPlan['route_specific_artifacts'] {
  if (routeId === 'roadmap-sliced-development') {
    return [
      {
        path: 'contract-plan.json',
        role: 'primary-result',
        description: 'Roadmap Activation review contract and post-merge closeout contract plan.',
      },
    ];
  }
  if (routeId === 'post-merge-roadmap-closeout') {
    return [
      {
        path: 'closeout-plan.json',
        role: 'primary-result',
        description: 'Post-Merge Roadmap Closeout dry-run/refusal/live-readiness plan.',
      },
    ];
  }
  if (routeId === 'ci-sweeper') {
    return [
      {
        path: 'issue-fix-request-result.json',
        role: 'primary-result',
        description: 'CI Sweeper Issue Fix Request creation/refusal result.',
      },
      {
        path: 'issue-fix-request.md',
        role: 'supporting-evidence',
        description: 'Human-readable Issue Fix Request body when request creation is allowed.',
      },
    ];
  }
  if (routeId === 'dependency-sweeper') {
    return [
      {
        path: 'repair-plan.json',
        role: 'primary-result',
        description: 'Dependency Sweeper repair/refusal/escalation plan.',
      },
    ];
  }
  if (routeId === 'pr-steward-fix-request') {
    return [
      {
        path: 'fix-plan.json',
        role: 'primary-result',
        description: 'PR Steward repair/refusal/escalation plan.',
      },
    ];
  }
  if (routeId === 'changelog-drafter-draft-request') {
    return [
      {
        path: 'draft-plan.json',
        role: 'primary-result',
        description: 'Changelog Drafter draft/refusal/escalation plan.',
      },
    ];
  }
  if (routeId === 'issue-triage-action') {
    return [
      {
        path: 'action-plan.json',
        role: 'primary-result',
        description: 'Issue Triage Action dry-run/refusal/escalation plan.',
      },
    ];
  }
  return [];
}

function artifactNextSteps(artifacts: ConsumerRunPlan['route_specific_artifacts']): string[] {
  if (artifacts.length === 0) return [];
  return artifacts.map((artifact) => `Inspect route-specific artifact: ${artifact.path} (${artifact.description})`);
}
