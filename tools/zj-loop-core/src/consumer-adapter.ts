import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

import { ConsumerRunPlan } from './consumer-runner.js';
import {
  buildRoadmapActivationBranchName,
  buildRoadmapActivationPrContract,
  buildRoadmapActivationPrTitle,
  buildRoadmapActivationReviewContract,
  buildRoadmapActivationReviewTitle,
  executeGitLabRoadmapActivation,
  RoadmapActivationReviewProvider,
} from './roadmap-activation-runner.js';
import type { OrchestrationEnvelope, SignalEnvelope } from './dispatch-runner.js';

export type ConsumerAdapterStatus =
  | 'executed_to_review_artifact'
  | 'executed_to_live_side_effects'
  | 'resumable'
  | 'failed'
  | 'hard_stopped';

export type ActivationFailureClass = 'none' | 'recoverable' | 'terminal';

export type ConsumerAdapterResult = {
  schema: 'zj-loop.consumer_adapter_result.v1';
  route_id: string;
  consumer: string;
  consumer_kind: string;
  adapter_status: ConsumerAdapterStatus;
  review_artifacts: Array<{
    path: string;
    kind: string;
    schema: string;
  }>;
  repairs_applied: Array<{
    field: string;
    value: string;
    reason: string;
  }>;
  live_side_effects: {
    attempted: boolean;
    reason?: string;
    execution_scope?: 'external_tool';
    external_tool?: 'github' | 'gitlab';
    side_effect_level?: 'branch_pr';
    status?: 'completed' | 'failed' | 'refused' | 'dry-run';
    idempotency_key?: string;
    review?: {
      kind: 'pull-request' | 'merge-request';
      number?: number | null;
      url?: string;
    };
    branch?: {
      name: string;
      target: string;
    };
    operations?: Array<Record<string, unknown>>;
    refusals?: Array<Record<string, unknown>>;
    provider_result?: Record<string, unknown>;
    attempts?: Array<{
      attempt_id: string;
      attempt_number: number;
      attempted_at: string;
      mode: 'execute';
      external_tool: 'github' | 'gitlab';
      operation: string;
      status: 'completed' | 'failed' | 'refused';
      failure_class: ActivationFailureClass;
      reason: string;
      http_status?: number;
      retry_consumed: boolean;
      next_retry_allowed: boolean;
      idempotency_key: string;
      review_url?: string;
      branch_name?: string;
      provider_request_id?: string;
    }>;
  };
  activation_lifecycle?: {
    schema: 'zj-loop.activation_lifecycle_evidence.v1';
    activation_state: 'completed' | 'resumable' | 'failed';
    failure_class: ActivationFailureClass;
    attempt_count: number;
    next_command: string;
    resume_allowed: boolean;
    retry_budget_remaining: number;
    where_to_continue: string;
    reason: string;
  };
  next_steps: string[];
  stop_signal?: {
    reason: string;
    next_steps: string[];
  };
};

