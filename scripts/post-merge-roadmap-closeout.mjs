#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import {
  buildRoadmapCloseoutPlan,
  parsePostMergeContractFromPrBody,
} from './post-merge-roadmap-closeout-contract.mjs';

const execFileAsync = promisify(execFile);

export const CLOSEOUT_EXECUTOR_KIND = 'zj-loop.post-merge-roadmap-closeout-executor';
export const CLOSEOUT_EXECUTOR_VERSION = 1;
export const LIVE_CLEANUP_CONFIRMATION_PHRASE = 'DELETE_MERGED_ROADMAP_BRANCH_AND_CLOSE_CARRIER';

export async function defaultRunner(command, args = [], options = {}) {
  try {
    const result = await execFileAsync(command, args, {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 10,
      ...options.execFileOptions,
    });
    return {
      command,
      args,
      exitCode: 0,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
    };
  } catch (error) {
    const exitCode = Number.isInteger(error.code) ? error.code : 1;
    return {
      command,
      args,
      exitCode,
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? error.message,
    };
  }
}

export function buildPostMergeRoadmapCloseoutExecutionPlan(input) {
  const pr = normalizePr(input.pr);
  const contractResult = parsePostMergeContractFromPrBody(input.prBody ?? pr.body ?? '');
  const contractPlan = buildRoadmapCloseoutPlan({ pr, contractResult });
  const contract = contractResult.contract;
  const branch = contract?.roadmap?.branch ?? '';
  const carrierIssue = contract?.carrier?.issue ?? null;
  const expectedRepo = input.expectedRepo ?? pr.baseRepository ?? pr.repository ?? '';
  const currentRepo = input.currentRepo ?? '';
  const expectedCarrierIssue = input.expectedCarrierIssue;
  const executorGuards = buildExecutorGuards({
    pr,
    contract,
    currentRepo,
    expectedRepo,
    gitStatus: input.gitStatus,
    expectedCarrierIssue,
  });
  const refusals = [
    ...contractPlan.validation.errors.map((reason) => ({ layer: 'contract', reason })),
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
      expectedIssue: expectedCarrierIssue ?? null,
    },
    contractPlan,
    executorGuards,
    refusals,
    actions: executable ? buildExecutableActions({ branch, carrierIssue }) : [],
  };
}

export async function executePostMergeRoadmapCloseout(plan, { runner = defaultRunner } = {}) {
  if (plan.status !== 'ready-for-live-execution') {
    return {
      ...plan,
      execution: {
        status: 'refused',
        reason: 'plan-not-ready-for-live-execution',
        steps: [],
      },
      side_effects_executed: false,
    };
  }

  const branch = plan.roadmap.branch;
  const issue = plan.carrier.issue;
  const steps = [];

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

  return {
    ...plan,
    status: 'executed',
    side_effects_executed: true,
    execution: {
      status: 'executed',
      steps,
    },
  };
}

