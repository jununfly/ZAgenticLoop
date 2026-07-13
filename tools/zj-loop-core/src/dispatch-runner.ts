import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildConsumerRunPlan, ConsumerRunPlan } from './consumer-runner.js';
import { ConsumerAdapterResult, runConsumerLiveSideEffects, runConsumerToReviewArtifact } from './consumer-adapter.js';
import { evaluateRuntimePreflight, RuntimePreflightResult } from './preflight.js';
import { findRoute, loadRouteTable } from './route.js';

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

export type OrchestrationStatus =
  | 'planned'
  | 'executed_to_review_artifact'
  | 'hard_stopped'
  | 'duplicate'
  | 'resume'
  | 'superseded';

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
  preflight_result: RuntimePreflightResult;
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

export async function readSignalEnvelope(input: { path: string }): Promise<SignalEnvelope> {
  return validateSignalEnvelope(JSON.parse(await readFile(input.path, 'utf8')));
}

export function validateSignalEnvelope(value: unknown): SignalEnvelope {
  if (!isRecord(value)) throw new Error('Signal envelope must be an object');
  if (value.schema !== 'zj-loop.signal.v1') throw new Error('Signal envelope schema must be zj-loop.signal.v1');
  const signalId = requireString(value.signal_id, 'signal_id');
  const source = requireEnum(value.source, 'source', ['github_issue', 'gitlab_issue', 'workflow_dispatch', 'codex', 'local']);
  const provider = requireEnum(value.provider, 'provider', ['github', 'gitlab', 'none']);
  const subject = requireSubject(value.subject);
  const intent = requireEnum(value.intent, 'intent', ['triage', 'fix', 'activate_roadmap', 'review_pr', 'draft_changelog', 'closeout']);
  const payload = value.payload === undefined ? {} : value.payload;
  if (!isRecord(payload)) throw new Error('payload must be an object');
  return {
    schema: 'zj-loop.signal.v1',
    signal_id: signalId,
    source,
    provider,
    subject,
    intent,
    payload,
  };
}

