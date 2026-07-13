import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import yaml from 'yaml';

import {
  buildLiveRunnerEvidence,
  validateLiveRunnerEvidence,
} from './live-runner-contract.js';
import {
  buildGitLabAuthHeaders,
  buildGitLabBranchApiUrl,
  buildGitLabIssueApiUrl,
  buildGitLabMergeRequestApiUrl,
  gitLabFailureReason,
  parseGitRemoteRepository,
} from './providers.js';

const execFileAsync = promisify(execFile);

export const POST_MERGE_CONTRACT_KIND = 'zj-loop.post-merge-contract';
export const POST_MERGE_CONTRACT_VERSION = 1;
export const POST_MERGE_CONTRACT_CONSUMER = 'post-merge-cleanup';
export const POST_MERGE_CONTRACT_MODE = 'roadmap-closeout';
export const CLOSEOUT_EXECUTOR_KIND = 'zj-loop.post-merge-roadmap-closeout-executor';
export const CLOSEOUT_EXECUTOR_VERSION = 1;
export const LIVE_CLEANUP_CONFIRMATION_PHRASE = 'DELETE_MERGED_ROADMAP_BRANCH_AND_CLOSE_CARRIER';

const YAML_FENCE_PATTERN = /```(?:yaml|yml)\s*\n(?<yaml>[\s\S]*?)```/g;

function isRoadmapBranchName(branch: unknown): branch is string {
  if (typeof branch !== 'string') return false;
  if (branch.includes('..')) return false;
  return branch.startsWith('zjal-') || branch.startsWith('zjal/');
}