export function buildDryRunEvidenceComment(plan, {
  artifactName = 'post-merge-roadmap-closeout-plan',
  liveCommand,
} = {}) {
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

export function buildCloseoutEvidenceComment(plan) {
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

export function buildCarrierCloseComment(plan) {
  return [
    'Closing this Roadmap-Sliced Development activation carrier after post-merge closeout.',
    '',
    `- PR: #${plan.pr.number}`,
    `- Roadmap branch: \`${plan.roadmap.branch}\``,
    '- Contract guard: valid `zj-loop.post-merge-contract` with `no_pending_followups: true`.',
  ].join('\n');
}

export function buildLiveCommand(plan) {
  const args = [
    'npm run post-merge-closeout --',
    `--pr ${plan.pr.number}`,
    `--repo ${plan.repository.expected}`,
  ];
  if (plan.carrier.issue) {
    args.push(`--carrier-issue ${plan.carrier.issue}`);
  }
  args.push('--live');
  return args.join(' ');
}

export async function collectCloseoutInputFromGitHub({
  prNumber,
  expectedRepo,
  runner = defaultRunner,
}) {
  const prResult = await runRequired([], runner, 'gh', [
    'pr',
    'view',
    String(prNumber),
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
    pr: normalizeGhPrView(pr, { expectedRepo }),
    prBody: pr.body,
    expectedRepo,
    currentRepo: parseRepositoryFromGitRemote(currentRepoResult.stdout.trim()),
    gitStatus: gitStatusResult.stdout,
  };
}

export function normalizeGhPrView(pr, { expectedRepo }) {
  const expectedOwner = String(expectedRepo ?? '').split('/')[0];
  const headOwner = normalizeOwner(pr.headRepositoryOwner);
  return {
    ...pr,
    merged: Boolean(pr.mergedAt),
    headRepositoryOwner: headOwner,
    baseRepositoryOwner: pr.isCrossRepository ? expectedOwner : headOwner,
  };
}

export function normalizePr(pr = {}) {
  return {
    ...pr,
    headRepositoryOwner: normalizeOwner(pr.headRepositoryOwner),
    baseRepositoryOwner: normalizeOwner(pr.baseRepositoryOwner),
  };
}

export function parseRepositoryFromGitRemote(remoteUrl) {
  const text = String(remoteUrl ?? '').trim().replace(/\.git$/, '');
  const sshMatch = text.match(/^git@github\.com:(?<owner>[^/]+)\/(?<repo>.+)$/);
  if (sshMatch) return `${sshMatch.groups.owner}/${sshMatch.groups.repo}`;
  const httpsMatch = text.match(/^https:\/\/(?:[^@/]+@)?github\.com\/(?<owner>[^/]+)\/(?<repo>.+)$/);
  if (httpsMatch) return `${httpsMatch.groups.owner}/${httpsMatch.groups.repo}`;
  return text;
}

function buildExecutorGuards({ pr, contract, currentRepo, expectedRepo, gitStatus, expectedCarrierIssue }) {
  const branch = contract?.roadmap?.branch;
  const carrierIssue = contract?.carrier?.issue;
  return [
    {
      name: 'base-branch-main',
      pass: pr.baseRefName === 'main',
      reason: 'PR base branch must be main',
    },
    {
      name: 'current-repository',
      pass: Boolean(expectedRepo && currentRepo && expectedRepo === currentRepo),
      reason: 'current repository must match expected repository',
    },
    {
      name: 'clean-worktree',
      pass: String(gitStatus ?? '').trim() === '',
      reason: 'local worktree must be clean before live closeout',
    },
    {
      name: 'expected-carrier-issue',
      pass: expectedCarrierIssue === undefined || Number(expectedCarrierIssue) === Number(carrierIssue),
      reason: 'contract carrier issue must match expected activation carrier issue',
    },
    {
      name: 'single-roadmap-branch',
      pass: typeof branch === 'string' && branch.startsWith('zjal/') && !branch.includes('..'),
      reason: 'roadmap branch must be a single zjal/<roadmap-id> branch name',
    },
  ];
}

function buildExecutableActions({ branch, carrierIssue }) {
  return [
    { name: 'fetch_origin', command: ['git', 'fetch', 'origin'] },
    { name: 'switch_main', command: ['git', 'switch', 'main'] },
    { name: 'fast_forward_main', command: ['git', 'merge', '--ff-only', 'origin/main'] },
    { name: 'delete_local_branch_if_present_and_merged', branch },
    { name: 'delete_remote_branch_if_present', branch },
    { name: 'comment_carrier_issue', issue: carrierIssue },
    { name: 'close_carrier_issue', issue: carrierIssue },
  ];
}

async function runRequired(steps, runner, command, args) {
  const result = await runner(command, args);
  steps.push({ name: commandStepName(command, args), status: result.exitCode === 0 ? 'ok' : 'failed', command, args });
  if (result.exitCode !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit ${result.exitCode}: ${result.stderr}`);
  }
  return result;
}

async function runProbe(steps, runner, command, args) {
  const result = await runner(command, args);
  steps.push({ name: commandStepName(command, args), status: result.exitCode === 0 ? 'present' : 'absent', command, args });
  if (![0, 1, 2].includes(result.exitCode)) {
    throw new Error(`${command} ${args.join(' ')} probe failed with exit ${result.exitCode}: ${result.stderr}`);
  }
  return result;
}

function commandStepName(command, args) {
  return [command, ...args.slice(0, 2)].join(' ');
}

function branchListContains(stdout, branch) {
  return String(stdout ?? '')
    .split('\n')
    .map((line) => line.replace(/^\*\s*/, '').trim())
    .includes(branch);
}

function normalizeOwner(owner) {
  if (typeof owner === 'string') return owner;
  if (owner && typeof owner.login === 'string') return owner.login;
  return owner;
}

function parseArgs(argv) {
  const args = { live: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--live') {
      args.live = true;
    } else if (arg === '--pr') {
      args.prNumber = argv[++index];
    } else if (arg === '--repo') {
      args.expectedRepo = argv[++index];
    } else if (arg === '--carrier-issue') {
      args.expectedCarrierIssue = Number(argv[++index]);
    } else if (arg === '--out') {
      args.out = argv[++index];
    } else if (arg === '--comment-out') {
      args.commentOut = argv[++index];
    } else if (arg === '--artifact-name') {
      args.artifactName = argv[++index];
    } else if (arg === '--confirm-live-cleanup') {
      args.confirmLiveCleanup = argv[++index];
    } else if (arg === '--require-live-confirmation') {
      args.requireLiveConfirmation = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (!args.prNumber) throw new Error('--pr is required');
  args.expectedRepo = args.expectedRepo ?? process.env.GITHUB_REPOSITORY;
  if (!args.expectedRepo) throw new Error('--repo is required');
  if (
    args.live &&
    args.requireLiveConfirmation &&
    args.confirmLiveCleanup !== LIVE_CLEANUP_CONFIRMATION_PHRASE
  ) {
    throw new Error(`--confirm-live-cleanup must equal ${LIVE_CLEANUP_CONFIRMATION_PHRASE}`);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const input = await collectCloseoutInputFromGitHub(args);
  const plan = buildPostMergeRoadmapCloseoutExecutionPlan({
    ...input,
    expectedCarrierIssue: args.expectedCarrierIssue,
    live: args.live,
  });
  const result = args.live
    ? await executePostMergeRoadmapCloseout(plan)
    : plan;
  if (args.out) {
    await writeFile(args.out, `${JSON.stringify(result, null, 2)}\n`);
  }
  if (args.commentOut) {
    const comment = args.live
      ? buildCloseoutEvidenceComment(result)
      : buildDryRunEvidenceComment(result, { artifactName: args.artifactName });
    await writeFile(args.commentOut, comment);
  }
  console.log(JSON.stringify(result, null, 2));
  if (args.live && (result.status === 'refused' || result.execution?.status === 'refused')) {
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