export async function runConsumerLiveSideEffects(input: {
  root: string;
  signal: SignalEnvelope;
  envelope: OrchestrationEnvelope;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
}): Promise<ConsumerAdapterResult> {
  const current = input.envelope.consumer_adapter_result;
  if (!current) {
    return liveHardStop({
      input: {
        consumerRunPlan: input.envelope.consumer_run_plan,
      },
      reason: 'missing-consumer-adapter-result',
      nextSteps: ['Run auto mode first so the orchestration contains a ConsumerAdapter review artifact.'],
    });
  }
  const artifact = current.review_artifacts.find((item) => item.kind === 'contract-plan');
  if (!artifact?.path) {
    return {
      ...current,
      adapter_status: 'hard_stopped',
      live_side_effects: {
        attempted: false,
        reason: 'missing-contract-plan-review-artifact',
      },
      stop_signal: {
        reason: 'missing-contract-plan-review-artifact',
        next_steps: ['Run auto mode first so the orchestration contains contract-plan.json.'],
      },
    };
  }

  const contractPlan = JSON.parse(await readFile(path.resolve(input.root, artifact.path), 'utf8'));
  const liveSideEffects = await executeRoadmapActivationLiveSideEffects({
    signal: input.signal,
    contractPlan,
    env: input.env,
    fetchImpl: input.fetchImpl,
  });
  const previousAttempts = current.live_side_effects.attempts ?? [];
  const attempt = buildLiveSideEffectAttempt({
    liveSideEffects,
    previousAttempts,
    attemptedAt: String(input.envelope.updated_at ?? new Date().toISOString()),
  });
  const attempts = [...previousAttempts, attempt];
  const liveSideEffectsWithAttempts = {
    ...liveSideEffects,
    attempts,
  };
  const activationLifecycle = buildActivationLifecycle({
    liveSideEffects: liveSideEffectsWithAttempts,
    attempts,
  });
  const lifecycleArtifact = activationLifecycle.activation_state === 'completed'
    ? undefined
    : await writeActivationLifecycleEvidence({
        root: input.root,
        orchestrationId: input.envelope.orchestration_id,
        lifecycle: activationLifecycle,
      });
  const closeoutHandoffArtifact = activationLifecycle.activation_state === 'completed'
    ? await writePostMergeCloseoutHandoff({
        root: input.root,
        signal: input.signal,
        orchestrationId: input.envelope.orchestration_id,
        contractPlan,
        liveSideEffects: liveSideEffectsWithAttempts,
      })
    : undefined;
  const adapterStatus = adapterStatusForActivationLifecycle(activationLifecycle);
  const reviewArtifacts = [
    ...current.review_artifacts.filter((artifact) => artifact.kind !== 'activation-lifecycle' && artifact.kind !== 'post-merge-closeout-handoff'),
    ...(lifecycleArtifact === undefined ? [] : [lifecycleArtifact]),
    ...(closeoutHandoffArtifact === undefined ? [] : [closeoutHandoffArtifact]),
  ];
  return {
    ...current,
    adapter_status: adapterStatus,
    review_artifacts: reviewArtifacts,
    live_side_effects: liveSideEffectsWithAttempts,
    activation_lifecycle: activationLifecycle,
    next_steps: activationLifecycle.activation_state === 'resumable'
      ? [activationLifecycle.next_command, `Continue from ${activationLifecycle.where_to_continue}.`]
      : current.next_steps,
    stop_signal: adapterStatus === 'hard_stopped' || adapterStatus === 'failed'
      ? {
          reason: activationLifecycle.reason,
          next_steps: activationLifecycle.resume_allowed
            ? [activationLifecycle.next_command]
            : ['Create a new activation request or repair the activation input before retrying.'],
        }
      : current.stop_signal,
  };
}

export async function executeRoadmapActivationLiveSideEffects(input: {
  signal: SignalEnvelope;
  contractPlan: any;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
}): Promise<ConsumerAdapterResult['live_side_effects']> {
  if (input.contractPlan?.provider === 'github') {
    return executeGitHubRoadmapActivation(input);
  }
  if (input.contractPlan?.provider === 'gitlab') {
    const result = await executeGitLabRoadmapActivation({
      contractPlan: input.contractPlan,
      projectPath: stringPayload(input.signal.payload.project_path) ?? input.env?.CI_PROJECT_PATH,
      targetBranch: stringPayload(input.signal.payload.target_branch) ?? input.env?.CI_DEFAULT_BRANCH,
      apiBaseUrl: stringPayload(input.signal.payload.gitlab_api_url) ?? input.env?.CI_API_V4_URL,
      token: input.env?.GITLAB_TOKEN,
      jobToken: input.env?.CI_JOB_TOKEN,
      live: true,
      fetchImpl: input.fetchImpl,
    });
    return normalizeGitLabRoadmapActivationResult(result);
  }
  return {
    attempted: false,
    reason: 'unsupported-roadmap-activation-provider',
    execution_scope: 'external_tool',
    side_effect_level: 'branch_pr',
    status: 'refused',
    refusals: [{ layer: 'provider', reason: 'unsupported-roadmap-activation-provider' }],
  };
}

export async function runConsumerToReviewArtifact(input: {
  root: string;
  signal: SignalEnvelope;
  orchestrationId: string;
  consumerRunPlan: ConsumerRunPlan;
}): Promise<ConsumerAdapterResult> {
  const routeId = input.consumerRunPlan.route_decision.route;
  if (routeId === 'roadmap-sliced-development') {
    return runRoadmapActivationToContractPlan(input);
  }

  return {
    schema: 'zj-loop.consumer_adapter_result.v1',
    route_id: routeId,
    consumer: input.consumerRunPlan.consumer,
    consumer_kind: input.consumerRunPlan.consumer_kind,
    adapter_status: 'hard_stopped',
    review_artifacts: [],
    repairs_applied: [],
    live_side_effects: {
      attempted: false,
      reason: 'no review-artifact adapter registered for this route',
    },
    next_steps: ['Add an explicit ConsumerAdapter for this route before executing it.'],
    stop_signal: {
      reason: 'missing-consumer-adapter',
      next_steps: ['Add an explicit ConsumerAdapter for this route before executing it.'],
    },
  };
}

