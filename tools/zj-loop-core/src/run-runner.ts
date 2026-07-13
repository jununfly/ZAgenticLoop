import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildConsumerRunPlan, ConsumerRunPlan } from './consumer-runner.js';
import {
  LOOP_HARNESS_OUTPUT_SCHEMA,
  LOOP_HARNESS_SCHEMA_VERSION,
  LoopHarnessProtocolOutput,
} from './harness-protocol-contract.js';
import { evaluateRuntimePreflight, RuntimePreflightResult } from './preflight.js';
import { findRoute, loadRouteTable } from './route.js';

export type LoopRunStatusReason =
  | 'review-artifact-ready'
  | 'report-evidence-ready'
  | 'missing-runner-capability'
  | 'ambiguous-route'
  | 'needs-protocol-repair'
  | 'runtime-preflight-hard-stop';

export type LoopRunStateRecord = {
  schema: 'zj-loop.run_state.v1';
  schema_version: typeof LOOP_HARNESS_SCHEMA_VERSION;
  run_id: string;
  created_at: string;
  updated_at: string;
  goal: string;
  route_id: string;
  status: string;
  machine_envelope: LoopHarnessProtocolOutput['machine_envelope'];
  stop_signal?: unknown;
  confirmation_request?: unknown;
  resume_command?: string;
  review_artifacts: unknown[];
  evidence: unknown[];
};

export type LoopRunGoalInput = {
  root?: string;
  goal?: string;
  route?: string;
  planOnly?: boolean;
  source?: string;
  signalId?: string;
  runId?: string;
  now?: string;
};

const ROUTE_GOAL_RULES: Array<{ route: string; patterns: RegExp[] }> = [
  {
    route: 'roadmap-sliced-development',
    patterns: [/\broadmap\b/i, /\bplan\b/i, /\bprd\b/i, /implementation plan/i],
  },
  {
    route: 'issue-backlog-triage',
    patterns: [/issue backlog/i, /triage open issues/i, /classify issues/i],
  },
  {
    route: 'ci-sweeper',
    patterns: [/\bci\b/i, /failing workflow/i, /test failure/i],
  },
  {
    route: 'post-merge-roadmap-closeout',
    patterns: [/post-merge/i, /\bcloseout\b/i, /merged pr/i],
  },
  {
    route: 'manual-smoke-report',
    patterns: [/\bsmoke\b/i, /first run/i, /validate setup/i],
  },
];

export async function runLoopGoal(input: LoopRunGoalInput): Promise<LoopHarnessProtocolOutput> {
  const now = input.now ?? new Date().toISOString();
  const runId = input.runId ?? `run-${Date.now()}`;
  const goal = String(input.goal ?? '').trim();
  const routeResolution = resolveLoopRunRoute({ goal, explicitRoute: input.route });

  if (!routeResolution.ok) {
    return buildStoppedOutput({
      runId,
      goal,
      routeId: routeResolution.recommended_route ?? 'unknown',
      consumer: 'unknown',
      reason: routeResolution.reason,
      now,
      repairsApplied: ['run_id', 'created_at', 'tool'],
      stopSignal: {
        reason: routeResolution.reason,
        candidate_routes: routeResolution.candidate_routes,
        recommended_route: routeResolution.recommended_route,
      },
    });
  }

  const consumerPlan = await buildConsumerRunPlan({
    root: input.root ?? '.',
    selector: routeResolution.route_id,
    source: input.source ?? 'zj-loop-run',
    signalId: input.signalId ?? runId,
  });
  const route = findRoute(await loadRouteTable(input.root ?? '.'), consumerPlan.route_id);
  const preflightResult = evaluateRuntimePreflight({
    route,
    executionLayer: executionLayerForRun({ consumerPlan, planOnly: input.planOnly === true }),
    signal: {
      provider: 'none',
      subject: { kind: 'local_goal', id: runId },
      intent: intentForRoute(consumerPlan.route_id),
      signal_id: input.signalId ?? runId,
    },
    runtime: {
      workUnitsRequested: 1,
    },
  });

  if (preflightResult.status === 'hard_stop') {
    return buildStoppedOutput({
      runId,
      goal,
      routeId: consumerPlan.route_id,
      consumer: consumerPlan.consumer,
      reason: 'runtime-preflight-hard-stop',
      now,
      repairsApplied: [
        'run_id',
        'created_at',
        'tool',
      ],
      stopSignal: preflightResult.stop_signal ?? { reason: 'runtime preflight hard stopped' },
      artifacts: consumerPlan.route_specific_artifacts,
      preflightResult,
    });
  }

  return buildOutputFromConsumerPlan({
    goal,
    runId,
    now,
    consumerPlan,
    planOnly: input.planOnly === true,
    preflightResult,
    repairsApplied: [
      'run_id',
      'created_at',
      'tool',
      'max_slices',
      'evidence_target',
      'closeout_strategy',
      'authority',
      'review_artifact_target',
    ],
  });
}