export type CommandResult = {
  command: string;
  args: string[];
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type CommandRunner = (command: string, args: string[]) => Promise<CommandResult>;
type FetchResponseLike = {
  ok: boolean;
  status: number;
  statusText?: string;
  json: () => Promise<any>;
  text?: () => Promise<string>;
};
type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<FetchResponseLike>;

export type PostMergePullRequest = {
  provider?: 'github' | 'gitlab';
  reviewKind?: 'pull-request' | 'merge-request';
  number?: number;
  url?: string;
  body?: string;
  merged?: boolean;
  mergedAt?: string | null;
  baseRefName?: string;
  headRefName?: string;
  headRepositoryOwner?: string | { login?: string };
  baseRepositoryOwner?: string | { login?: string };
  baseRepository?: string;
  repository?: string;
  isCrossRepository?: boolean;
};

export type PostMergeContractResult = {
  ok: boolean;
  contract: any | null;
  reason: string;
  errors: string[];
};

export type PostMergeCloseoutPlan = {
  schemaVersion: typeof CLOSEOUT_EXECUTOR_VERSION;
  kind: typeof CLOSEOUT_EXECUTOR_KIND;
  mode: 'dry-run' | 'live';
  status: 'dry-run' | 'ready-for-live-execution' | 'refused';
  side_effects_executed: false;
  pr: {
    provider: 'github' | 'gitlab';
    reviewKind: 'pull-request' | 'merge-request';
    number: number | null;
    url: string;
    merged: boolean;
    baseRefName: string;
    headRefName: string;
  };
  review: {
    provider: 'github' | 'gitlab';
    kind: 'pull-request' | 'merge-request';
    number: number | null;
    url: string;
    merged: boolean;
    targetRefName: string;
    sourceRefName: string;
  };
  repository: {
    expected: string;
    current: string;
  };
  roadmap: {
    id: string;
    branch: string;
    targetBranch: string;
  };
  carrier: {
    issue: number | null;
    expectedIssue: number | null;
  };
  contractPlan: any;
  executorGuards: Array<{ name: string; pass: boolean; reason: string }>;
  confirmation: {
    required: boolean;
    authorization_source: 'merged-pr-contract' | 'fixed-phrase';
    confirmation_location: string[];
    required_phrase: typeof LIVE_CLEANUP_CONFIRMATION_PHRASE;
    side_effects: string[];
    why_required: string;
    audit_target: string[];
  };
  refusals: Array<{ layer: string; reason: string; guard?: string }>;
  actions: any[];
};

export async function defaultPostMergeRunner(
  command: string,
  args: string[] = [],
): Promise<CommandResult> {
  try {
    const result = await execFileAsync(command, args, {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 10,
    });
    return {
      command,
      args,
      exitCode: 0,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
    };
  } catch (error: unknown) {
    const err = error as { code?: unknown; stdout?: string; stderr?: string; message?: string };
    const exitCode = Number.isInteger(err.code) ? Number(err.code) : 1;
    return {
      command,
      args,
      exitCode,
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? err.message ?? '',
    };
  }
}

export function parsePostMergeContractFromPrBody(body: string): PostMergeContractResult {
  const text = String(body ?? '');

  for (const match of text.matchAll(YAML_FENCE_PATTERN)) {
    try {
      const parsed = yaml.parse(match.groups?.yaml ?? '');
      if (parsed?.kind !== POST_MERGE_CONTRACT_KIND) continue;
      return {
        ok: true,
        contract: parsed,
        reason: 'contract-found',
        errors: [],
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        contract: null,
        reason: 'invalid-yaml',
        errors: [`invalid yaml: ${message}`],
      };
    }
  }

  return {
    ok: false,
    contract: null,
    reason: 'missing-contract',
    errors: ['missing post-merge contract'],
  };
}

export function validatePostMergeContract(contract: any, { pr }: { pr?: PostMergePullRequest } = {}) {
  const errors: string[] = [];
  if (!contract || typeof contract !== 'object') {
    return { ok: false, errors: ['contract must be an object'], guards: buildContractGuards({ pr, contract }) };
  }

  if (contract.kind !== POST_MERGE_CONTRACT_KIND) errors.push(`kind must be ${POST_MERGE_CONTRACT_KIND}`);
  if (contract.version !== POST_MERGE_CONTRACT_VERSION) errors.push(`version must be ${POST_MERGE_CONTRACT_VERSION}`);
  if (contract.consumer !== POST_MERGE_CONTRACT_CONSUMER) errors.push(`consumer must be ${POST_MERGE_CONTRACT_CONSUMER}`);
  if (contract.mode !== POST_MERGE_CONTRACT_MODE) errors.push(`mode must be ${POST_MERGE_CONTRACT_MODE}`);
  if (!contract.roadmap?.id) errors.push('roadmap.id is required');
  if (!contract.roadmap?.branch) errors.push('roadmap.branch is required');
  if (contract.roadmap?.branch && pr?.headRefName && contract.roadmap.branch !== pr.headRefName) {
    errors.push('roadmap.branch must match PR head branch');
  }
  if (contract.roadmap?.branch && !isRoadmapBranchName(contract.roadmap.branch)) {
    errors.push('roadmap.branch must use zjal-<roadmap-id>');
  }
  if (contract.cleanup?.delete_merged_branch !== true && contract.cleanup?.close_carrier_issue !== true) {
    errors.push('cleanup must request at least one supported action');
  }
  if (contract.cleanup?.close_carrier_issue === true && !Number.isInteger(contract.carrier?.issue)) {
    errors.push('carrier.issue is required when close_carrier_issue is true');
  }
  if (contract.safety?.require_pr_merged !== true) errors.push('safety.require_pr_merged must be true');
  if (contract.safety?.require_branch_merged !== true) errors.push('safety.require_branch_merged must be true');
  if (contract.cleanup?.close_carrier_issue === true && contract.safety?.no_pending_followups !== true) {
    errors.push('safety.no_pending_followups must be true when close_carrier_issue is true');
  }
  if (contract.safety?.missing_contract_behavior !== 'report-only') {
    errors.push('safety.missing_contract_behavior must be report-only');
  }

  const guards = buildContractGuards({ pr, contract });
  if (!guards.pr_merged) errors.push('PR must be merged');
  if (!guards.current_roadmap_branch) errors.push('roadmap branch must be the current PR head branch');
  if (!guards.same_repository) errors.push('PR head repository must match base repository');
  if (!guards.not_protected_branch) errors.push('roadmap branch must not be a protected or long-lived branch');

  return { ok: errors.length === 0, errors, guards };
}

export function buildRoadmapCloseoutContractPlan(input: {
  pr: PostMergePullRequest;
  contractResult: PostMergeContractResult;
}) {
  if (!input.contractResult?.ok) {
    return {
      status: 'report-only',
      reason: input.contractResult?.reason ?? 'missing-contract',
      validation: {
        ok: false,
        errors: input.contractResult?.errors ?? ['missing post-merge contract'],
      },
      guards: buildContractGuards({ pr: input.pr, contract: null }),
      actions: [],
      side_effects_executed: false,
    };
  }

  const validation = validatePostMergeContract(input.contractResult.contract, { pr: input.pr });
  if (!validation.ok) {
    return {
      status: 'report-only',
      reason: 'contract-validation-failed',
      validation,
      guards: validation.guards,
      actions: [],
      side_effects_executed: false,
    };
  }

  return {
    status: 'dry-run',
    reason: 'contract-valid-side-effects-disabled',
    validation,
    guards: validation.guards,
    actions: buildPlannedActions(input.contractResult.contract),
    side_effects_executed: false,
  };
}

export function buildPostMergeRoadmapCloseoutExecutionPlan(input: {
  pr: PostMergePullRequest;
  prBody?: string;
  expectedRepo?: string;
  currentRepo?: string;
  gitStatus?: string;
  expectedCarrierIssue?: number;
  live?: boolean;
}): PostMergeCloseoutPlan {
  const pr = normalizePr(input.pr);
  const contractResult = parsePostMergeContractFromPrBody(input.prBody ?? pr.body ?? '');
  const contractPlan = buildRoadmapCloseoutContractPlan({ pr, contractResult });
  const contract = contractResult.contract;
  const branch = contract?.roadmap?.branch ?? '';
  const carrierIssue = contract?.carrier?.issue ?? null;
  const targetBranch = pr.baseRefName ?? '';
  const expectedRepo = input.expectedRepo ?? pr.baseRepository ?? pr.repository ?? '';
  const currentRepo = input.currentRepo ?? '';
  const executorGuards = buildExecutorGuards({
    pr,
    contract,
    currentRepo,
    expectedRepo,
    gitStatus: input.gitStatus,
    expectedCarrierIssue: input.expectedCarrierIssue,
  });
  const refusals = [
    ...contractPlan.validation.errors.map((reason: string) => ({ layer: 'contract', reason })),
    ...executorGuards.filter((guard) => !guard.pass).map((guard) => ({
      layer: 'executor',
      reason: guard.reason,
      guard: guard.name,
    })),
  ];
  const executable = contractPlan.status === 'dry-run' && refusals.length === 0;

  return {
    schemaVersion: CLOSEOUT_EXECUTOR_VERSION,
    kind: CLOSEOUT_EXECUTOR_KIND,
    mode: input.live ? 'live' : 'dry-run',
    status: executable ? (input.live ? 'ready-for-live-execution' : 'dry-run') : 'refused',
    side_effects_executed: false,
    pr: {
      provider: pr.provider ?? 'github',
      reviewKind: pr.reviewKind ?? 'pull-request',
      number: pr.number ?? null,
      url: pr.url ?? '',
      merged: pr.merged === true,
      baseRefName: pr.baseRefName ?? '',
      headRefName: pr.headRefName ?? '',
    },
    review: {
      provider: pr.provider ?? 'github',
      kind: pr.reviewKind ?? 'pull-request',
      number: pr.number ?? null,
      url: pr.url ?? '',
      merged: pr.merged === true,
      targetRefName: pr.baseRefName ?? '',
      sourceRefName: pr.headRefName ?? '',
    },
    repository: {
      expected: expectedRepo,
      current: currentRepo,
    },
    roadmap: {
      id: contract?.roadmap?.id ?? '',
      branch,
      targetBranch,
    },
    carrier: {
      issue: carrierIssue,
      expectedIssue: input.expectedCarrierIssue ?? null,
    },
    contractPlan,
    executorGuards,
    confirmation: buildLiveCleanupConfirmation({
      provider: pr.provider ?? 'github',
      reviewKind: pr.reviewKind ?? 'pull-request',
      reviewNumber: pr.number ?? null,
      carrierIssue,
      contractAuthorized: executable,
    }),
    refusals,
    actions: executable ? buildExecutableActions({ branch, carrierIssue, targetBranch }) : [],
  };
}

function buildLiveCleanupConfirmation(
  input: {
    provider: 'github' | 'gitlab';
    reviewKind: 'pull-request' | 'merge-request';
    reviewNumber: number | null;
    carrierIssue: number | null;
    contractAuthorized: boolean;
  },
): PostMergeCloseoutPlan['confirmation'] {
  const review = reviewLabel(input.provider, input.reviewKind, input.reviewNumber);
  return {
    required: !input.contractAuthorized,
    authorization_source: input.contractAuthorized ? 'merged-pr-contract' : 'fixed-phrase',
    confirmation_location: confirmationLocationsFor(input.provider),
    required_phrase: LIVE_CLEANUP_CONFIRMATION_PHRASE,
    side_effects: [
      'switch local checkout to the review target branch and fast-forward from origin',
      'delete the merged zjal- roadmap branch locally when present and merged',
      'delete the merged zjal- roadmap branch on origin when present',
      `append closeout evidence to carrier issue #${input.carrierIssue ?? 'unknown'}`,
      `close carrier issue #${input.carrierIssue ?? 'unknown'}`,
    ],
    why_required: input.contractAuthorized
      ? `No extra confirmation is required: the merged ${review} contains a valid post-merge contract and all executor guards passed.`
      : `Live cleanup deletes a branch and closes an issue, so operator intent must be explicit and auditable when merged ${review} contract authorization is unavailable.`,
    audit_target: [
      `merged ${review}`,
      `carrier issue #${input.carrierIssue ?? 'unknown'}`,
      'post-merge closeout JSON plan',
    ],
  };
}

function confirmationLocationsFor(provider: 'github' | 'gitlab'): string[] {
  if (provider === 'gitlab') {
    return [
      'Codex chat reply when a local maintainer is operating the closeout CLI',
    ];
  }
  return [
    'Codex chat reply when a local maintainer is operating the closeout CLI',
    'workflow_dispatch input confirm_live_cleanup when using GitHub Actions',
  ];
}

function reviewLabel(
  provider: 'github' | 'gitlab',
  reviewKind: 'pull-request' | 'merge-request',
  number: number | null | undefined,
): string {
  const prefix = provider === 'gitlab' || reviewKind === 'merge-request' ? 'MR' : 'PR';
  return `${prefix} #${number ?? 'unknown'}`;
}

export function buildPostMergeLiveRunnerEvidence(
  result: any,
  { createdAt = new Date().toISOString() }: { createdAt?: string } = {},
) {
  const executed = result?.status === 'executed';
  const skipped = result?.status === 'skipped';
  const evidence = buildLiveRunnerEvidence({
    runner_id: 'post-merge-cleanup',
    route_id: 'post-merge-roadmap-closeout',
    consumer_kind: 'cleanup-consumer',
    execution_mode: 'live',
    completion_form: executed ? 'cleanup-done' : skipped ? 'cleanup-skipped' : 'escalation-issue',
    status: executed ? 'completed' : skipped ? 'skipped' : 'escalated',
    dedupe_key: `post-merge-roadmap-closeout:${result?.pr?.number ?? 'unknown'}`,
    created_at: createdAt,
    source: {
      kind: 'post-merge-contract',
      id: String(result?.pr?.number ?? ''),
      url: result?.pr?.url ?? '',
    },
    verifier_evidence: [
      {
        kind: 'post-merge-contract',
        status: result?.contractPlan?.validation?.ok === true ? 'passed' : 'failed',
      },
      ...((result?.executorGuards ?? []).map((guard: { name: string; pass: boolean }) => ({
        kind: 'executor-guard',
        name: guard.name,
        status: guard.pass ? 'passed' : 'failed',
      }))),
    ],
    side_effects: {
      executed: result?.side_effects_executed === true,
      level: 'cleanup',
      actions: (result?.execution?.steps ?? []).map((step: any) => ({
        kind: step.name,
        type: step.type,
        status: step.status,
        result: step.result,
        reason: step.reason,
        provider: step.provider,
        project_path: step.project_path,
        branch: step.branch,
        issue: step.issue,
      })),
    },
  });
  const validation = validateLiveRunnerEvidence(evidence);
  if (!validation.ok) {
    throw new Error(`Invalid post-merge live runner evidence: ${validation.errors.join(', ')}`);
  }
  return evidence;
}

export async function executePostMergeRoadmapCloseout(
  plan: PostMergeCloseoutPlan,
  {
    runner = defaultPostMergeRunner,
    fetchImpl,
    gitlabToken,
    gitlabJobToken,
    gitlabApiBaseUrl,
  }: {
    runner?: CommandRunner;
    fetchImpl?: FetchLike;
    gitlabToken?: string;
    gitlabJobToken?: string;
    gitlabApiBaseUrl?: string;
  } = {},
) {
  if (plan.status !== 'ready-for-live-execution') {
    const refused = {
      ...plan,
      execution: {
        status: 'refused',
        reason: 'plan-not-ready-for-live-execution',
        steps: [],
      },
      side_effects_executed: false,
    };
    return {
      ...refused,
      runner_evidence: buildPostMergeLiveRunnerEvidence(refused),
    };
  }
  if (plan.review.provider === 'gitlab') {
    return executeGitLabPostMergeRoadmapCloseout(plan, {
      fetchImpl,
      token: gitlabToken,
      jobToken: gitlabJobToken,
      apiBaseUrl: gitlabApiBaseUrl,
    });
  }

  const branch = plan.roadmap.branch;
  const targetBranch = plan.roadmap.targetBranch;
  const issue = plan.carrier.issue;
  const steps: any[] = [];

  await runRequired(steps, runner, 'git', ['fetch', 'origin']);
  await runRequired(steps, runner, 'git', ['switch', targetBranch]);
  await runRequired(steps, runner, 'git', ['merge', '--ff-only', `origin/${targetBranch}`]);

  const localBranchProbe = await runProbe(steps, runner, 'git', [
    'show-ref',
    '--verify',
    '--quiet',
    `refs/heads/${branch}`,
  ]);
  if (localBranchProbe.exitCode === 0) {
    const mergedBranches = await runRequired(steps, runner, 'git', ['branch', '--merged', targetBranch]);
    if (!branchListContains(mergedBranches.stdout, branch)) {
      throw new Error(`refusing to delete local branch ${branch}: not listed in git branch --merged ${targetBranch}`);
    }
    await runRequired(steps, runner, 'git', ['branch', '-d', branch]);
  } else {
    steps.push({ name: 'delete-local-branch', status: 'skipped', reason: 'local-branch-absent', branch });
  }

  const remoteBranchProbe = await runProbe(steps, runner, 'git', [
    'ls-remote',
    '--exit-code',
    '--heads',
    'origin',
    branch,
  ]);
  if (remoteBranchProbe.exitCode === 0) {
    await runRequired(steps, runner, 'git', ['push', 'origin', '--delete', branch]);
  } else {
    steps.push({ name: 'delete-remote-branch', status: 'skipped', reason: 'remote-branch-absent', branch });
  }

  await runRequired(steps, runner, 'gh', [
    'issue',
    'comment',
    String(issue),
    '--body',
    buildCloseoutEvidenceComment(plan),
  ]);
  await runRequired(steps, runner, 'gh', [
    'issue',
    'close',
    String(issue),
    '--comment',
    buildCarrierCloseComment(plan),
  ]);

  const executed = {
    ...plan,
    status: 'executed',
    side_effects_executed: true,
    execution: {
      status: 'executed',
      steps,
    },
  };
  return {
    ...executed,
    runner_evidence: buildPostMergeLiveRunnerEvidence(executed),
  };
}

async function executeGitLabPostMergeRoadmapCloseout(
  plan: PostMergeCloseoutPlan,
  input: {
    fetchImpl?: FetchLike;
    token?: string;
    jobToken?: string;
    apiBaseUrl?: string;
  },
) {
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    return buildSkippedCloseoutResult(plan, 'gitlab-fetch-unavailable');
  }
  const authHeaders = buildGitLabAuthHeaders({ token: input.token, jobToken: input.jobToken });
  const headers: Record<string, string> = {
    ...authHeaders,
    'Content-Type': 'application/json',
  };
  if (Object.keys(authHeaders).length === 0) {
    return buildSkippedCloseoutResult(plan, 'gitlab-token-required-for-live-closeout');
  }

  const projectPath = plan.repository.expected;
  const branch = plan.roadmap.branch;
  const issue = plan.carrier.issue;
  const steps: any[] = [];

  const deleteBranchUrl = buildGitLabBranchApiUrl({
    apiBaseUrl: input.apiBaseUrl,
    projectPath,
    branch,
  });
  const deleteBranchResponse = await fetchImpl(deleteBranchUrl, {
    method: 'DELETE',
    headers,
  });
  if (deleteBranchResponse.ok || deleteBranchResponse.status === 204) {
    steps.push({
      name: 'delete-gitlab-branch',
      type: 'delete-branch',
      provider: 'gitlab',
      project_path: projectPath,
      branch,
      status: 'ok',
      result: 'deleted',
    });
  } else if (deleteBranchResponse.status === 404) {
    steps.push({
      name: 'delete-gitlab-branch',
      type: 'delete-branch',
      provider: 'gitlab',
      project_path: projectPath,
      branch,
      status: 'skipped',
      result: 'already_deleted',
      reason: 'branch-not-found',
    });
  } else {
    return buildSkippedCloseoutResult(plan, await gitLabFailureReason('gitlab-branch-delete-failed', deleteBranchResponse), steps);
  }

  if (!Number.isInteger(issue)) {
    return buildSkippedCloseoutResult(plan, 'carrier-issue-required-for-gitlab-live-closeout', steps);
  }
  const closeIssueUrl = buildGitLabIssueApiUrl({
    apiBaseUrl: input.apiBaseUrl,
    projectPath,
    issue: Number(issue),
  });
  const issueProbeResponse = await fetchImpl(closeIssueUrl, {
    method: 'GET',
    headers,
  });
  if (!issueProbeResponse.ok) {
    return buildSkippedCloseoutResult(plan, await gitLabFailureReason('gitlab-carrier-issue-probe-failed', issueProbeResponse), steps);
  }
  const issueProbe = await issueProbeResponse.json();
  if (issueProbe?.state === 'closed') {
    steps.push({
      name: 'close-gitlab-carrier-issue',
      type: 'close-carrier-issue',
      provider: 'gitlab',
      project_path: projectPath,
      issue: Number(issue),
      status: 'skipped',
      result: 'already_closed',
      reason: 'carrier-issue-already-closed',
    });
    const executed = {
      ...plan,
      status: 'executed',
      side_effects_executed: true,
      execution: {
        status: 'executed',
        steps,
      },
    };
    return {
      ...executed,
      runner_evidence: buildPostMergeLiveRunnerEvidence(executed),
    };
  }

  const closeIssueResponse = await fetchImpl(closeIssueUrl, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ state_event: 'close' }),
  });
  if (!closeIssueResponse.ok) {
    return buildSkippedCloseoutResult(plan, await gitLabFailureReason('gitlab-carrier-issue-close-failed', closeIssueResponse), steps);
  }
  const closedIssue = await closeIssueResponse.json();
  steps.push({
    name: 'close-gitlab-carrier-issue',
    type: 'close-carrier-issue',
    provider: 'gitlab',
    project_path: projectPath,
    issue: Number(issue),
    status: 'ok',
    result: 'closed',
    response_state: closedIssue?.state,
  });

  const executed = {
    ...plan,
    status: 'executed',
    side_effects_executed: true,
    execution: {
      status: 'executed',
      steps,
    },
  };
  return {
    ...executed,
    runner_evidence: buildPostMergeLiveRunnerEvidence(executed),
  };
}