async function runRoadmapActivationToContractPlan(input: {
  root: string;
  signal: SignalEnvelope;
  orchestrationId: string;
  consumerRunPlan: ConsumerRunPlan;
}): Promise<ConsumerAdapterResult> {
  const repairsApplied: ConsumerAdapterResult['repairs_applied'] = [];
  const activationRequestId = stringPayload(input.signal.payload.activation_request_id)
    ?? repairFromSignalId(input.signal.signal_id, repairsApplied);
  const sourceIssueUrl = input.signal.subject.url
    ?? deriveSourceIssueUrl(input.signal, repairsApplied);
  const sourceCommentUrl = stringPayload(input.signal.payload.source_comment_url)
    ?? stringPayload(input.signal.payload.activation_request_comment_url);

  if (!sourceIssueUrl) {
    return hardStopResult({
      input,
      reason: 'missing-source-issue-url',
      nextSteps: ['Provide subject.url or enough provider repository metadata to build a source issue URL.'],
      repairsApplied,
    });
  }
  if (!sourceCommentUrl) {
    return hardStopResult({
      input,
      reason: 'missing-activation-request-comment-url',
      nextSteps: ['Provide payload.activation_request_comment_url or payload.source_comment_url for replayable activation evidence.'],
      repairsApplied,
    });
  }

  const provider = input.signal.provider === 'gitlab' ? 'gitlab' : 'github';
  const title = stringPayload(input.signal.payload.title);
  const sourceIssue = input.signal.subject.kind === 'issue' ? input.signal.subject.id : undefined;
  const branchName = buildRoadmapActivationBranchName({ activationRequestId, title, sourceIssue });
  const reviewTitle = buildRoadmapActivationReviewTitle({ provider, title, sourceIssue });
  const processRoadmapPath = stringPayload(input.signal.payload.process_roadmap_path)
    ?? stringPayload(input.signal.payload.processRoadmapPath)
    ?? '';
  const reviewContract = buildReviewContract({
    provider,
    activationRequestId,
    sourceIssueUrl,
    sourceCommentUrl,
    branchName,
    sourceIssue,
    processRoadmapPath,
  });
  const contractPlan = {
    schema: 'zj-loop.roadmap_activation_contract_plan.v1',
    provider,
    reviewKind: provider === 'gitlab' ? 'merge-request' : 'pull-request',
    activationRequestId,
    branchName,
    reviewTitle,
    prTitle: provider === 'github' ? buildRoadmapActivationPrTitle({ title, sourceIssue }) : undefined,
    lifecycleState: 'requested',
    reviewContract,
    prContract: provider === 'github' ? reviewContract : undefined,
    mrTitle: provider === 'gitlab' ? reviewTitle : undefined,
    mrContract: provider === 'gitlab' ? reviewContract : undefined,
    nextSteps: [
      'Create or update the roadmap branch from the current base branch.',
      provider === 'gitlab'
        ? 'Open or update the Roadmap Activation MR with the contract block.'
        : 'Open or update the Roadmap Activation PR with the contract block.',
      'Start Roadmap-Sliced Consumer execution from the Activation Request scope.',
    ],
  };
  const artifactPath = `zj-loop/orchestrations/${input.orchestrationId}/contract-plan.json`;
  const absoluteArtifactPath = path.resolve(input.root, artifactPath);
  await mkdir(path.dirname(absoluteArtifactPath), { recursive: true });
  await writeFile(absoluteArtifactPath, `${JSON.stringify(contractPlan, null, 2)}\n`);

  return {
    schema: 'zj-loop.consumer_adapter_result.v1',
    route_id: 'roadmap-sliced-development',
    consumer: input.consumerRunPlan.consumer,
    consumer_kind: input.consumerRunPlan.consumer_kind,
    adapter_status: 'executed_to_review_artifact',
    review_artifacts: [{
      path: artifactPath,
      kind: 'contract-plan',
      schema: 'zj-loop.roadmap_activation_contract_plan.v1',
    }],
    repairs_applied: repairsApplied,
    live_side_effects: {
      attempted: false,
      reason: 'review-artifact runner only',
    },
    next_steps: contractPlan.nextSteps,
  };
}

