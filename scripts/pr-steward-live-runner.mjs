#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import { validateIssueFixRequest } from './issue-fix-request-contract.mjs';
import {
  buildLiveRunnerEvidence,
  validateLiveRunnerEvidence,
} from './live-runner-contract.mjs';

const execFileAsync = promisify(execFile);

export const PR_STEWARD_RUNNER_ID = 'pr-steward';
export const PR_STEWARD_ROUTE_ID = 'pr-steward-fix-request';
export const PR_STEWARD_CONSUMER_KIND = 'fix-runner';
export const PR_STEWARD_CAPABILITY = 'pr-review-and-readiness-fix';
export const PR_STEWARD_CONFIRMATION_PHRASE = 'CREATE_PR_STEWARD_FIX_PR_OR_ESCALATION';

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
    return {
      command,
      args,
      exitCode: Number.isInteger(error.code) ? error.code : 1,
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? error.message,
    };
  }
}

export function validatePrStewardLiveRequest({ request, currentPrHeadSha } = {}) {
  const errors = [];
  const baseValidation = validateIssueFixRequest(request);
  if (!baseValidation.ok) errors.push(...baseValidation.errors);
  if (request?.status !== 'consumed') errors.push(`status must be consumed, got ${request?.status ?? 'missing'}`);
  if (request?.lifecycle?.consumed_by !== PR_STEWARD_RUNNER_ID) {
    errors.push(`lifecycle.consumed_by must be ${PR_STEWARD_RUNNER_ID}`);
  }
  if (request?.subject?.type !== 'pull_request') errors.push('subject.type must be pull_request');
  if (request?.subject?.base_branch !== 'main') {
    errors.push(`subject.base_branch must be main, got ${request?.subject?.base_branch ?? 'missing'}`);
  }
  if (!request?.subject?.pr_number) errors.push('subject.pr_number is required');
  if (!request?.subject?.head_sha) errors.push('subject.head_sha is required');
  if (!currentPrHeadSha) errors.push('current_pr_head_sha is required before live execution');
  if (currentPrHeadSha && request?.subject?.head_sha !== currentPrHeadSha) {
    errors.push('current_pr_head_sha must match request subject head_sha');
  }
  if (request?.source_signal?.source !== 'pull_request') errors.push('source_signal.source must be pull_request');
  if (request?.route_decision?.route_id !== PR_STEWARD_ROUTE_ID) {
    errors.push(`route_id must be ${PR_STEWARD_ROUTE_ID}`);
  }
  if (request?.route_decision?.target_consumer !== PR_STEWARD_RUNNER_ID) {
    errors.push(`target_consumer must be ${PR_STEWARD_RUNNER_ID}`);
  }
  if (request?.requested_consumer?.consumer_id !== PR_STEWARD_RUNNER_ID) {
    errors.push(`consumer must be ${PR_STEWARD_RUNNER_ID}`);
  }
  if (request?.requested_consumer?.capability !== PR_STEWARD_CAPABILITY) {
    errors.push(`capability must be ${PR_STEWARD_CAPABILITY}`);
  }
  if (!Array.isArray(request?.verification_gate?.commands) || request.verification_gate.commands.length === 0) {
    errors.push('verification gate is required before live execution');
  }
  return { ok: errors.length === 0, errors };
}

