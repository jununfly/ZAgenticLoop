import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import yaml from 'yaml';

import {
  buildLiveRunnerEvidence,
  validateLiveRunnerEvidence,
} from './live-runner-contract.js';

const execFileAsync = promisify(execFile);

export const POST_MERGE_CONTRACT_KIND = 'zj-loop.post-merge-contract';
export const POST_MERGE_CONTRACT_VERSION = 1;
export const POST_MERGE_CONTRACT_CONSUMER = 'post-merge-cleanup';
export const POST_MERGE_CONTRACT_MODE = 'roadmap-closeout';
export const CLOSEOUT_EXECUTOR_KIND = 'zj-loop.post-merge-roadmap-closeout-executor';
export const CLOSEOUT_EXECUTOR_VERSION = 1;
export const LIVE_CLEANUP_CONFIRMATION_PHRASE = 'DELETE_MERGED_ROADMAP_BRANCH_AND_CLOSE_CARRIER';

const YAML_FENCE_PATTERN = /```(?:yaml|yml)\s*\n(?<yaml>[\s\S]*?)```/g;

export type CommandResult = {
  command: string;
  args: string[];
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type CommandRunner = (command: string, args: string[]) => Promise<CommandResult>;

export type PostMergePullRequest = {
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
    number: number | null;
    url: string;
    merged: boolean;
    baseRefName: string;
    headRefName: string;
  };
  repository: {
    expected: string;
    current: string;
  };
  roadmap: {
    id: string;
    branch: string;
  };
  carrier: {
    issue: number | null;
    expectedIssue: number | null;
  };
  contractPlan: any;
  executorGuards: Array<{ name: string; pass: boolean; reason: string }>;
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
  if (contract.roadmap?.branch && !String(contract.roadmap.branch).startsWith('zjal/')) {
    errors.push('roadmap.branch must use zjal/<roadmap-id>');
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
      number: pr.number ?? null,
      url: pr.url ?? '',
      merged: pr.merged === true,
      baseRefName: pr.baseRefName ?? '',
      headRefName: pr.headRefName ?? '',
    },
    repository: {
      expected: expectedRepo,
      current: currentRepo,
    },
    roadmap: {
      id: contract?.roadmap?.id ?? '',
      branch,
    },
    carrier: {
      issue: carrierIssue,
      expectedIssue: input.expectedCarrierIssue ?? null,
    },
    contractPlan,
    executorGuards,
    refusals,
    actions: executable ? buildExecutableActions({ branch, carrierIssue }) : [],
  };
}