function buildSkippedCloseoutResult(plan: PostMergeCloseoutPlan, reason: string, steps: any[] = []) {
  const skipped = {
    ...plan,
    status: 'skipped',
    side_effects_executed: false,
    execution: {
      status: 'skipped',
      reason,
      steps,
      next_steps: ['Review the skipped cleanup reason and rerun live closeout after fixing the GitLab API/token/precondition issue.'],
    },
  };
  return {
    ...skipped,
    runner_evidence: buildPostMergeLiveRunnerEvidence(skipped),
  };
}

export function buildCloseoutEvidenceComment(plan: PostMergeCloseoutPlan) {
  const review = reviewLabel(plan.review.provider, plan.review.kind, plan.review.number);
  const fields = [
    ['kind', 'zj-loop.post-merge-closeout-executed'],
    ['version', CLOSEOUT_EXECUTOR_VERSION],
    ['pr', plan.pr.number],
    ['roadmap_branch', plan.roadmap.branch],
    ['carrier_issue', plan.carrier.issue],
    ['side_effects_executed', true],
  ];
  return [
    'Post-merge roadmap closeout executed.',
    '',
    '<!-- zj-loop',
    ...fields.map(([key, value]) => `${key}: ${value}`),
    '-->',
    '',
    `- Review: ${review}`,
    `- Roadmap branch: \`${plan.roadmap.branch}\``,
    `- Carrier issue: #${plan.carrier.issue}`,
    '- Cleanup: merged roadmap branch deleted when present; carrier issue closing follows this evidence comment.',
  ].join('\n');
}