function buildReviewContract(input: {
  provider: RoadmapActivationReviewProvider;
  activationRequestId: string;
  sourceIssueUrl: string;
  sourceCommentUrl: string;
  branchName: string;
  sourceIssue?: string;
  processRoadmapPath: string;
}) {
  const closeoutContract = {
    activationCarrierIssue: input.sourceIssue,
    processRoadmapPath: input.processRoadmapPath,
  };
  if (input.provider === 'github') {
    return buildRoadmapActivationPrContract({
      activationRequestId: input.activationRequestId,
      sourceIssueUrl: input.sourceIssueUrl,
      sourceCommentUrl: input.sourceCommentUrl,
      branchName: input.branchName,
      lifecycleState: 'requested',
      closeoutContract,
    });
  }
  return buildRoadmapActivationReviewContract({
    provider: input.provider,
    activationRequestId: input.activationRequestId,
    sourceIssueUrl: input.sourceIssueUrl,
    sourceCommentUrl: input.sourceCommentUrl,
    branchName: input.branchName,
    lifecycleState: 'requested',
    closeoutContract,
  });
}

function hardStopResult(input: {
  input: {
    consumerRunPlan: ConsumerRunPlan;
  };
  reason: string;
  nextSteps: string[];
  repairsApplied: ConsumerAdapterResult['repairs_applied'];
}): ConsumerAdapterResult {
  return {
    schema: 'zj-loop.consumer_adapter_result.v1',
    route_id: 'roadmap-sliced-development',
    consumer: input.input.consumerRunPlan.consumer,
    consumer_kind: input.input.consumerRunPlan.consumer_kind,
    adapter_status: 'hard_stopped',
    review_artifacts: [],
    repairs_applied: input.repairsApplied,
    live_side_effects: {
      attempted: false,
      reason: 'hard stop before live side effects',
    },
    next_steps: input.nextSteps,
    stop_signal: {
      reason: input.reason,
      next_steps: input.nextSteps,
    },
  };
}