export async function dispatchSignal(input: {
  root?: string;
  signal: SignalEnvelope;
  mode?: DispatchMode;
  now?: string;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
}): Promise<OrchestrationEnvelope> {
  const root = input.root ?? '.';
  const mode = input.mode ?? 'auto';
  const now = input.now ?? new Date().toISOString();
  const routeId = resolveRouteForSignal(input.signal);
  const duplicateKey = buildDuplicateKey({ signal: input.signal, routeId });
  const orchestrationId = `orch_${stableHash(duplicateKey)}`;
  const storagePath = getOrchestrationPath(orchestrationId);
  const existing = await readExistingOrchestration({ root, storagePath });
  if (existing && mode === 'resume') {
    return {
      ...existing,
      status: 'resume',
      resumes: existing.orchestration_id,
      updated_at: now,
    };
  }
  if (existing && mode === 'execute') {
    const route = await loadRouteStatus(root, existing.consumer_run_plan.route_id);
    const preflightResult = evaluateRuntimePreflight({
      route,
      executionLayer: 'live-side-effect',
      signal: input.signal,
      runtime: {
        actorRole: actorRoleFromEnv(input.env ?? process.env),
        credentials: input.env ?? process.env,
        workUnitsRequested: 1,
      },
    });
    if (preflightResult.status === 'hard_stop') {
      const updated: OrchestrationEnvelope = {
        ...existing,
        status: 'hard_stopped',
        mode,
        updated_at: now,
        preflight_result: preflightResult,
        review_artifact: {
          kind: 'hard-stop',
          description: preflightResult.stop_signal?.reason ?? 'runtime preflight hard stopped',
        },
        closeout_hint: {
          required: false,
          reason: 'no closeout required before live side effects pass preflight',
        },
        stop_signal: preflightResult.stop_signal
          ? {
              reason: preflightResult.stop_signal.reason,
              next_steps: preflightResult.stop_signal.next_steps,
            }
          : null,
      };
      await writeOrchestrationEnvelope({ root, envelope: updated });
      return updated;
    }
    const consumerAdapterResult = await runConsumerLiveSideEffects({
      root,
      signal: input.signal,
      envelope: existing,
      env: input.env ?? process.env,
      fetchImpl: input.fetchImpl,
    });
    const status = consumerAdapterResult.adapter_status === 'hard_stopped' || consumerAdapterResult.adapter_status === 'failed'
      ? 'hard_stopped'
      : 'executed_to_review_artifact';
    const updated: OrchestrationEnvelope = {
      ...existing,
      status,
      mode,
      updated_at: now,
      preflight_result: preflightResult,
      consumer_adapter_result: consumerAdapterResult,
      review_artifact: buildReviewArtifact(existing.consumer_run_plan, consumerAdapterResult),
      closeout_hint: {
        required: status === 'executed_to_review_artifact',
        reason: status === 'executed_to_review_artifact'
          ? 'review artifact should be closed out after merge or explicit completion'
          : 'no closeout required before a review artifact exists',
      },
      stop_signal: status === 'hard_stopped'
        ? buildStopSignal({ consumerRunPlan: existing.consumer_run_plan, consumerAdapterResult })
        : null,
    };
    await writeOrchestrationEnvelope({ root, envelope: updated });
    return updated;
  }
  if (!existing && mode === 'execute') {
    const consumerRunPlan = await buildConsumerRunPlan({
      root,
      selector: routeId,
      source: input.signal.source,
      signalId: input.signal.signal_id,
    });
    const consumerAdapterResult: ConsumerAdapterResult = {
      schema: 'zj-loop.consumer_adapter_result.v1',
      route_id: routeId,
      consumer: consumerRunPlan.consumer,
      consumer_kind: consumerRunPlan.consumer_kind,
      adapter_status: 'hard_stopped',
      review_artifacts: [],
      repairs_applied: [],
      live_side_effects: {
        attempted: false,
        reason: 'missing-existing-orchestration-for-execute',
      },
      next_steps: ['Run auto mode first so the orchestration contains a replayable contract-plan review artifact.'],
      stop_signal: {
        reason: 'missing-existing-orchestration-for-execute',
        next_steps: ['Run auto mode first so the orchestration contains a replayable contract-plan review artifact.'],
      },
    };
    const route = await loadRouteStatus(root, consumerRunPlan.route_id);
    const preflightResult = evaluateRuntimePreflight({
      route,
      executionLayer: 'live-side-effect',
      signal: input.signal,
      runtime: {
        actorRole: actorRoleFromEnv(input.env ?? process.env),
        credentials: input.env ?? process.env,
        workUnitsRequested: 1,
      },
    });
    const envelope: OrchestrationEnvelope = {
      schema: 'zj-loop.orchestration.v1',
      orchestration_id: orchestrationId,
      duplicate_key: duplicateKey,
      status: 'hard_stopped',
      mode,
      created_at: now,
      updated_at: now,
      signal: input.signal,
      route_decision: consumerRunPlan.route_decision,
      carrier_plan: buildCarrierPlan(input.signal),
      consumer_run_plan: consumerRunPlan,
      preflight_result: preflightResult,
      review_artifact: buildReviewArtifact(consumerRunPlan, consumerAdapterResult),
      consumer_adapter_result: consumerAdapterResult,
      closeout_hint: {
        required: false,
        reason: 'no closeout required before a review artifact exists',
      },
      stop_signal: buildStopSignal({ consumerRunPlan, consumerAdapterResult }),
      storage: {
        path: storagePath,
      },
    };
    await writeOrchestrationEnvelope({ root, envelope });
    return envelope;
  }
  if (existing && mode !== 'resume') {
    return {
      ...existing,
      status: 'duplicate',
      duplicate_of: existing.orchestration_id,
      updated_at: now,
    };
  }

  const consumerRunPlan = await buildConsumerRunPlan({
    root,
    selector: routeId,
    source: input.signal.source,
    signalId: input.signal.signal_id,
  });
  const route = await loadRouteStatus(root, consumerRunPlan.route_id);
  const preflightResult = evaluateRuntimePreflight({
    route,
    executionLayer: executionLayerForPlan({ mode, consumerRunPlan }),
    signal: input.signal,
    runtime: {
      workUnitsRequested: 1,
    },
  });
  let status = statusForPlan({ mode, consumerRunPlan });
  if (preflightResult.status === 'hard_stop') {
    status = 'hard_stopped';
  }
  const consumerAdapterResult = status === 'executed_to_review_artifact'
    ? await runConsumerToReviewArtifact({
        root,
        signal: input.signal,
        orchestrationId,
        consumerRunPlan,
      })
    : undefined;
  if (consumerAdapterResult?.adapter_status === 'hard_stopped') {
    status = 'hard_stopped';
  }
  const envelope: OrchestrationEnvelope = {
    schema: 'zj-loop.orchestration.v1',
    orchestration_id: orchestrationId,
    duplicate_key: duplicateKey,
    status,
    mode,
    created_at: now,
    updated_at: now,
    signal: input.signal,
    route_decision: consumerRunPlan.route_decision,
    carrier_plan: buildCarrierPlan(input.signal),
    consumer_run_plan: consumerRunPlan,
    preflight_result: preflightResult,
    review_artifact: buildReviewArtifact(consumerRunPlan, consumerAdapterResult),
    ...(consumerAdapterResult === undefined ? {} : { consumer_adapter_result: consumerAdapterResult }),
    closeout_hint: {
      required: status === 'executed_to_review_artifact',
      reason: status === 'executed_to_review_artifact'
        ? 'review artifact should be closed out after merge or explicit completion'
        : 'no closeout required before a review artifact exists',
    },
    stop_signal: status === 'hard_stopped'
      ? buildStopSignal({ consumerRunPlan, consumerAdapterResult, preflightResult })
      : null,
    storage: {
      path: storagePath,
    },
  };

  await writeOrchestrationEnvelope({ root, envelope });
  return envelope;
}