export function buildCarrierCloseComment(plan: PostMergeCloseoutPlan) {
  const review = reviewLabel(plan.review.provider, plan.review.kind, plan.review.number);
  return [
    'Closing this Roadmap-Sliced Development activation carrier after post-merge closeout.',
    '',
    `- Review: ${review}`,
    `- Roadmap branch: \`${plan.roadmap.branch}\``,
    '- Contract guard: valid `zj-loop.post-merge-contract` with `no_pending_followups: true`.',
  ].join('\n');
}

export function buildDryRunEvidenceComment(
  plan: PostMergeCloseoutPlan,
  {
    artifactName = 'post-merge-roadmap-closeout-plan',
    liveCommand,
  }: { artifactName?: string; liveCommand?: string } = {},
): string {
  const command = liveCommand ?? buildLiveCommand(plan);
  const review = reviewLabel(plan.review.provider, plan.review.kind, plan.review.number);
  const passedGuards = plan.executorGuards.filter((guard) => guard.pass).length;
  const totalGuards = plan.executorGuards.length;
  const fields = [
    ['kind', 'zj-loop.post-merge-closeout-dry-run'],
    ['version', CLOSEOUT_EXECUTOR_VERSION],
    ['pr', plan.pr.number],
    ['status', plan.status],
    ['roadmap_branch', plan.roadmap.branch || ''],
    ['carrier_issue', plan.carrier.issue ?? ''],
    ['side_effects_executed', false],
    ['artifact', artifactName],
  ];
  const summary = plan.status === 'dry-run'
    ? 'Post-merge roadmap closeout dry-run passed.'
    : 'Post-merge roadmap closeout dry-run recorded a refusal.';
  const refusalLines = plan.refusals.length === 0
    ? ['- Refusals: none']
    : plan.refusals.map((refusal) => `- Refusal: ${refusal.layer}/${refusal.guard ?? 'contract'} - ${refusal.reason}`);

  return [
    summary,
    '',
    '<!-- zj-loop',
    ...fields.map(([key, value]) => `${key}: ${value}`),
    '-->',
    '',
    `- Review: ${review}`,
    `- Status: \`${plan.status}\``,
    `- Roadmap branch: ${plan.roadmap.branch ? `\`${plan.roadmap.branch}\`` : 'not available'}`,
    `- Carrier issue: ${plan.carrier.issue ? `#${plan.carrier.issue}` : 'not available'}`,
    `- Guard summary: ${passedGuards}/${totalGuards} executor guards passed`,
    '- Side effects executed: false',
    `- Full JSON plan: workflow artifact \`${artifactName}\``,
    ...refusalLines,
    '',
    plan.status === 'dry-run'
      ? `Live cleanup command: \`${command}\``
      : 'Live cleanup is not available until the refusals above are resolved.',
    '',
    plan.confirmation.required
      ? '### Confirmation required for live cleanup'
      : '### Live cleanup authorization',
    '',
    `- Authorization source: ${plan.confirmation.authorization_source}`,
    `- Confirmation required: ${plan.confirmation.required}`,
    ...(plan.confirmation.required
      ? [
          `- Reply/input location: ${plan.confirmation.confirmation_location.join('; ')}`,
          `- Required phrase: \`${plan.confirmation.required_phrase}\``,
        ]
      : []),
    `- Reason: ${plan.confirmation.why_required}`,
    `- Audit target: ${plan.confirmation.audit_target.join('; ')}`,
  ].join('\n');
}

