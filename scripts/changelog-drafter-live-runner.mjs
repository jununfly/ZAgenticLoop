#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import {
  buildLiveRunnerEvidence,
  validateLiveRunnerEvidence,
} from './live-runner-contract.mjs';

const execFileAsync = promisify(execFile);

export const CHANGELOG_DRAFTER_RUNNER_ID = 'changelog-drafter';
export const CHANGELOG_DRAFTER_ROUTE_ID = 'changelog-drafter-draft-request';
export const CHANGELOG_DRAFTER_CONSUMER_KIND = 'draft-consumer';
export const CHANGELOG_DRAFTER_CONFIRMATION_PHRASE = 'CREATE_CHANGELOG_DRAFT_PR_OR_EVIDENCE';
export const CHANGELOG_DRAFT_REQUEST_SCHEMA = 'zj-loop.changelog_draft_request.v1';

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

export function validateChangelogDrafterLiveRequest(draftRequest) {
  const errors = [];
  if (!draftRequest || typeof draftRequest !== 'object') {
    return { ok: false, errors: ['draft request evidence is required'] };
  }
  if (draftRequest.schema !== CHANGELOG_DRAFT_REQUEST_SCHEMA) {
    errors.push(`schema must be ${CHANGELOG_DRAFT_REQUEST_SCHEMA}`);
  }
  if (draftRequest.route_id !== CHANGELOG_DRAFTER_ROUTE_ID) {
    errors.push(`route_id must be ${CHANGELOG_DRAFTER_ROUTE_ID}`);
  }
  if (draftRequest.status !== 'draft-request-candidate') {
    errors.push(`status must be draft-request-candidate, got ${draftRequest.status ?? 'missing'}`);
  }
  if (draftRequest.human_gate?.required === true) {
    errors.push('human-gated changelog windows require human review before drafting');
  }
  const window = draftRequest.release_window ?? {};
  for (const field of ['repo', 'base_branch', 'since_ref', 'until_ref']) {
    if (!window[field]) errors.push(`release_window.${field} is required`);
  }
  if (window.base_branch && window.base_branch !== 'main') {
    errors.push(`release_window.base_branch must be main, got ${window.base_branch}`);
  }
  if (!draftRequest.dedupe_key) errors.push('dedupe_key is required');
  if (draftRequest.side_effects?.tag_created || draftRequest.side_effects?.release_created || draftRequest.side_effects?.package_published) {
    errors.push('draft request evidence must not contain publish-side side effects');
  }
  return { ok: errors.length === 0, errors };
}

export function buildChangelogDrafterExecutionPlan({
  draftRequest,
  draftMode = 'evidence',
  draftFile = 'docs/release-notes-draft.md',
  live = false,
  confirmationPhrase = '',
  gitStatus = '',
  createdAt = new Date().toISOString(),
} = {}) {
  const validation = validateChangelogDrafterLiveRequest(draftRequest);
  const normalizedDraftMode = draftMode === 'pr' ? 'pr' : 'evidence';
  const normalizedDraftFile = normalizeDraftFile(draftFile);
  const window = draftRequest?.release_window ?? {};
  const branch = `automated/changelog-drafter-${slug(window.since_ref || 'since')}-${slug(window.until_ref || 'until')}-${shortHash(draftRequest?.dedupe_key ?? '')}`;
  const refusals = [
    ...validation.errors.map((reason) => ({ layer: 'draft-request', reason })),
  ];

  if (gitStatus.trim() !== '') {
    refusals.push({ layer: 'workspace', reason: 'working-tree-must-be-clean-before-live-drafting' });
  }
  if (live && confirmationPhrase !== CHANGELOG_DRAFTER_CONFIRMATION_PHRASE) {
    refusals.push({ layer: 'operator', reason: 'fixed confirmation phrase is required for live drafting' });
  }
  if (!normalizedDraftFile) {
    refusals.push({ layer: 'draft-plan', reason: 'draftFile must be a safe repository-relative markdown path' });
  }

  const executable = refusals.length === 0;

  return {
    schemaVersion: 1,
    kind: 'zj-loop.changelog-drafter-live-runner-plan',
    runner_id: CHANGELOG_DRAFTER_RUNNER_ID,
    route_id: CHANGELOG_DRAFTER_ROUTE_ID,
    mode: live ? 'live' : 'dry-run',
    draft_mode: normalizedDraftMode,
    status: executable ? (live ? 'ready-for-live-execution' : 'dry-run') : 'refused',
    created_at: createdAt,
    request_id: draftRequest?.dedupe_key ?? '',
    dedupe_key: draftRequest?.dedupe_key ?? '',
    release_window: {
      repo: window.repo ?? '',
      base_branch: window.base_branch ?? '',
      since_ref: window.since_ref ?? '',
      until_ref: window.until_ref ?? '',
      item_count: window.item_count ?? null,
    },
    branch,
    draft_file: normalizedDraftFile,
    refusals,
    actions: executable
      ? buildActions({ draftMode: normalizedDraftMode, branch, draftFile: normalizedDraftFile, draftRequest })
      : [],
  };
}