export function buildPrStewardExecutionPlan({
  request,
  currentPrHeadSha,
  repairCommands = [],
  repairFiles = [],
  live = false,
  confirmationPhrase = '',
  gitStatus = '',
  createdAt = new Date().toISOString(),
} = {}) {
  const validation = validatePrStewardLiveRequest({ request, currentPrHeadSha });
  const subject = request?.subject ?? {};
  const branch = `automated/pr-steward-pr-${subject.pr_number ?? 'unknown'}-${shortHash(request?.dedupe_key ?? '')}`;
  const parsedRepairCommands = repairCommands.map(parseCommand);
  const parsedVerificationCommands = (request?.verification_gate?.commands ?? []).map(parseCommand);
  const normalizedRepairFiles = normalizeRepairFiles(repairFiles);
  const refusals = [
    ...validation.errors.map((reason) => ({ layer: 'request', reason })),
  ];

  if (gitStatus.trim() !== '') {
    refusals.push({ layer: 'workspace', reason: 'working-tree-must-be-clean-before-live-execution' });
  }
  if (live && confirmationPhrase !== PR_STEWARD_CONFIRMATION_PHRASE) {
    refusals.push({ layer: 'operator', reason: 'fixed confirmation phrase is required for live execution' });
  }
  if (parsedRepairCommands.length > 0 && normalizedRepairFiles.length === 0) {
    refusals.push({ layer: 'repair-plan', reason: 'repair_files are required when repair_commands are provided' });
  }

  const executable = refusals.length === 0;
  const completionMode = parsedRepairCommands.length > 0 ? 'repair-pr' : 'escalation-issue';

  return {
    schemaVersion: 1,
    kind: 'zj-loop.pr-steward-live-runner-plan',
    runner_id: PR_STEWARD_RUNNER_ID,
    route_id: PR_STEWARD_ROUTE_ID,
    mode: live ? 'live' : 'dry-run',
    status: executable ? (live ? 'ready-for-live-execution' : 'dry-run') : 'refused',
    completion_mode: completionMode,
    created_at: createdAt,
    request_id: request?.request_id ?? '',
    dedupe_key: request?.dedupe_key ?? '',
    source_pr: {
      repo: subject.repo ?? '',
      pr_number: subject.pr_number ?? null,
      head_sha: subject.head_sha ?? '',
      current_head_sha: currentPrHeadSha ?? '',
      base_branch: subject.base_branch ?? '',
      source_url: request?.source_signal?.source_url ?? '',
    },
    branch,
    repair_files: normalizedRepairFiles,
    refusals,
    actions: executable
      ? buildActions({
        planMode: completionMode,
        branch,
        repairCommands: parsedRepairCommands,
        verificationCommands: parsedVerificationCommands,
        repairFiles: normalizedRepairFiles,
        request,
      })
      : [],
  };
}

export async function executePrStewardLiveRunner(plan, { runner = defaultRunner } = {}) {
  if (plan.status !== 'ready-for-live-execution') {
    return buildExecutionResult({
      plan,
      completionForm: 'escalation-issue',
      status: 'escalated',
      steps: [],
      sideEffectsExecuted: false,
      verifierEvidence: [{ name: 'plan-validation', status: 'failed', errors: plan.refusals.map((item) => item.reason) }],
      escalation: {
        reason: 'plan-not-ready-for-live-execution',
        issue_url: '',
      },
    });
  }

  const steps = [];
  for (const action of plan.actions) {
    const result = await runner(action.command, action.args);
    steps.push({ name: action.name, ...result });
    const expectedExitCodes = action.expectedExitCodes ?? [0];
    if (!expectedExitCodes.includes(result.exitCode)) {
      return buildExecutionResult({
        plan,
        completionForm: 'escalation-issue',
        status: 'escalated',
        steps,
        sideEffectsExecuted: true,
        verifierEvidence: verifierEvidenceFromSteps(steps),
        escalation: {
          reason: `${action.name} failed`,
          issue_url: action.name === 'create-escalation-issue' ? extractFirstUrl(result.stdout) : '',
        },
      });
    }
  }

  if (plan.completion_mode === 'escalation-issue') {
    const issueStep = steps.find((step) => step.name === 'create-escalation-issue');
    return buildExecutionResult({
      plan,
      completionForm: 'escalation-issue',
      status: 'escalated',
      steps,
      sideEffectsExecuted: true,
      verifierEvidence: verifierEvidenceFromSteps(steps),
      escalation: {
        reason: 'no deterministic repair plan was provided',
        issue_url: extractFirstUrl(issueStep?.stdout) || 'created-by-gh-issue-create',
      },
    });
  }

  const prStep = steps.find((step) => step.name === 'create-repair-pr');
  return buildExecutionResult({
    plan,
    completionForm: 'repair-pr',
    status: 'completed',
    steps,
    sideEffectsExecuted: true,
    verifierEvidence: verifierEvidenceFromSteps(steps),
    repairPullRequest: {
      branch: plan.branch,
      url: extractFirstUrl(prStep?.stdout) || 'created-by-gh-pr-create',
    },
  });
}