export function resolveLoopRunRoute(input: {
  goal?: string;
  explicitRoute?: string;
}):
  | { ok: true; route_id: string; reason: string; candidate_routes: string[] }
  | {
      ok: false;
      reason: LoopRunStatusReason;
      candidate_routes: string[];
      recommended_route?: string;
    } {
  if (input.explicitRoute && input.explicitRoute.trim()) {
    return {
      ok: true,
      route_id: input.explicitRoute.trim(),
      reason: 'explicit-route',
      candidate_routes: [input.explicitRoute.trim()],
    };
  }

  const goal = String(input.goal ?? '').trim();
  if (!goal) {
    return { ok: false, reason: 'needs-protocol-repair', candidate_routes: [] };
  }

  const candidates = ROUTE_GOAL_RULES
    .filter((rule) => rule.patterns.some((pattern) => pattern.test(goal)))
    .map((rule) => rule.route);

  if (candidates.length === 1) {
    return { ok: true, route_id: candidates[0], reason: 'deterministic-goal-match', candidate_routes: candidates };
  }

  if (candidates.length > 1) {
    return {
      ok: false,
      reason: 'ambiguous-route',
      candidate_routes: candidates,
      recommended_route: candidates[0],
    };
  }

  return { ok: false, reason: 'ambiguous-route', candidate_routes: [], recommended_route: 'manual-smoke-report' };
}

export function getLoopRunStatePath(runId: string): string {
  return `zj-loop/runs/${sanitizeRunId(runId)}.json`;
}

export function buildLoopRunStateRecord(input: {
  goal: string;
  output: LoopHarnessProtocolOutput;
  createdAt?: string;
  updatedAt?: string;
}): LoopRunStateRecord {
  const envelope = input.output.machine_envelope;
  const now = input.updatedAt ?? new Date().toISOString();
  return {
    schema: 'zj-loop.run_state.v1',
    schema_version: LOOP_HARNESS_SCHEMA_VERSION,
    run_id: envelope.run_id,
    created_at: input.createdAt ?? now,
    updated_at: now,
    goal: input.goal,
    route_id: envelope.route_id,
    status: envelope.status,
    machine_envelope: envelope,
    stop_signal: envelope.stop_signal,
    confirmation_request: envelope.confirmation_request,
    resume_command: typeof envelope.resume === 'object' && envelope.resume !== null
      ? `zj-loop-run --resume ${envelope.run_id}`
      : undefined,
    review_artifacts: envelope.artifacts,
    evidence: envelope.evidence,
  };
}