export function buildPostMergeLiveRunnerEvidence(
  result: any,
  { createdAt = new Date().toISOString() }: { createdAt?: string } = {},
) {
  const executed = result?.status === 'executed';
  const evidence = buildLiveRunnerEvidence({
    runner_id: 'post-merge-cleanup',
    route_id: 'post-merge-roadmap-closeout',
    consumer_kind: 'cleanup-consumer',
    execution_mode: 'live',
    completion_form: executed ? 'cleanup-done' : 'escalation-issue',
    status: executed ? 'completed' : 'escalated',
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
        status: step.status,
        reason: step.reason,
        branch: step.branch,
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
  { runner = defaultPostMergeRunner }: { runner?: CommandRunner } = {},
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

  const branch = plan.roadmap.branch;
  const issue = plan.carrier.issue;
  const steps: any[] = [];

  await runRequired(steps, runner, 'git', ['fetch', 'origin']);
  await runRequired(steps, runner, 'git', ['switch', 'main']);
  await runRequired(steps, runner, 'git', ['merge', '--ff-only', 'origin/main']);

  const localBranchProbe = await runProbe(steps, runner, 'git', [
    'show-ref',
    '--verify',
    '--quiet',
    `refs/heads/${branch}`,
  ]);
  if (localBranchProbe.exitCode === 0) {
    const mergedBranches = await runRequired(steps, runner, 'git', ['branch', '--merged', 'main']);
    if (!branchListContains(mergedBranches.stdout, branch)) {
      throw new Error(`refusing to delete local branch ${branch}: not listed in git branch --merged main`);
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

export function buildCloseoutEvidenceComment(plan: PostMergeCloseoutPlan) {
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
    `- PR: #${plan.pr.number}`,
    `- Roadmap branch: \`${plan.roadmap.branch}\``,
    `- Carrier issue: #${plan.carrier.issue}`,
    '- Cleanup: merged roadmap branch deleted when present; carrier issue closing follows this evidence comment.',
  ].join('\n');
}

export function buildCarrierCloseComment(plan: PostMergeCloseoutPlan) {
  return [
    'Closing this Roadmap-Sliced Development activation carrier after post-merge closeout.',
    '',
    `- PR: #${plan.pr.number}`,
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
    `- PR: #${plan.pr.number}`,
    `- Status: \`${plan.status}\``,
    `- Roadmap branch: ${plan.roadmap.branch ? `\`${plan.roadmap.branch}\`` : 'not available'}`,
    `- Carrier issue: ${plan.carrier.issue ? `#${plan.carrier.issue}` : 'not available'}`,
    `- Guard summary: ${passedGuards}/${totalGuards} executor guards passed`,
    '- Side effects executed: false',
    `- Full JSON plan: workflow artifact \`${artifactName}\``,
    ...refusalLines,
    '',
    plan.status === 'dry-run'
      ? `Live cleanup command after maintainer approval: \`${command}\``
      : 'Live cleanup is not available until the refusals above are resolved.',
  ].join('\n');
}

export function buildLiveCommand(plan: PostMergeCloseoutPlan): string {
  const args = [
    'zj-loop-post-merge-closeout live-closeout',
    `--pr ${plan.pr.number}`,
    `--repo ${plan.repository.expected}`,
  ];
  if (plan.carrier.issue) args.push(`--carrier-issue ${plan.carrier.issue}`);
  args.push(`--confirm-live-cleanup ${LIVE_CLEANUP_CONFIRMATION_PHRASE}`);
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

export function normalizeGhPrView(pr: PostMergePullRequest, { expectedRepo }: { expectedRepo: string }) {
  const expectedOwner = String(expectedRepo ?? '').split('/')[0];
  const headOwner = normalizeOwner(pr.headRepositoryOwner);
  return {
    ...pr,
    merged: Boolean(pr.mergedAt),
    headRepositoryOwner: headOwner,
    baseRepositoryOwner: pr.isCrossRepository ? expectedOwner : headOwner,
  };
}

export function normalizePr(pr: PostMergePullRequest = {}) {
  return {
    ...pr,
    headRepositoryOwner: normalizeOwner(pr.headRepositoryOwner),
    baseRepositoryOwner: normalizeOwner(pr.baseRepositoryOwner),
  };
}

export function parseRepositoryFromGitRemote(remoteUrl: string): string {
  const text = String(remoteUrl ?? '').trim().replace(/\.git$/, '');
  const sshMatch = text.match(/^git@github\.com:(?<owner>[^/]+)\/(?<repo>.+)$/);
  if (sshMatch?.groups) return `${sshMatch.groups.owner}/${sshMatch.groups.repo}`;
  const httpsMatch = text.match(/^https:\/\/(?:[^@/]+@)?github\.com\/(?<owner>[^/]+)\/(?<repo>.+)$/);
  if (httpsMatch?.groups) return `${httpsMatch.groups.owner}/${httpsMatch.groups.repo}`;
  return text;
}

function buildContractGuards({ pr, contract }: { pr?: PostMergePullRequest; contract: any }) {
  const branch = contract?.roadmap?.branch;
  const head = pr?.headRefName;
  return {
    pr_merged: pr?.merged === true,
    current_roadmap_branch: Boolean(branch && head && branch === head),
    roadmap_branch_prefix: typeof branch === 'string' && branch.startsWith('zjal/'),
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
  return [
    {
      name: 'base-branch-main',
      pass: input.pr.baseRefName === 'main',
      reason: 'PR base branch must be main',
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
      pass: typeof branch === 'string' && branch.startsWith('zjal/') && !branch.includes('..'),
      reason: 'roadmap branch must be a single zjal/<roadmap-id> branch name',
    },
  ];
}

function buildExecutableActions(input: { branch: string; carrierIssue: number | null }) {
  return [
    { name: 'fetch_origin', command: ['git', 'fetch', 'origin'] },
    { name: 'switch_main', command: ['git', 'switch', 'main'] },
    { name: 'fast_forward_main', command: ['git', 'merge', '--ff-only', 'origin/main'] },
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