export function buildLiveCommand(plan: PostMergeCloseoutPlan): string {
  if (plan.review.provider === 'gitlab') {
    const args = [
      'zj-loop-post-merge-closeout live-closeout',
      '--provider gitlab',
      `--repo ${plan.repository.expected}`,
      `--merge-request ${plan.review.number}`,
    ];
    if (plan.carrier.issue) args.push(`--carrier-issue ${plan.carrier.issue}`);
    if (plan.confirmation.required) {
      args.push(`--confirm-live-cleanup ${LIVE_CLEANUP_CONFIRMATION_PHRASE}`);
    }
    return args.join(' ');
  }
  const args = [
    'zj-loop-post-merge-closeout live-closeout',
    `--pr ${plan.pr.number}`,
    `--repo ${plan.repository.expected}`,
  ];
  if (plan.carrier.issue) args.push(`--carrier-issue ${plan.carrier.issue}`);
  if (plan.confirmation.required) {
    args.push(`--confirm-live-cleanup ${LIVE_CLEANUP_CONFIRMATION_PHRASE}`);
  }
  return args.join(' ');
}

export async function collectCloseoutInputFromGitHub(input: {
  prNumber: string | number;
  expectedRepo: string;
  runner?: CommandRunner;
}) {
  const runner = input.runner ?? defaultPostMergeRunner;
  const prResult = await runRequired([], runner, 'gh', [
    'pr',
    'view',
    String(input.prNumber),
    '--json',
    [
      'number',
      'url',
      'body',
      'mergedAt',
      'baseRefName',
      'headRefName',
      'headRepositoryOwner',
      'isCrossRepository',
    ].join(','),
  ]);
  const currentRepoResult = await runRequired([], runner, 'git', ['remote', 'get-url', 'origin']);
  const gitStatusResult = await runRequired([], runner, 'git', ['status', '--porcelain']);
  const pr = JSON.parse(prResult.stdout);

  return {
    pr: normalizeGhPrView(pr, { expectedRepo: input.expectedRepo }),
    prBody: pr.body,
    expectedRepo: input.expectedRepo,
    currentRepo: parseRepositoryFromGitRemote(currentRepoResult.stdout.trim()),
    gitStatus: gitStatusResult.stdout,
  };
}

