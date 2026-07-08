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

export const DEPENDENCY_SWEEPER_RUNNER_ID = 'dependency-sweeper';
export const DEPENDENCY_SWEEPER_ROUTE_ID = 'dependency-sweeper';
export const DEPENDENCY_SWEEPER_CONSUMER_KIND = 'fix-runner';
export const DEPENDENCY_SWEEPER_CONFIRMATION_PHRASE = 'CREATE_DEPENDENCY_SWEEPER_FIX_PR';

const ALLOWED_CAPABILITIES = new Set(['patch-dependency-fix', 'minor-dependency-fix']);
const ALLOWED_UPDATE_TYPES = new Set(['patch', 'minor']);
const ALLOWED_RISKS = new Set(['low', 'medium']);
const ALLOWED_DEPENDENCY_SECTIONS = new Set([
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
]);

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

export function validateDependencySweeperLiveRequest(request) {
  const errors = [];
  const baseValidation = validateIssueFixRequest(request);
  if (!baseValidation.ok) errors.push(...baseValidation.errors);
  if (request?.status !== 'consumed') errors.push(`status must be consumed, got ${request?.status ?? 'missing'}`);
  if (request?.lifecycle?.consumed_by !== DEPENDENCY_SWEEPER_RUNNER_ID) {
    errors.push(`lifecycle.consumed_by must be ${DEPENDENCY_SWEEPER_RUNNER_ID}`);
  }
  if (request?.requested_consumer?.consumer_id !== DEPENDENCY_SWEEPER_RUNNER_ID) {
    errors.push(`consumer must be ${DEPENDENCY_SWEEPER_RUNNER_ID}`);
  }
  if (!ALLOWED_CAPABILITIES.has(request?.requested_consumer?.capability)) {
    errors.push(`unsupported capability ${request?.requested_consumer?.capability ?? 'missing'}`);
  }
  if (request?.route_decision?.route_id !== DEPENDENCY_SWEEPER_ROUTE_ID) {
    errors.push(`route_id must be ${DEPENDENCY_SWEEPER_ROUTE_ID}`);
  }
  if (!ALLOWED_RISKS.has(request?.route_decision?.risk)) {
    errors.push(`risk must be low or medium, got ${request?.route_decision?.risk ?? 'missing'}`);
  }
  if (!Array.isArray(request?.verification_gate?.commands) || request.verification_gate.commands.length === 0) {
    errors.push('verification gate is required before live repair');
  }

  const subject = request?.subject ?? {};
  if (subject.type !== 'dependency') errors.push(`subject.type must be dependency, got ${subject.type ?? 'missing'}`);
  if (subject.ecosystem !== 'npm') errors.push(`only npm dependency repairs are supported, got ${subject.ecosystem ?? 'missing'}`);
  if (!subject.package_name) errors.push('subject.package_name is required');
  if (!subject.target_version) errors.push('subject.target_version is required');
  if (!ALLOWED_UPDATE_TYPES.has(subject.update_type)) {
    errors.push(`subject.update_type must be patch or minor, got ${subject.update_type ?? 'missing'}`);
  }
  if (!ALLOWED_DEPENDENCY_SECTIONS.has(subject.dependency_section)) {
    errors.push(`subject.dependency_section must be explicit, got ${subject.dependency_section ?? 'missing'}`);
  }

  return { ok: errors.length === 0, errors };
}

export function buildDependencySweeperExecutionPlan({
  request,
  live = false,
  confirmationPhrase = '',
  gitStatus = '',
  createdAt = new Date().toISOString(),
} = {}) {
  const validation = validateDependencySweeperLiveRequest(request);
  const subject = request?.subject ?? {};
  const safePackage = slug(subject.package_name || 'unknown-package');
  const safeVersion = slug(subject.target_version || 'unknown-version');
  const branch = `automated/dependency-sweeper-${safePackage}-${safeVersion}-${shortHash(request?.dedupe_key ?? '')}`;
  const updateCommand = ['npm', npmInstallArgs(subject)];
  const verificationCommands = (request?.verification_gate?.commands ?? []).map(parseCommand);
  const refusals = [
    ...validation.errors.map((reason) => ({ layer: 'request', reason })),
  ];

  if (gitStatus.trim() !== '') {
    refusals.push({ layer: 'workspace', reason: 'working-tree-must-be-clean-before-live-repair' });
  }
  if (live && confirmationPhrase !== DEPENDENCY_SWEEPER_CONFIRMATION_PHRASE) {
    refusals.push({ layer: 'operator', reason: 'fixed confirmation phrase is required for live repair' });
  }

  const executable = refusals.length === 0;

  return {
    schemaVersion: 1,
    kind: 'zj-loop.dependency-sweeper-live-runner-plan',
    runner_id: DEPENDENCY_SWEEPER_RUNNER_ID,
    route_id: DEPENDENCY_SWEEPER_ROUTE_ID,
    mode: live ? 'live' : 'dry-run',
    status: executable ? (live ? 'ready-for-live-execution' : 'dry-run') : 'refused',
    created_at: createdAt,
    request_id: request?.request_id ?? '',
    dedupe_key: request?.dedupe_key ?? '',
    subject: {
      ecosystem: subject.ecosystem ?? '',
      package_name: subject.package_name ?? '',
      current_version: subject.current_version ?? '',
      target_version: subject.target_version ?? '',
      update_type: subject.update_type ?? '',
      dependency_section: subject.dependency_section ?? '',
      manifest_files: subject.manifest_files ?? [],
    },
    branch,
    refusals,
    actions: executable
      ? [
        { name: 'create-branch', command: 'git', args: ['switch', '-c', branch] },
        { name: 'update-dependency', command: updateCommand[0], args: updateCommand[1] },
        ...verificationCommands.map((command, index) => ({ name: `verify-${index + 1}`, ...command })),
        {
          name: 'require-dependency-diff',
          command: 'git',
          args: ['diff', '--quiet', '--', ...manifestFiles(subject)],
          expectedExitCodes: [1],
        },
        { name: 'stage-files', command: 'git', args: ['add', ...manifestFiles(subject)] },
        {
          name: 'commit-repair',
          command: 'git',
          args: ['commit', '-m', `Update ${subject.package_name} to ${subject.target_version}`],
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
            `Update ${subject.package_name} to ${subject.target_version}`,
            '--body',
            buildRepairPrBody({ request, subject }),
          ],
        },
      ]
      : [],
  };
}