export async function executeChangelogDrafterLiveRunner(plan, { runner = defaultRunner } = {}) {
  if (plan.status !== 'ready-for-live-execution') {
    return buildExecutionResult({
      plan,
      completionForm: 'escalation-issue',
      status: 'escalated',
      steps: [],
      sideEffectsExecuted: false,
      verifierEvidence: [{ name: 'plan-validation', status: 'failed', errors: plan.refusals.map((item) => item.reason) }],
      escalation: { reason: 'plan-not-ready-for-live-execution', issue_url: '' },
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
        escalation: { reason: `${action.name} failed`, issue_url: '' },
      });
    }
  }

  const completionForm = plan.draft_mode === 'pr' ? 'draft-pr' : 'draft-evidence';
  const prStep = steps.find((step) => step.name === 'create-draft-pr');
  return buildExecutionResult({
    plan,
    completionForm,
    status: 'completed',
    steps,
    sideEffectsExecuted: true,
    verifierEvidence: verifierEvidenceFromSteps(steps),
    draftPullRequest: completionForm === 'draft-pr'
      ? { branch: plan.branch, url: extractFirstUrl(prStep?.stdout) || 'created-by-gh-pr-create' }
      : null,
    draftEvidence: {
      file: plan.draft_file,
      release_window: plan.release_window,
    },
  });
}