export async function collectCloseoutInputFromGitLab(input: {
  iid: string | number;
  expectedRepo: string;
  apiBaseUrl?: string;
  token?: string;
  jobToken?: string;
  fetchImpl?: FetchLike;
}) {
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('GitLab MR metadata fetch requires global fetch or an injected fetch implementation');
  }
  const apiUrl = buildGitLabMergeRequestApiUrl({
    apiBaseUrl: input.apiBaseUrl,
    projectPath: input.expectedRepo,
    iid: input.iid,
  });
  const headers = buildGitLabAuthHeaders({ token: input.token, jobToken: input.jobToken });
  const response = await fetchImpl(apiUrl, { headers });
  if (!response.ok) {
    const body = response.text ? await response.text() : '';
    throw new Error(`GitLab MR metadata fetch failed: ${response.status} ${response.statusText ?? ''}${body ? ` - ${body}` : ''}`.trim());
  }
  const mr = normalizeGitLabMrView(await response.json(), { expectedRepo: input.expectedRepo });
  return {
    pr: mr,
    prBody: mr.body,
    expectedRepo: input.expectedRepo,
    currentRepo: input.expectedRepo,
    gitStatus: '',
  };
}

export function normalizeGhPrView(pr: PostMergePullRequest, { expectedRepo }: { expectedRepo: string }) {
  const expectedOwner = String(expectedRepo ?? '').split('/')[0];
  const headOwner = normalizeOwner(pr.headRepositoryOwner);
  return {
    ...pr,
    provider: 'github' as const,
    reviewKind: 'pull-request' as const,
    merged: Boolean(pr.mergedAt),
    headRepositoryOwner: headOwner,
    baseRepositoryOwner: pr.isCrossRepository ? expectedOwner : headOwner,
  };
}