function stringPayload(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function repairFromSignalId(
  signalId: string,
  repairsApplied: ConsumerAdapterResult['repairs_applied'],
) {
  repairsApplied.push({
    field: 'activation_request_id',
    value: signalId,
    reason: 'payload.activation_request_id missing; reused signal_id as stable activation request id',
  });
  return signalId;
}

function deriveSourceIssueUrl(
  signal: SignalEnvelope,
  repairsApplied: ConsumerAdapterResult['repairs_applied'],
) {
  if (signal.subject.kind !== 'issue') return undefined;
  const repository = stringPayload(signal.payload.repository);
  if (signal.provider === 'github' && repository) {
    const value = `https://github.com/${repository}/issues/${encodeURIComponent(signal.subject.id)}`;
    repairsApplied.push({
      field: 'source_issue_url',
      value,
      reason: 'subject.url missing; derived GitHub issue URL from payload.repository and subject.id',
    });
    return value;
  }
  const projectUrl = stringPayload(signal.payload.project_url);
  if (signal.provider === 'gitlab' && projectUrl) {
    const value = `${projectUrl.replace(/\/$/, '')}/-/issues/${encodeURIComponent(signal.subject.id)}`;
    repairsApplied.push({
      field: 'source_issue_url',
      value,
      reason: 'subject.url missing; derived GitLab issue URL from payload.project_url and subject.id',
    });
    return value;
  }
  return undefined;
}

async function executeGitHubRoadmapActivation(input: {
  signal: SignalEnvelope;
  contractPlan: any;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
}): Promise<ConsumerAdapterResult['live_side_effects']> {
  const plan = input.contractPlan ?? {};
  const repository = stringPayload(input.signal.payload.repository)
    ?? stringPayload(plan.repository)
    ?? input.env?.GITHUB_REPOSITORY
    ?? '';
  const targetBranch = stringPayload(input.signal.payload.target_branch)
    ?? stringPayload(plan.targetBranch)
    ?? stringPayload(plan.target_branch)
    ?? input.env?.GITHUB_REF_NAME
    ?? '';
  const token = input.env?.GITHUB_TOKEN ?? '';
  const branchName = String(plan.branchName ?? '');
  const refusals: Array<Record<string, unknown>> = [];

  if (plan.schema !== 'zj-loop.roadmap_activation_contract_plan.v1') {
    refusals.push({ layer: 'contract', reason: 'invalid-contract-plan-schema' });
  }
  if (plan.provider !== 'github') refusals.push({ layer: 'provider', reason: 'contract-plan-provider-is-not-github' });
  if (!repository || !repository.includes('/')) refusals.push({ layer: 'repository', reason: 'github-repository-required' });
  if (!targetBranch) refusals.push({ layer: 'target_branch', reason: 'target-branch-required' });
  if (!branchName.startsWith('zjal-')) refusals.push({ layer: 'branch', reason: 'branch-prefix-must-be-zjal-' });
  if (!token) refusals.push({ layer: 'credential', reason: 'github-token-required-for-live-execution' });

  const base = {
    attempted: refusals.length === 0,
    execution_scope: 'external_tool' as const,
    external_tool: 'github' as const,
    side_effect_level: 'branch_pr' as const,
    idempotency_key: `roadmap-sliced-development:${branchName}`,
    branch: {
      name: branchName,
      target: targetBranch,
    },
    operations: [
      { kind: 'find-target-branch-ref', branch: targetBranch },
      { kind: 'find-or-create-branch-ref', branch: branchName },
      { kind: 'find-or-create-pull-request', branch: branchName },
    ],
    provider_result: {
      provider: 'github',
      repository,
    },
  };

  if (refusals.length > 0) {
    return {
      ...base,
      attempted: false,
      status: 'refused',
      reason: 'github-roadmap-activation-live-gates-refused',
      refusals,
    };
  }

  const [owner] = repository.split('/');
  const apiBaseUrl = String(input.env?.GITHUB_API_URL ?? 'https://api.github.com').replace(/\/+$/, '');
  const fetcher = input.fetchImpl ?? fetch;
  const headers = {
    authorization: `Bearer ${token}`,
    accept: 'application/vnd.github+json',
    'content-type': 'application/json',
    'x-github-api-version': '2022-11-28',
  };
  const operations: Array<Record<string, unknown>> = [];

  const targetRefUrl = `${apiBaseUrl}/repos/${repository}/git/ref/heads/${encodeURIComponent(targetBranch)}`;
  const targetRef = await fetcher(targetRefUrl, { headers });
  const targetBody = targetRef.ok ? await targetRef.json() : {};
  operations.push({ kind: 'find-target-branch-ref', status: targetRef.status, branch: targetBranch });
  const targetSha = targetBody?.object?.sha;
  if (!targetRef.ok || !targetSha) {
    return {
      ...base,
      attempted: true,
      status: 'failed',
      reason: 'github-target-branch-ref-not-found',
      operations,
      provider_result: { provider: 'github', repository, target_ref_status: targetRef.status },
    };
  }

  const branchRefUrl = `${apiBaseUrl}/repos/${repository}/git/ref/heads/${encodeURIComponent(branchName)}`;
  const branchRef = await fetcher(branchRefUrl, { headers });
  if (branchRef.status === 404) {
    const createBranch = await fetcher(`${apiBaseUrl}/repos/${repository}/git/refs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: targetSha }),
    });
    operations.push({ kind: 'create-branch-ref', status: createBranch.status, branch: branchName });
    if (!createBranch.ok) {
      return {
        ...base,
        attempted: true,
        status: 'failed',
        reason: 'github-create-branch-ref-failed',
        operations,
        provider_result: { provider: 'github', repository, branch_ref_status: createBranch.status },
      };
    }
  } else {
    operations.push({ kind: 'find-branch-ref', status: branchRef.status, branch: branchName });
    if (!branchRef.ok) {
      return {
        ...base,
        attempted: true,
        status: 'failed',
        reason: 'github-find-branch-ref-failed',
        operations,
        provider_result: { provider: 'github', repository, branch_ref_status: branchRef.status },
      };
    }
  }

  const query = new URLSearchParams({ state: 'open', head: `${owner}:${branchName}` }).toString();
  const existingPrs = await fetcher(`${apiBaseUrl}/repos/${repository}/pulls?${query}`, { headers });
  const prs = existingPrs.ok ? await existingPrs.json() : [];
  operations.push({ kind: 'find-pull-request', status: existingPrs.status, count: Array.isArray(prs) ? prs.length : 0 });
  if (!existingPrs.ok) {
    return {
      ...base,
      attempted: true,
      status: 'failed',
      reason: 'github-find-pull-request-failed',
      operations,
      provider_result: { provider: 'github', repository, pulls_status: existingPrs.status },
    };
  }

  const title = String(plan.prTitle ?? plan.reviewTitle ?? `Roadmap Activation: ${branchName}`);
  const body = String(plan.prContract ?? plan.reviewContract ?? '');
  if (Array.isArray(prs) && prs[0]?.number) {
    const update = await fetcher(`${apiBaseUrl}/repos/${repository}/pulls/${prs[0].number}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ title, body }),
    });
    operations.push({ kind: 'update-pull-request', status: update.status, number: prs[0].number });
    return {
      ...base,
      attempted: true,
      status: update.ok ? 'completed' : 'failed',
      review: {
        kind: 'pull-request',
        number: prs[0].number,
        url: prs[0].html_url ?? '',
      },
      operations,
      provider_result: { provider: 'github', repository, pull_request_status: update.status },
    };
  }

  const createPr = await fetcher(`${apiBaseUrl}/repos/${repository}/pulls`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ title, head: branchName, base: targetBranch, body, draft: true }),
  });
  const created = createPr.ok ? await createPr.json() : {};
  operations.push({ kind: 'create-pull-request', status: createPr.status, number: created.number ?? null });
  return {
    ...base,
    attempted: true,
    status: createPr.ok ? 'completed' : 'failed',
    review: {
      kind: 'pull-request',
      number: created.number ?? null,
      url: created.html_url ?? '',
    },
    operations,
    provider_result: { provider: 'github', repository, pull_request_status: createPr.status },
  };
}