export async function executeDependencySweeperLiveRunner(plan, { runner = defaultRunner } = {}) {
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
          issue_url: '',
        },
      });
    }
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
  const sideEffectActions = steps.map((step) => ({
    name: step.name,
    command: [step.command, ...(step.args ?? [])].join(' '),
    exit_code: step.exitCode,
  }));
  const evidence = buildLiveRunnerEvidence({
    runner_id: DEPENDENCY_SWEEPER_RUNNER_ID,
    route_id: DEPENDENCY_SWEEPER_ROUTE_ID,
    consumer_kind: DEPENDENCY_SWEEPER_CONSUMER_KIND,
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
      level: completionForm === 'repair-pr' ? 'pr' : 'evidence',
      actions: sideEffectActions,
    },
    repair_pull_request: repairPullRequest,
    escalation,
  });
  const validation = validateLiveRunnerEvidence(evidence);
  if (!validation.ok) {
    throw new Error(`invalid dependency sweeper live runner evidence: ${validation.errors.join(', ')}`);
  }
  return {
    schemaVersion: 1,
    kind: 'zj-loop.dependency-sweeper-live-runner-result',
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

function parseCommand(commandText) {
  const parts = String(commandText ?? '').trim().split(/\s+/).filter(Boolean);
  return {
    command: parts[0] ?? '',
    args: parts.slice(1),
  };
}

function manifestFiles(subject) {
  const files = Array.isArray(subject.manifest_files) ? subject.manifest_files : [];
  const selected = files.filter((file) => file === 'package.json' || file.endsWith('/package.json') || file.endsWith('package-lock.json') || file === 'package-lock.json');
  return selected.length > 0 ? selected : ['package.json', 'package-lock.json'];
}

function buildRepairPrBody({ request, subject }) {
  return [
    '## Summary',
    '',
    `- Update ${subject.package_name} from ${subject.current_version || 'current'} to ${subject.target_version}.`,
    `- Preserve dependency section: ${subject.dependency_section}.`,
    `- Source Issue Fix Request: ${request?.request_id ?? 'unknown'}.`,
    '',
    '## Verification',
    '',
    ...(request?.verification_gate?.commands ?? []).map((command) => `- ${command}`),
    '',
    '## Safety',
    '',
    '- Auto-merge is disabled.',
    '- Major, high-risk, critical CVE, and denylisted package changes remain human-gated.',
  ].join('\n');
}

function npmInstallArgs(subject) {
  const sectionFlags = {
    dependencies: ['--save-prod'],
    devDependencies: ['--save-dev'],
    optionalDependencies: ['--save-optional'],
    peerDependencies: ['--save-peer'],
  };
  return [
    'install',
    `${subject.package_name}@${subject.target_version}`,
    '--save-exact',
    ...(sectionFlags[subject.dependency_section] ?? []),
  ];
}

function slug(value) {
  return String(value)
    .replace(/^@/, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'unknown';
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
    console.error('Usage: node scripts/dependency-sweeper-live-runner.mjs <issue-fix-request.json> [--live] --confirm CREATE_DEPENDENCY_SWEEPER_FIX_PR');
    process.exit(2);
  }
  const request = JSON.parse(await readFile(requestPath, 'utf8'));
  const live = process.argv.includes('--live');
  const confirmIndex = process.argv.indexOf('--confirm');
  const confirmationPhrase = confirmIndex >= 0 ? process.argv[confirmIndex + 1] : '';
  const gitStatus = (await defaultRunner('git', ['status', '--short'])).stdout;
  const plan = buildDependencySweeperExecutionPlan({ request, live, confirmationPhrase, gitStatus });
  const result = live
    ? await executeDependencySweeperLiveRunner(plan)
    : { plan };
  console.log(JSON.stringify(result, null, 2));
  if (plan.status === 'refused') process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