function buildActions({ draftMode, branch, draftFile, draftRequest }) {
  const summary = buildDraftSummary(draftRequest);
  if (draftMode === 'evidence') {
    return [{
      name: 'write-draft-evidence',
      command: 'node',
      args: ['scripts/write-file-once.mjs', draftFile, summary],
    }];
  }
  return [
    { name: 'fetch-origin', command: 'git', args: ['fetch', 'origin'] },
    { name: 'switch-main', command: 'git', args: ['switch', 'main'] },
    { name: 'sync-main', command: 'git', args: ['merge', '--ff-only', 'origin/main'] },
    { name: 'create-branch', command: 'git', args: ['switch', '-c', branch] },
    { name: 'write-draft-evidence', command: 'node', args: ['scripts/write-file-once.mjs', draftFile, summary] },
    { name: 'require-draft-diff', command: 'git', args: ['diff', '--quiet', '--', draftFile], expectedExitCodes: [1] },
    { name: 'stage-draft-file', command: 'git', args: ['add', draftFile] },
    { name: 'commit-draft', command: 'git', args: ['commit', '-m', 'Draft changelog release notes'] },
    { name: 'push-branch', command: 'git', args: ['push', '-u', 'origin', branch] },
    {
      name: 'create-draft-pr',
      command: 'gh',
      args: [
        'pr',
        'create',
        '--base',
        'main',
        '--head',
        branch,
        '--title',
        'Draft changelog release notes',
        '--body',
        buildDraftPrBody(draftRequest),
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
  draftPullRequest = null,
  draftEvidence = null,
  escalation = null,
}) {
  const evidence = buildLiveRunnerEvidence({
    runner_id: CHANGELOG_DRAFTER_RUNNER_ID,
    route_id: CHANGELOG_DRAFTER_ROUTE_ID,
    consumer_kind: CHANGELOG_DRAFTER_CONSUMER_KIND,
    execution_mode: plan.mode,
    completion_form: completionForm,
    status,
    dedupe_key: plan.dedupe_key,
    created_at: plan.created_at,
    source: { kind: 'changelog-draft-request', id: plan.request_id },
    verifier_evidence: verifierEvidence,
    side_effects: {
      executed: sideEffectsExecuted,
      level: completionForm === 'draft-pr' ? 'draft-pr' : completionForm === 'draft-evidence' ? 'evidence' : 'issue-comment',
      actions: steps.map((step) => ({
        name: step.name,
        command: [step.command, ...(step.args ?? [])].join(' '),
        exit_code: step.exitCode,
      })),
    },
    release_side_effects: {
      tag_created: false,
      release_created: false,
      package_published: false,
      final_changelog_acceptance: false,
    },
    draft_pull_request: draftPullRequest,
    draft_evidence: draftEvidence,
    escalation,
  });
  const validation = validateLiveRunnerEvidence(evidence);
  if (!validation.ok) {
    throw new Error(`invalid Changelog Drafter live runner evidence: ${validation.errors.join(', ')}`);
  }
  return {
    schemaVersion: 1,
    kind: 'zj-loop.changelog-drafter-live-runner-result',
    outcome: completionForm,
    plan,
    steps,
    runner_evidence: evidence,
  };
}

function buildDraftSummary(draftRequest) {
  const window = draftRequest?.release_window ?? {};
  return [
    '# Release Notes Draft',
    '',
    `Window: ${window.since_ref ?? ''}...${window.until_ref ?? ''}`,
    `Repository: ${window.repo ?? ''}`,
    `Base branch: ${window.base_branch ?? ''}`,
    `Item count: ${window.item_count ?? 'unknown'}`,
    '',
    '## Candidate Summary',
    '',
    draftRequest?.summary ?? 'Review merged changes and draft release notes.',
    '',
    '## Human Review Required',
    '',
    'A maintainer must review and accept final release notes before tagging, releasing, or publishing.',
    '',
  ].join('\n');
}

function buildDraftPrBody(draftRequest) {
  const window = draftRequest?.release_window ?? {};
  return [
    '## Summary',
    '',
    `- Draft release notes for ${window.since_ref ?? ''}...${window.until_ref ?? ''}.`,
    `- Source draft request: ${draftRequest?.dedupe_key ?? ''}.`,
    '',
    '## Safety',
    '',
    '- This PR is a draft artifact only.',
    '- It does not tag, release, publish packages, or finalize changelog acceptance.',
  ].join('\n');
}

function verifierEvidenceFromSteps(steps) {
  if (steps.length === 0) {
    return [{ name: 'runner-steps', status: 'not-run', reason: 'runner did not execute side effects' }];
  }
  return steps.map((step) => ({
    name: step.name,
    command: [step.command, ...(step.args ?? [])].join(' '),
    status: step.exitCode === 0 ? 'passed' : 'failed',
    exit_code: step.exitCode,
  }));
}

function normalizeDraftFile(file) {
  const value = String(file ?? '').trim();
  if (!value || value.startsWith('/') || value.includes('..') || !value.endsWith('.md')) return '';
  if (value.startsWith('zj-loop/')) return '';
  return value;
}

function slug(value) {
  return String(value)
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
    console.error('Usage: node scripts/changelog-drafter-live-runner.mjs <draft-request.json> [--live] [--draft-mode evidence|pr] --confirm CREATE_CHANGELOG_DRAFT_PR_OR_EVIDENCE');
    process.exit(2);
  }
  const draftRequest = JSON.parse(await readFile(requestPath, 'utf8'));
  const live = process.argv.includes('--live');
  const confirmIndex = process.argv.indexOf('--confirm');
  const modeIndex = process.argv.indexOf('--draft-mode');
  const fileIndex = process.argv.indexOf('--draft-file');
  const confirmationPhrase = confirmIndex >= 0 ? process.argv[confirmIndex + 1] : '';
  const draftMode = modeIndex >= 0 ? process.argv[modeIndex + 1] : 'evidence';
  const draftFile = fileIndex >= 0 ? process.argv[fileIndex + 1] : 'docs/release-notes-draft.md';
  const gitStatus = (await defaultRunner('git', ['status', '--short'])).stdout;
  const plan = buildChangelogDrafterExecutionPlan({
    draftRequest,
    draftMode,
    draftFile,
    live,
    confirmationPhrase,
    gitStatus,
  });
  const result = live ? await executeChangelogDrafterLiveRunner(plan) : { plan };
  console.log(JSON.stringify(result, null, 2));
  if (plan.status === 'refused') process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