function normalizeGitLabRoadmapActivationResult(result: any): ConsumerAdapterResult['live_side_effects'] {
  const status = result.status === 'completed'
    ? 'completed'
    : result.status === 'dry-run'
      ? 'dry-run'
      : result.status === 'refused'
        ? 'refused'
        : 'failed';
  return {
    attempted: result.execution_allowed === true,
    execution_scope: 'external_tool',
    external_tool: 'gitlab',
    side_effect_level: 'branch_pr',
    status,
    idempotency_key: `roadmap-sliced-development:${String(result.branch_name ?? '')}`,
    review: {
      kind: 'merge-request',
      number: result.merge_request_iid ?? null,
      url: result.merge_request_url ?? '',
    },
    branch: {
      name: String(result.branch_name ?? ''),
      target: String(result.target_branch ?? ''),
    },
    operations: Array.isArray(result.live_operations) ? result.live_operations : result.operations ?? [],
    refusals: Array.isArray(result.refusals) ? result.refusals : [],
    provider_result: result,
    ...(status === 'refused' ? { reason: 'gitlab-roadmap-activation-live-gates-refused' } : {}),
  };
}

function buildLiveSideEffectAttempt(input: {
  liveSideEffects: ConsumerAdapterResult['live_side_effects'];
  previousAttempts: NonNullable<ConsumerAdapterResult['live_side_effects']['attempts']>;
  attemptedAt: string;
}): NonNullable<ConsumerAdapterResult['live_side_effects']['attempts']>[number] {
  const externalTool = input.liveSideEffects.external_tool ?? 'github';
  const operation = lastOperationKind(input.liveSideEffects.operations) ?? 'provider_preflight';
  const status = input.liveSideEffects.status === 'completed'
    ? 'completed'
    : input.liveSideEffects.status === 'refused'
      ? 'refused'
      : 'failed';
  const httpStatus = lastHttpStatus(input.liveSideEffects.operations);
  const reason = String(input.liveSideEffects.reason ?? failureReasonFromEvidence(input.liveSideEffects) ?? status);
  const failureClass = classifyActivationFailure({
    status,
    reason,
    httpStatus,
    refusals: input.liveSideEffects.refusals ?? [],
  });
  const retryConsumed = status === 'failed' && failureClass === 'recoverable';
  const consumedAttempts = input.previousAttempts.filter((attempt) => attempt.retry_consumed).length + (retryConsumed ? 1 : 0);
  const retryBudgetRemaining = Math.max(0, 3 - consumedAttempts);
  const idempotencyKey = String(input.liveSideEffects.idempotency_key ?? 'roadmap-sliced-development:unknown');
  const attemptNumber = input.previousAttempts.length + 1;
  return {
    attempt_id: `attempt-${stableHash(`${idempotencyKey}:${attemptNumber}:${reason}`)}`,
    attempt_number: attemptNumber,
    attempted_at: input.attemptedAt,
    mode: 'execute',
    external_tool: externalTool,
    operation,
    status,
    failure_class: failureClass,
    reason,
    ...(httpStatus === undefined ? {} : { http_status: httpStatus }),
    retry_consumed: retryConsumed,
    next_retry_allowed: failureClass === 'recoverable' && retryBudgetRemaining > 0,
    idempotency_key: idempotencyKey,
    ...(input.liveSideEffects.review?.url ? { review_url: input.liveSideEffects.review.url } : {}),
    ...(input.liveSideEffects.branch?.name ? { branch_name: input.liveSideEffects.branch.name } : {}),
  };
}