function buildActions({ planMode, branch, repairCommands, verificationCommands, repairFiles, request }) {
  if (planMode === 'escalation-issue') {
    return [{
      name: 'create-escalation-issue',
      command: 'gh',
      args: [
        'issue',
        'create',
        '--title',
        `PR Steward escalation for PR #${request?.subject?.pr_number ?? 'unknown'}`,
        '--body',
        buildEscalationIssueBody(request),
      ],
    }];
  }

  return [
    { name: 'fetch-origin', command: 'git', args: ['fetch', 'origin'] },
    { name: 'switch-main', command: 'git', args: ['switch', 'main'] },
    { name: 'sync-main', command: 'git', args: ['merge', '--ff-only', 'origin/main'] },
    { name: 'create-branch', command: 'git', args: ['switch', '-c', branch] },
    ...repairCommands.map((command, index) => ({ name: `repair-${index + 1}`, ...command })),
    ...verificationCommands.map((command, index) => ({ name: `verify-${index + 1}`, ...command })),
    {
      name: 'require-repair-diff',
      command: 'git',
      args: ['diff', '--quiet', '--', ...repairFiles],
      expectedExitCodes: [1],
    },
    { name: 'stage-repair-files', command: 'git', args: ['add', ...repairFiles] },
    {
      name: 'commit-repair',
      command: 'git',
      args: ['commit', '-m', `Create PR Steward repair for PR #${request?.subject?.pr_number ?? 'unknown'}`],
    },
    { name: 'push-branch', command: 'git', args: ['push', '-u', 'origin', branch] },
    {
      name: 'create-repair-pr',
      command: 'gh',
      args: [
        'pr',
        'create',
        '--base',
        'main',
        '--head',
        branch,
        '--title',
        `PR Steward repair for PR #${request?.subject?.pr_number ?? 'unknown'}`,
        '--body',
        buildRepairPrBody({ request, repairFiles }),
      ],
    },
  ];
}

function buildExecutionResult({
  plan,
  completionForm,
  status,
  steps,
  sideEffectsExecuted,
  verifierEvidence,
  repairPullRequest = null,
  escalation = null,
}) {
  const evidence = buildLiveRunnerEvidence({
    runner_id: PR_STEWARD_RUNNER_ID,
    route_id: PR_STEWARD_ROUTE_ID,
    consumer_kind: PR_STEWARD_CONSUMER_KIND,
    execution_mode: plan.mode,
    completion_form: completionForm,
    status,
    dedupe_key: plan.dedupe_key,
    created_at: plan.created_at,
    source: {
      kind: 'issue-fix-request',
      id: plan.request_id,
    },
    verifier_evidence: verifierEvidence,
    side_effects: {
      executed: sideEffectsExecuted,
      level: completionForm === 'repair-pr' ? 'pr' : 'issue-comment',
      actions: steps.map((step) => ({
        name: step.name,
        command: [step.command, ...(step.args ?? [])].join(' '),
        exit_code: step.exitCode,
      })),
    },
    source_pr_side_effects: {
      comment_created: false,
      label_changed: false,
      rebased: false,
      merged: false,
      workflow_dispatched: false,
    },
    repair_pull_request: repairPullRequest,
    escalation,
  });
  const validation = validateLiveRunnerEvidence(evidence);
  if (!validation.ok) {
    throw new Error(`invalid PR Steward live runner evidence: ${validation.errors.join(', ')}`);
  }
  return {
    schemaVersion: 1,
    kind: 'zj-loop.pr-steward-live-runner-result',
    outcome: completionForm,
    plan,
    steps,
    runner_evidence: evidence,
  };
}