export function normalizeGitLabMrView(mr: {
  iid?: number | string;
  number?: number | string;
  web_url?: string;
  url?: string;
  description?: string;
  body?: string;
  state?: string;
  merged?: boolean;
  merged_at?: string | null;
  source_branch?: string;
  target_branch?: string;
  source_project_path?: string;
  target_project_path?: string;
  project_path?: string;
}, { expectedRepo }: { expectedRepo: string }) {
  const number = Number(mr.iid ?? mr.number);
  const sourceProject = mr.source_project_path ?? mr.project_path ?? expectedRepo;
  const targetProject = mr.target_project_path ?? mr.project_path ?? expectedRepo;
  return {
    provider: 'gitlab' as const,
    reviewKind: 'merge-request' as const,
    number: Number.isInteger(number) ? number : undefined,
    url: mr.web_url ?? mr.url ?? '',
    body: mr.description ?? mr.body ?? '',
    merged: mr.merged === true || Boolean(mr.merged_at) || mr.state === 'merged',
    mergedAt: mr.merged_at ?? null,
    baseRefName: mr.target_branch ?? '',
    headRefName: mr.source_branch ?? '',
    baseRepositoryOwner: targetProject,
    headRepositoryOwner: sourceProject,
    baseRepository: targetProject,
    repository: targetProject,
    isCrossRepository: sourceProject !== targetProject,
  };
}

export function normalizePr(pr: PostMergePullRequest = {}) {
  return {
    provider: pr.provider ?? 'github',
    reviewKind: pr.reviewKind ?? 'pull-request',
    ...pr,
    headRepositoryOwner: normalizeOwner(pr.headRepositoryOwner),
    baseRepositoryOwner: normalizeOwner(pr.baseRepositoryOwner),
  };
}

export function parseRepositoryFromGitRemote(remoteUrl: string): string {
  const text = String(remoteUrl ?? '').trim().replace(/\.git$/, '');
  const parsed = parseGitRemoteRepository(remoteUrl);
  if (parsed) return parsed.slug;
  return text;
}