function buildActivationLifecycle(input: {
  liveSideEffects: ConsumerAdapterResult['live_side_effects'];
  attempts: NonNullable<ConsumerAdapterResult['live_side_effects']['attempts']>;
}): NonNullable<ConsumerAdapterResult['activation_lifecycle']> {
  const latestAttempt = input.attempts[input.attempts.length - 1];
  const retryBudgetRemaining = Math.max(0, 3 - input.attempts.filter((attempt) => attempt.retry_consumed).length);
  if (input.liveSideEffects.status === 'completed') {
    return {
      schema: 'zj-loop.activation_lifecycle_evidence.v1',
      activation_state: 'completed',
      failure_class: 'none',
      attempt_count: input.attempts.length,
      next_command: 'Continue Roadmap-Sliced Consumer execution from the review artifact.',
      resume_allowed: false,
      retry_budget_remaining: retryBudgetRemaining,
      where_to_continue: input.liveSideEffects.review?.url ?? input.liveSideEffects.branch?.name ?? 'roadmap activation review',
      reason: 'live-side-effects-completed',
    };
  }
  const failureClass = latestAttempt.failure_class;
  const resumable = failureClass === 'recoverable' && retryBudgetRemaining > 0;
  return {
    schema: 'zj-loop.activation_lifecycle_evidence.v1',
    activation_state: resumable ? 'resumable' : 'failed',
    failure_class: failureClass,
    attempt_count: input.attempts.length,
    next_command: resumable ? 'zj-loop-dispatch --mode execute' : 'Create a new activation request after repairing the input.',
    resume_allowed: resumable,
    retry_budget_remaining: retryBudgetRemaining,
    where_to_continue: input.liveSideEffects.review?.url
      ?? input.liveSideEffects.branch?.name
      ?? input.liveSideEffects.idempotency_key
      ?? 'stored orchestration',
    reason: latestAttempt.reason,
  };
}

async function writeActivationLifecycleEvidence(input: {
  root: string;
  orchestrationId: string;
  lifecycle: NonNullable<ConsumerAdapterResult['activation_lifecycle']>;
}): Promise<ConsumerAdapterResult['review_artifacts'][number]> {
  const artifactPath = `zj-loop/orchestrations/${input.orchestrationId}/activation-lifecycle-evidence.json`;
  const absoluteArtifactPath = path.resolve(input.root, artifactPath);
  await mkdir(path.dirname(absoluteArtifactPath), { recursive: true });
  await writeFile(absoluteArtifactPath, `${JSON.stringify(input.lifecycle, null, 2)}\n`);
  return {
    path: artifactPath,
    kind: 'activation-lifecycle',
    schema: 'zj-loop.activation_lifecycle_evidence.v1',
  };
}

async function writePostMergeCloseoutHandoff(input: {
  root: string;
  signal: SignalEnvelope;
  orchestrationId: string;
  contractPlan: any;
  liveSideEffects: ConsumerAdapterResult['live_side_effects'];
}): Promise<ConsumerAdapterResult['review_artifacts'][number] | undefined> {
  const review = input.liveSideEffects.review;
  const branch = input.liveSideEffects.branch;
  const provider = input.liveSideEffects.external_tool ?? input.contractPlan?.provider;
  if (input.liveSideEffects.status !== 'completed' || !review?.url || !branch?.name || !provider) {
    return undefined;
  }
  const repository = stringPayload(input.signal.payload.repository)
    ?? stringPayload(input.contractPlan?.repository)
    ?? providerRepositoryFromReviewUrl(review.url)
    ?? '';
  const projectPath = stringPayload(input.signal.payload.project_path)
    ?? stringPayload(input.contractPlan?.projectPath)
    ?? stringPayload(input.contractPlan?.project_path)
    ?? repository;
  const carrierIssue = String(input.contractPlan?.reviewContract?.closeout_contract?.activation_carrier_issue
    ?? input.contractPlan?.prContract?.closeout_contract?.activation_carrier_issue
    ?? input.contractPlan?.mrContract?.closeout_contract?.activation_carrier_issue
    ?? (input.signal.subject.kind === 'issue' ? input.signal.subject.id : ''));
  const reviewNumber = review.number === undefined || review.number === null ? '' : String(review.number);
  const repoArg = provider === 'gitlab' ? projectPath : repository;
  const dryRunArgs = [
    'zj-loop-post-merge-closeout',
    'closeout-plan',
    '--provider',
    provider,
    '--repo',
    repoArg,
    provider === 'gitlab' ? '--merge-request' : '--pr',
    reviewNumber,
    '--carrier-issue',
    carrierIssue,
  ];
  const liveArgs = provider === 'github'
    ? [
        'zj-loop-post-merge-closeout',
        'live-closeout',
        '--repo',
        repoArg,
        '--pr',
        reviewNumber,
        '--carrier-issue',
        carrierIssue,
      ]
    : [
        'zj-loop-post-merge-closeout',
        'live-closeout',
        '--provider',
        'gitlab',
        '--repo',
        repoArg,
        '--merge-request',
        reviewNumber,
        '--carrier-issue',
        carrierIssue,
      ];
  const handoff = {
    schema: 'zj-loop.post_merge_closeout_handoff.v1',
    route_id: 'post-merge-roadmap-closeout',
    provider,
    review,
    repository,
    project_path: provider === 'gitlab' ? projectPath : undefined,
    carrier_issue: carrierIssue,
    branch,
    contract_source: 'review_body',
    when_to_run: 'after_review_merged',
    required_guard: [
      'merged_review',
      'valid_post_merge_contract',
      'clean_worktree',
    ],
    dry_run_command: {
      available: true,
      args: dryRunArgs,
    },
    live_closeout_command: {
      available: true,
      args: liveArgs,
    },
  };
  const artifactPath = `zj-loop/orchestrations/${input.orchestrationId}/post-merge-closeout-handoff.json`;
  const absoluteArtifactPath = path.resolve(input.root, artifactPath);
  await mkdir(path.dirname(absoluteArtifactPath), { recursive: true });
  await writeFile(absoluteArtifactPath, `${JSON.stringify(handoff, null, 2)}\n`);
  return {
    path: artifactPath,
    kind: 'post-merge-closeout-handoff',
    schema: 'zj-loop.post_merge_closeout_handoff.v1',
  };
}