export async function writeLoopRunState(input: {
  root?: string;
  goal: string;
  output: LoopHarnessProtocolOutput;
  now?: string;
}): Promise<{ path: string; record: LoopRunStateRecord }> {
  const record = buildLoopRunStateRecord({
    goal: input.goal,
    output: input.output,
    createdAt: input.now,
    updatedAt: input.now,
  });
  const relativePath = getLoopRunStatePath(record.run_id);
  const absolutePath = path.resolve(input.root ?? '.', relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(record, null, 2)}\n`);
  return { path: relativePath, record };
}

export async function readLoopRunState(input: {
  root?: string;
  runId: string;
}): Promise<LoopRunStateRecord> {
  const relativePath = getLoopRunStatePath(input.runId);
  const absolutePath = path.resolve(input.root ?? '.', relativePath);
  return JSON.parse(await readFile(absolutePath, 'utf8')) as LoopRunStateRecord;
}

function buildOutputFromConsumerPlan(input: {
  goal: string;
  runId: string;
  now: string;
  consumerPlan: ConsumerRunPlan;
  planOnly: boolean;
  preflightResult: RuntimePreflightResult;
  repairsApplied: string[];
}): LoopHarnessProtocolOutput {
  const { consumerPlan } = input;
  if (input.planOnly || consumerPlan.status === 'report-only') {
    return {
      schema: LOOP_HARNESS_OUTPUT_SCHEMA,
      schema_version: LOOP_HARNESS_SCHEMA_VERSION,
      human_summary: `${consumerPlan.route_id} produced a reviewable run plan.`,
      machine_envelope: {
        status: 'in_progress',
        run_id: input.runId,
        route_id: consumerPlan.route_id,
        consumer: consumerPlan.consumer,
        completed_steps: ['resolved-route', 'built-consumer-run-plan'],
        next_action: {
          type: 'write_local_evidence',
          target: `route:${consumerPlan.route_id}`,
          label: consumerPlan.reason,
        },
        evidence: evidenceFor(input, consumerPlan, input.preflightResult),
        artifacts: consumerPlan.route_specific_artifacts,
        preflight_result: input.preflightResult,
        repairs_applied: input.repairsApplied,
        run_state_path: getLoopRunStatePath(input.runId),
      },
    };
  }

  if (consumerPlan.status === 'ready') {
    return {
      schema: LOOP_HARNESS_OUTPUT_SCHEMA,
      schema_version: LOOP_HARNESS_SCHEMA_VERSION,
      human_summary: `${consumerPlan.route_id} is ready to run until its first review artifact.`,
      machine_envelope: {
        status: 'in_progress',
        run_id: input.runId,
        route_id: consumerPlan.route_id,
        consumer: consumerPlan.consumer,
        completed_steps: ['resolved-route', 'built-consumer-run-plan'],
        next_action: {
          type: 'create_review_artifact',
          target: `route:${consumerPlan.route_id}`,
          label: 'Run the packaged consumer until the first review artifact or hard stop signal.',
        },
        evidence: evidenceFor(input, consumerPlan, input.preflightResult),
        artifacts: consumerPlan.route_specific_artifacts,
        preflight_result: input.preflightResult,
        repairs_applied: input.repairsApplied,
        run_state_path: getLoopRunStatePath(input.runId),
      },
    };
  }

  return buildStoppedOutput({
    runId: input.runId,
    goal: input.goal,
    routeId: consumerPlan.route_id,
    consumer: consumerPlan.consumer,
    reason: 'missing-runner-capability',
    now: input.now,
    repairsApplied: input.repairsApplied,
    stopSignal: {
      reason: consumerPlan.reason,
      next_steps: consumerPlan.next_steps,
      readiness: consumerPlan.readiness,
    },
    artifacts: consumerPlan.route_specific_artifacts,
    preflightResult: input.preflightResult,
  });
}

function buildStoppedOutput(input: {
  runId: string;
  goal: string;
  routeId: string;
  consumer: string;
  reason: LoopRunStatusReason;
  now: string;
  repairsApplied: string[];
  stopSignal: unknown;
  artifacts?: unknown[];
  preflightResult?: RuntimePreflightResult;
}): LoopHarnessProtocolOutput {
  return {
    schema: LOOP_HARNESS_OUTPUT_SCHEMA,
    schema_version: LOOP_HARNESS_SCHEMA_VERSION,
    human_summary: `Stopped before running ${input.routeId}: ${input.reason}.`,
    machine_envelope: {
      status: input.reason === 'needs-protocol-repair' ? 'needs_protocol_repair' : 'stopped',
      run_id: input.runId,
      route_id: input.routeId,
      consumer: input.consumer,
      completed_steps: ['resolved-route'],
      next_action: {
        type: input.reason === 'needs-protocol-repair' ? 'resume_loop' : 'stop',
        target: `run:${input.runId}`,
        label: input.reason,
      },
      evidence: [
        { kind: 'zj-loop-run-state', path: getLoopRunStatePath(input.runId), created_at: input.now },
        ...(input.preflightResult === undefined ? [] : [preflightEvidence(input.preflightResult)]),
      ],
      artifacts: input.artifacts ?? [],
      ...(input.preflightResult === undefined ? {} : { preflight_result: input.preflightResult }),
      repairs_applied: input.repairsApplied,
      stop_signal: input.stopSignal,
      resume: {
        resume_id: input.runId,
        command: `zj-loop-run --resume ${input.runId}`,
      },
      protocol_repair_request: input.reason === 'needs-protocol-repair'
        ? {
            missing_fields: ['goal'],
            invalid_fields: [],
            autofill_attempted: input.repairsApplied,
            safe_defaults_available: ['run_id', 'created_at', 'tool'],
            required_human_input: ['goal'],
            resume_envelope: {
              resume_id: input.runId,
              original_input: { goal: input.goal },
              next_safe_step: 'provide_goal',
            },
            next_command_hint: 'Run zj-loop-run "your goal" with a non-empty goal.',
          }
        : undefined,
      run_state_path: getLoopRunStatePath(input.runId),
    },
  };
}

function evidenceFor(input: {
  now: string;
  runId: string;
  goal: string;
}, consumerPlan: ConsumerRunPlan, preflightResult: RuntimePreflightResult): unknown[] {
  return [
    {
      kind: 'zj-loop-run-state',
      path: getLoopRunStatePath(input.runId),
      created_at: input.now,
    },
    {
      kind: 'consumer-run-plan',
      route_id: consumerPlan.route_id,
      status: consumerPlan.status,
      reason: consumerPlan.reason,
    },
    preflightEvidence(preflightResult),
  ];
}

function preflightEvidence(preflightResult: RuntimePreflightResult): unknown {
  return {
    kind: 'runtime-preflight',
    schema: preflightResult.schema,
    status: preflightResult.status,
    route_id: preflightResult.route_id,
    loop_key: preflightResult.loop_key,
  };
}

function executionLayerForRun(input: {
  consumerPlan: ConsumerRunPlan;
  planOnly: boolean;
}): 'report-only' | 'review-artifact' {
  if (input.planOnly || input.consumerPlan.status === 'report-only') return 'report-only';
  return 'review-artifact';
}

function intentForRoute(routeId: string): string {
  if (routeId === 'roadmap-sliced-development') return 'activate_roadmap';
  if (routeId === 'issue-backlog-triage') return 'triage';
  if (routeId === 'post-merge-roadmap-closeout') return 'closeout';
  if (routeId === 'pr-steward-fix-request') return 'review_pr';
  if (routeId === 'changelog-drafter-draft-request') return 'draft_changelog';
  return 'fix';
}

function sanitizeRunId(runId: string): string {
  const sanitized = runId.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return sanitized || 'run';
}