async function loadRouteStatus(root: string, routeId: string) {
  return findRoute(await loadRouteTable(root), routeId);
}

function actorRoleFromEnv(env: Record<string, string | undefined>): string | undefined {
  return env.ZJ_LOOP_ACTOR_ROLE ?? env.GITHUB_ACTOR_ROLE ?? env.GITLAB_USER_ROLE;
}

async function readExistingOrchestration(input: {
  root: string;
  storagePath: string;
}): Promise<OrchestrationEnvelope | null> {
  try {
    return JSON.parse(await readFile(path.resolve(input.root, input.storagePath), 'utf8')) as OrchestrationEnvelope;
  } catch (err: unknown) {
    if (isNodeError(err) && err.code === 'ENOENT') return null;
    throw err;
  }
}

export function getOrchestrationPath(orchestrationId: string): string {
  return `zj-loop/orchestrations/${sanitizeId(orchestrationId)}.json`;
}

export async function writeOrchestrationEnvelope(input: {
  root?: string;
  envelope: OrchestrationEnvelope;
}): Promise<void> {
  const absolutePath = path.resolve(input.root ?? '.', input.envelope.storage.path);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(input.envelope, null, 2)}\n`);
}

function resolveRouteForSignal(signal: SignalEnvelope): string {
  const explicitRoute = signal.payload.route_id;
  if (typeof explicitRoute === 'string' && explicitRoute.trim()) return explicitRoute.trim();
  if (signal.intent === 'triage') return 'issue-backlog-triage';
  if (signal.intent === 'activate_roadmap') return 'roadmap-sliced-development';
  if (signal.intent === 'review_pr') return 'pr-steward-fix-request';
  if (signal.intent === 'draft_changelog') return 'changelog-drafter-draft-request';
  if (signal.intent === 'closeout') return 'post-merge-roadmap-closeout';
  if (signal.intent === 'fix') return 'ci-sweeper';
  throw new Error(`No route mapping for intent: ${signal.intent}`);
}

function buildDuplicateKey(input: { signal: SignalEnvelope; routeId: string }): string {
  return [
    input.signal.provider,
    input.signal.subject.kind,
    input.signal.subject.id,
    input.signal.intent,
    input.routeId,
  ].join(':');
}

function buildCarrierPlan(signal: SignalEnvelope): OrchestrationEnvelope['carrier_plan'] {
  if (signal.subject.kind === 'issue' || signal.subject.kind === 'pr' || signal.subject.kind === 'mr') {
    return {
      action: 'reuse-source-carrier',
      carrier_kind: signal.subject.kind,
      source_subject: signal.subject,
      comment_required: true,
      reason: 'source subject is a reusable tracker carrier',
    };
  }
  return {
    action: 'create-carrier',
    carrier_kind: signal.provider === 'none' ? 'local-file' : 'new-issue',
    source_subject: signal.subject,
    comment_required: true,
    reason: 'source subject is not a reusable tracker carrier',
  };
}

function statusForPlan(input: { mode: DispatchMode; consumerRunPlan: ConsumerRunPlan }): OrchestrationStatus {
  if (input.mode === 'plan-only') return 'planned';
  if (input.consumerRunPlan.status === 'blocked') return 'hard_stopped';
  if (input.consumerRunPlan.execution_allowed && (input.mode === 'auto' || input.mode === 'execute')) {
    return 'executed_to_review_artifact';
  }
  return 'planned';
}

function executionLayerForPlan(input: {
  mode: DispatchMode;
  consumerRunPlan: ConsumerRunPlan;
}): 'report-only' | 'review-artifact' | 'live-side-effect' {
  if (input.mode === 'execute') return 'live-side-effect';
  if (input.consumerRunPlan.status === 'report-only') return 'report-only';
  return 'review-artifact';
}

function buildReviewArtifact(
  plan: ConsumerRunPlan,
  consumerAdapterResult?: ConsumerAdapterResult,
): OrchestrationEnvelope['review_artifact'] {
  const adapterArtifact = consumerAdapterResult?.review_artifacts[0];
  if (consumerAdapterResult?.adapter_status === 'hard_stopped') {
    return {
      kind: 'hard-stop',
      description: consumerAdapterResult.stop_signal?.reason ?? consumerAdapterResult.live_side_effects.reason ?? 'consumer adapter hard stopped',
    };
  }
  if (adapterArtifact) {
    return {
      kind: 'structured-evidence',
      path: adapterArtifact.path,
      description: `${adapterArtifact.kind} review artifact generated by ConsumerAdapter.`,
    };
  }
  const primaryArtifact = plan.route_specific_artifacts.find((artifact) => artifact.role === 'primary-result');
  if (primaryArtifact) {
    return {
      kind: primaryArtifact.path.endsWith('.json') ? 'structured-evidence' : 'review-artifact',
      path: primaryArtifact.path,
      description: primaryArtifact.description,
    };
  }
  if (plan.status === 'report-only') {
    return {
      kind: 'report-evidence',
      description: 'Report-only route writes evidence to the configured evidence store or workflow summary.',
    };
  }
  return {
    kind: 'hard-stop',
    description: plan.reason,
  };
}

function buildStopSignal(input: {
  consumerRunPlan: ConsumerRunPlan;
  consumerAdapterResult?: ConsumerAdapterResult;
  preflightResult?: RuntimePreflightResult;
}): NonNullable<OrchestrationEnvelope['stop_signal']> {
  if (input.preflightResult?.stop_signal) {
    return {
      reason: input.preflightResult.stop_signal.reason,
      next_steps: input.preflightResult.stop_signal.next_steps,
    };
  }
  if (input.consumerAdapterResult?.stop_signal) {
    return {
      reason: input.consumerAdapterResult.stop_signal.reason,
      next_steps: input.consumerAdapterResult.stop_signal.next_steps,
    };
  }
  return {
    reason: input.consumerRunPlan.reason,
    next_steps: input.consumerRunPlan.next_steps,
  };
}

function requireSubject(value: unknown): SignalEnvelope['subject'] {
  if (!isRecord(value)) throw new Error('subject must be an object');
  const kind = requireEnum(value.kind, 'subject.kind', ['issue', 'pr', 'mr', 'ci_run', 'dependency_alert', 'plan', 'local_goal']);
  const id = requireString(value.id, 'subject.id');
  const url = value.url === undefined ? undefined : requireString(value.url, 'subject.url');
  return { kind, id, ...(url === undefined ? {} : { url }) };
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`Missing ${field}`);
  return value.trim();
}

function requireEnum<const T extends readonly string[]>(value: unknown, field: string, values: T): T[number] {
  if (typeof value !== 'string' || !values.includes(value)) {
    throw new Error(`Invalid ${field}: expected one of ${values.join(', ')}`);
  }
  return value as T[number];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
  return value instanceof Error && 'code' in value;
}

function stableHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}

function sanitizeId(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, '-');
}