function adapterStatusForActivationLifecycle(
  lifecycle: NonNullable<ConsumerAdapterResult['activation_lifecycle']>,
): ConsumerAdapterStatus {
  if (lifecycle.activation_state === 'completed') return 'executed_to_live_side_effects';
  if (lifecycle.activation_state === 'resumable') return 'resumable';
  return 'failed';
}

function classifyActivationFailure(input: {
  status: 'completed' | 'failed' | 'refused';
  reason: string;
  httpStatus?: number;
  refusals: Array<Record<string, unknown>>;
}): ActivationFailureClass {
  if (input.status === 'completed') return 'none';
  const refusalReasons = input.refusals.map((refusal) => String(refusal.reason ?? ''));
  if (refusalReasons.some((reason) => reason.includes('token-required') || reason.includes('credential'))) {
    return 'recoverable';
  }
  const terminalReasons = [
    'invalid-contract-plan-schema',
    'contract-plan-provider-is-not-github',
    'github-repository-required',
    'target-branch-required',
    'branch-prefix-must-be-zjal-',
    'unsupported-roadmap-activation-provider',
  ];
  if (terminalReasons.some((reason) => input.reason.includes(reason) || refusalReasons.includes(reason))) {
    return 'terminal';
  }
  if (input.httpStatus !== undefined) {
    if (input.httpStatus === 429 || input.httpStatus >= 500) return 'recoverable';
    if (input.httpStatus >= 400) return 'terminal';
  }
  if (input.status === 'refused') return 'recoverable';
  return 'recoverable';
}

function lastOperationKind(operations: Array<Record<string, unknown>> | undefined): string | undefined {
  const operation = operations?.[operations.length - 1];
  return typeof operation?.kind === 'string' ? operation.kind : undefined;
}

function lastHttpStatus(operations: Array<Record<string, unknown>> | undefined): number | undefined {
  const operation = operations?.slice().reverse().find((item) => typeof item.status === 'number');
  return typeof operation?.status === 'number' ? operation.status : undefined;
}

function failureReasonFromEvidence(liveSideEffects: ConsumerAdapterResult['live_side_effects']): string | undefined {
  const refusal = liveSideEffects.refusals?.find((item) => typeof item.reason === 'string');
  if (typeof refusal?.reason === 'string') return refusal.reason;
  const operation = liveSideEffects.operations?.slice().reverse().find((item) => typeof item.kind === 'string');
  if (typeof operation?.kind === 'string') return `${operation.kind}-failed`;
  return undefined;
}

function providerRepositoryFromReviewUrl(url: string): string | undefined {
  const match = url.match(/^https?:\/\/[^/]+\/([^/]+\/[^/]+)\/(?:pull|merge_requests)\//);
  return match?.[1];
}

function stableHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}

function liveHardStop(input: {
  input: {
    consumerRunPlan?: ConsumerRunPlan;
  };
  reason: string;
  nextSteps: string[];
}): ConsumerAdapterResult {
  return {
    schema: 'zj-loop.consumer_adapter_result.v1',
    route_id: 'roadmap-sliced-development',
    consumer: input.input.consumerRunPlan?.consumer ?? 'roadmap-activation',
    consumer_kind: input.input.consumerRunPlan?.consumer_kind ?? 'activation-consumer',
    adapter_status: 'hard_stopped',
    review_artifacts: [],
    repairs_applied: [],
    live_side_effects: {
      attempted: false,
      reason: input.reason,
    },
    next_steps: input.nextSteps,
    stop_signal: {
      reason: input.reason,
      next_steps: input.nextSteps,
    },
  };
}