function verifierEvidenceFromSteps(steps) {
  const verifierSteps = steps.filter((step) => step.name.startsWith('verify-'));
  if (verifierSteps.length === 0) {
    return [{ name: 'verification-gate', status: 'not-run', reason: 'repair did not reach verifier gate' }];
  }
  return verifierSteps.map((step) => ({
    name: step.name,
    command: [step.command, ...(step.args ?? [])].join(' '),
    status: step.exitCode === 0 ? 'passed' : 'failed',
    exit_code: step.exitCode,
  }));
}

function buildRepairPrBody({ request, repairFiles }) {
  return [
    '## Summary',
    '',
    `- Create an independent repair PR for source PR #${request?.subject?.pr_number ?? 'unknown'}.`,
    `- Source head SHA verified before execution: ${request?.subject?.head_sha ?? ''}.`,
    `- Source Issue Fix Request: ${request?.request_id ?? 'unknown'}.`,
    '',
    '## Repair Files',
    '',
    ...repairFiles.map((file) => `- ${file}`),
    '',
    '## Verification',
    '',
    ...(request?.verification_gate?.commands ?? []).map((command) => `- ${command}`),
    '',
    '## Safety',
    '',
    '- This runner does not comment on, label, rebase, merge, or dispatch workflows for the source PR.',
    '- Auto-merge is disabled.',
  ].join('\n');
}

function buildEscalationIssueBody(request) {
  return [
    '## Summary',
    '',
    `PR Steward could not produce a deterministic repair PR for source PR #${request?.subject?.pr_number ?? 'unknown'}.`,
    '',
    `Source PR: ${request?.source_signal?.source_url ?? ''}`,
    `Source head SHA: ${request?.subject?.head_sha ?? ''}`,
    `Issue Fix Request: ${request?.request_id ?? 'unknown'}`,
    '',
    '## Required Next Step',
    '',
    'A maintainer or bounded repair agent must provide an explicit repair plan, or resolve the source PR manually.',
  ].join('\n');
}

function parseCommand(commandText) {
  const parts = String(commandText ?? '').trim().split(/\s+/).filter(Boolean);
  return {
    command: parts[0] ?? '',
    args: parts.slice(1),
  };
}

function normalizeRepairFiles(files) {
  return [...new Set((Array.isArray(files) ? files : [])
    .map((file) => String(file).trim())
    .filter((file) => file && !file.startsWith('zj-loop/') && !file.includes('..')))];
}

function shortHash(value) {
  let hash = 0;
  for (const character of String(value)) {
    hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  }
  return Math.abs(hash).toString(36).slice(0, 8);
}

function extractFirstUrl(text) {
  return String(text ?? '').match(/https?:\/\/\S+/)?.[0] ?? '';
}

async function main() {
  const requestPath = process.argv[2];
  if (!requestPath) {
    console.error('Usage: node scripts/pr-steward-live-runner.mjs <issue-fix-request.json> [--live] --current-pr-head-sha <sha> --confirm CREATE_PR_STEWARD_FIX_PR_OR_ESCALATION');
    process.exit(2);
  }
  const request = JSON.parse(await readFile(requestPath, 'utf8'));
  const live = process.argv.includes('--live');
  const confirmIndex = process.argv.indexOf('--confirm');
  const headIndex = process.argv.indexOf('--current-pr-head-sha');
  const repairIndex = process.argv.indexOf('--repair-command');
  const filesIndex = process.argv.indexOf('--repair-files');
  const confirmationPhrase = confirmIndex >= 0 ? process.argv[confirmIndex + 1] : '';
  const currentPrHeadSha = headIndex >= 0 ? process.argv[headIndex + 1] : '';
  const repairCommands = repairIndex >= 0 ? [process.argv[repairIndex + 1]] : [];
  const repairFiles = filesIndex >= 0 ? process.argv[filesIndex + 1].split(',') : [];
  const gitStatus = (await defaultRunner('git', ['status', '--short'])).stdout;
  const plan = buildPrStewardExecutionPlan({
    request,
    currentPrHeadSha,
    repairCommands,
    repairFiles,
    live,
    confirmationPhrase,
    gitStatus,
  });
  const result = live ? await executePrStewardLiveRunner(plan) : { plan };
  console.log(JSON.stringify(result, null, 2));
  if (plan.status === 'refused') process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
