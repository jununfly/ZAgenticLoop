import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildConsumerRunPlan, ConsumerRunPlan } from './consumer-runner.js';

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
  review_artifact: {
    kind: string;
    path?: string;
    description: string;
  };
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
  const status = statusForPlan({ mode, consumerRunPlan });
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
    review_artifact: buildReviewArtifact(consumerRunPlan),
    closeout_hint: {
      required: status === 'executed_to_review_artifact',
      reason: status === 'executed_to_review_artifact'
        ? 'review artifact should be closed out after merge or explicit completion'
        : 'no closeout required before a review artifact exists',
    },
    stop_signal: status === 'hard_stopped'
      ? {
          reason: consumerRunPlan.reason,
          next_steps: consumerRunPlan.next_steps,
        }
      : null,
    storage: {
      path: storagePath,
    },
  };

  await writeOrchestrationEnvelope({ root, envelope });
  return envelope;
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

function buildReviewArtifact(plan: ConsumerRunPlan): OrchestrationEnvelope['review_artifact'] {
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