function buildContractGuards({ pr, contract }: { pr?: PostMergePullRequest; contract: any }) {
  const branch = contract?.roadmap?.branch;
  const head = pr?.headRefName;
  return {
    pr_merged: pr?.merged === true,
    current_roadmap_branch: Boolean(branch && head && branch === head),
    roadmap_branch_prefix: isRoadmapBranchName(branch),
    same_repository: Boolean(
      pr?.headRepositoryOwner &&
      pr?.baseRepositoryOwner &&
      normalizeOwner(pr.headRepositoryOwner) === normalizeOwner(pr.baseRepositoryOwner),
    ),
    not_protected_branch: !isProtectedOrLongLivedBranch(branch),
  };
}

function buildPlannedActions(contract: any) {
  const actions = [];
  if (contract.cleanup?.delete_merged_branch === true) {
    actions.push({
      name: 'delete_merged_branch',
      status: 'planned',
      branch: contract.roadmap.branch,
    });
  }
  if (contract.cleanup?.close_carrier_issue === true) {
    actions.push({
      name: 'close_carrier_issue',
      status: 'planned',
      issue: contract.carrier.issue,
    });
  }
  return actions;
}

function buildExecutorGuards(input: {
  pr: PostMergePullRequest;
  contract: any;
  currentRepo: string;
  expectedRepo: string;
  gitStatus?: string;
  expectedCarrierIssue?: number;
}) {
  const branch = input.contract?.roadmap?.branch;
  const carrierIssue = input.contract?.carrier?.issue;
  const targetBranch = input.pr.baseRefName;
  return [
    {
      name: 'target-branch-present',
      pass: Boolean(targetBranch && typeof targetBranch === 'string' && targetBranch.trim() && targetBranch !== branch),
      reason: 'review target branch must be present and must not equal the roadmap branch',
    },
    {
      name: 'current-repository',
      pass: Boolean(input.expectedRepo && input.currentRepo && input.expectedRepo === input.currentRepo),
      reason: 'current repository must match expected repository',
    },
    {
      name: 'clean-worktree',
      pass: String(input.gitStatus ?? '').trim() === '',
      reason: 'local worktree must be clean before live closeout',
    },
    {
      name: 'expected-carrier-issue',
      pass: input.expectedCarrierIssue === undefined || Number(input.expectedCarrierIssue) === Number(carrierIssue),
      reason: 'contract carrier issue must match expected activation carrier issue',
    },
    {
      name: 'single-roadmap-branch',
      pass: isRoadmapBranchName(branch),
      reason: 'roadmap branch must be a single zjal-<roadmap-id> branch name',
    },
  ];
}

function buildExecutableActions(input: { branch: string; carrierIssue: number | null; targetBranch: string }) {
  return [
    { name: 'fetch_origin', command: ['git', 'fetch', 'origin'] },
    { name: 'switch_target_branch', command: ['git', 'switch', input.targetBranch] },
    { name: 'fast_forward_target_branch', command: ['git', 'merge', '--ff-only', `origin/${input.targetBranch}`] },
    { name: 'delete_local_branch_if_present_and_merged', branch: input.branch },
    { name: 'delete_remote_branch_if_present', branch: input.branch },
    { name: 'comment_carrier_issue', issue: input.carrierIssue },
    { name: 'close_carrier_issue', issue: input.carrierIssue },
  ];
}

async function runRequired(
  steps: any[],
  runner: CommandRunner,
  command: string,
  args: string[],
): Promise<CommandResult> {
  const result = await runner(command, args);
  steps.push({ name: commandStepName(command, args), status: result.exitCode === 0 ? 'ok' : 'failed', command, args });
  if (result.exitCode !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit ${result.exitCode}: ${result.stderr}`);
  }
  return result;
}

async function runProbe(
  steps: any[],
  runner: CommandRunner,
  command: string,
  args: string[],
): Promise<CommandResult> {
  const result = await runner(command, args);
  steps.push({ name: commandStepName(command, args), status: result.exitCode === 0 ? 'present' : 'absent', command, args });
  if (![0, 1, 2].includes(result.exitCode)) {
    throw new Error(`${command} ${args.join(' ')} probe failed with exit ${result.exitCode}: ${result.stderr}`);
  }
  return result;
}

function commandStepName(command: string, args: string[]) {
  return [command, ...args.slice(0, 2)].join(' ');
}

function branchListContains(stdout: string, branch: string) {
  return String(stdout ?? '')
    .split('\n')
    .map((line) => line.replace(/^\*\s*/, '').trim())
    .includes(branch);
}

function isProtectedOrLongLivedBranch(branch: string | undefined) {
  if (!branch) return true;
  return ['main', 'master', 'develop', 'dev'].includes(branch) || branch.startsWith('release/');
}

function normalizeOwner(owner: string | { login?: string } | undefined) {
  if (typeof owner === 'string') return owner;
  if (owner && typeof owner.login === 'string') return owner.login;
  return owner;
}
