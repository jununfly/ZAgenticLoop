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
  const blocked = (reason: string, nextSteps: string[]): ConsumerRunPlan => ({
    schema: 'zj-loop.consumer_run_plan.v1',
    route_id: input.route.route_id,
    consumer: input.route.consumer,
    consumer_kind: input.route.consumer_kind,
    execution_mode: input.route.execution_mode,
    request_kind: input.route.request_kind,
    readiness: input.route.readiness,
    user_project_ready: input.route.user_project_ready,
    allowed: false,
    status: 'blocked',
    reason,
    next_steps: nextSteps,
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
      user_project_ready: input.route.user_project_ready,
      allowed: true,
      status: 'report-only',
      reason: 'report-only route records evidence and does not run worker side effects',
      next_steps: ['Write report evidence to the workflow summary or configured evidence store.'],
      route_decision: input.routeDecision,
      validation,
    };
  }

  if (!input.route.user_project_ready) {
    return blocked('route runner is not user-project-ready', [
      `Current readiness: ${input.route.readiness}`,
      'Do not run user-project side effects until the generated bundle calls a published package runner with evidence.',
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
    user_project_ready: input.route.user_project_ready,
    allowed: true,
    status: 'ready',
    reason: 'route is enabled and user-project-ready',
    next_steps: [`Run packaged ${input.route.consumer} runner.`],
    route_decision: input.routeDecision,
    validation,
  };
}
