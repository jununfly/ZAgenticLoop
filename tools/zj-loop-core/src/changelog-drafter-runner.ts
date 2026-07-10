import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

import {
  buildLiveRunnerEvidence,
  validateLiveRunnerEvidence,
} from './live-runner-contract.js';

const execFileAsync = promisify(execFile);

export const CHANGELOG_DRAFTER_RUNNER_ID = 'changelog-drafter';
export const CHANGELOG_DRAFTER_ROUTE_ID = 'changelog-drafter-draft-request';
export const CHANGELOG_DRAFTER_CONSUMER_KIND = 'draft-consumer';
export const CHANGELOG_DRAFTER_CONFIRMATION_PHRASE = 'CREATE_CHANGELOG_DRAFT_PR_OR_EVIDENCE';
export const CHANGELOG_DRAFT_REQUEST_SCHEMA = 'zj-loop.changelog_draft_request.v1';

export async function defaultChangelogDrafterRunner(command: string, args: string[] = []) {
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
    return {
      command,
      args,
      exitCode: Number.isInteger(err.code) ? Number(err.code) : 1,
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? err.message ?? '',
    };
  }
}

export async function readChangelogDraftRequest(path: string) {
  return JSON.parse(await readFile(path, 'utf8'));
}

export function validateChangelogDrafterLiveRequest(draftRequest: any) {
  const errors: string[] = [];
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

export function buildChangelogDrafterExecutionPlan(input: {
  draftRequest?: any;
  draftMode?: string;
  draftFile?: string;
  live?: boolean;
  confirmationPhrase?: string;
  gitStatus?: string;
  createdAt?: string;
} = {}) {
  const validation = validateChangelogDrafterLiveRequest(input.draftRequest);
  const normalizedDraftMode = input.draftMode === 'pr' ? 'pr' : 'evidence';
  const normalizedDraftFile = normalizeDraftFile(input.draftFile ?? 'docs/release-notes-draft.md');
  const window = input.draftRequest?.release_window ?? {};
  const provider = providerForDraftRequest(input.draftRequest);
  const branch = `automated/changelog-drafter-${slug(window.since_ref || 'since')}-${slug(window.until_ref || 'until')}-${shortHash(input.draftRequest?.dedupe_key ?? '')}`;
  const refusals = [
    ...validation.errors.map((reason) => ({ layer: 'draft-request', reason })),
  ];

  if (String(input.gitStatus ?? '').trim() !== '') {
    refusals.push({ layer: 'workspace', reason: 'working-tree-must-be-clean-before-live-drafting' });
  }
  if (input.live && input.confirmationPhrase !== CHANGELOG_DRAFTER_CONFIRMATION_PHRASE) {
    refusals.push({ layer: 'operator', reason: 'fixed confirmation phrase is required for live drafting' });
  }
  if (!normalizedDraftFile) {
    refusals.push({ layer: 'draft-plan', reason: 'draftFile must be a safe repository-relative markdown path' });
  }
  if (input.live && normalizedDraftMode === 'pr' && provider === 'gitlab') {
    refusals.push({ layer: 'provider', reason: 'gitlab-live-draft-mr-side-effects-not-enabled' });
  }

  const executable = refusals.length === 0;

  return {
    schemaVersion: 1,
    kind: 'zj-loop.changelog-drafter-live-runner-plan',
    runner_id: CHANGELOG_DRAFTER_RUNNER_ID,
    route_id: CHANGELOG_DRAFTER_ROUTE_ID,
    mode: input.live ? 'live' : 'dry-run',
    draft_mode: normalizedDraftMode,
    status: executable ? (input.live ? 'ready-for-live-execution' : 'dry-run') : 'refused',
    created_at: input.createdAt ?? new Date().toISOString(),
    request_id: input.draftRequest?.dedupe_key ?? '',
    dedupe_key: input.draftRequest?.dedupe_key ?? '',
    release_window: {
      provider,
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
      ? buildActions({ draftMode: normalizedDraftMode, branch, draftFile: normalizedDraftFile, draftRequest: input.draftRequest })
      : [],
  };
}

export async function executeChangelogDrafterLiveRunner(
  plan: any,
  { runner = defaultChangelogDrafterRunner }: { runner?: (command: string, args: string[]) => Promise<any> } = {},
) {
  if (plan.status !== 'ready-for-live-execution') {
    return buildExecutionResult({
      plan,
      completionForm: 'escalation-issue',
      status: 'escalated',
      steps: [],
      sideEffectsExecuted: false,
      verifierEvidence: [{ name: 'plan-validation', status: 'failed', errors: plan.refusals.map((item: any) => item.reason) }],
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

function buildActions(input: { draftMode: string; branch: string; draftFile: string; draftRequest: any }) {
  const summary = buildDraftSummary(input.draftRequest);
  if (input.draftMode === 'evidence') {
    return [{
      name: 'write-draft-evidence',
      command: 'node',
      args: ['scripts/write-file-once.mjs', input.draftFile, summary],
    }];
  }
  return [
    { name: 'fetch-origin', command: 'git', args: ['fetch', 'origin'] },
    { name: 'switch-main', command: 'git', args: ['switch', 'main'] },
    { name: 'sync-main', command: 'git', args: ['merge', '--ff-only', 'origin/main'] },
    { name: 'create-branch', command: 'git', args: ['switch', '-c', input.branch] },
    { name: 'write-draft-evidence', command: 'node', args: ['scripts/write-file-once.mjs', input.draftFile, summary] },
    { name: 'require-draft-diff', command: 'git', args: ['diff', '--quiet', '--', input.draftFile], expectedExitCodes: [1] },
    { name: 'stage-draft-file', command: 'git', args: ['add', input.draftFile] },
    { name: 'commit-draft', command: 'git', args: ['commit', '-m', 'Draft changelog release notes'] },
    { name: 'push-branch', command: 'git', args: ['push', '-u', 'origin', input.branch] },
    {
      name: 'create-draft-pr',
      command: 'gh',
      args: [
        'pr',
        'create',
        '--base',
        'main',
        '--head',
        input.branch,
        '--title',
        'Draft changelog release notes',
        '--body',
        buildDraftPrBody(input.draftRequest),
      ],
    },
  ];
}

function buildExecutionResult(input: {
  plan: any;
  completionForm: string;
  status: string;
  steps: any[];
  sideEffectsExecuted: boolean;
  verifierEvidence: any[];
  draftPullRequest?: any;
  draftEvidence?: any;
  escalation?: any;
}) {
  const evidence = buildLiveRunnerEvidence({
    runner_id: CHANGELOG_DRAFTER_RUNNER_ID,
    route_id: CHANGELOG_DRAFTER_ROUTE_ID,
    consumer_kind: CHANGELOG_DRAFTER_CONSUMER_KIND,
    execution_mode: input.plan.mode,
    completion_form: input.completionForm,
    status: input.status,
    dedupe_key: input.plan.dedupe_key,
    created_at: input.plan.created_at,
    source: { kind: 'changelog-draft-request', id: input.plan.request_id },
    verifier_evidence: input.verifierEvidence,
    side_effects: {
      executed: input.sideEffectsExecuted,
      level: input.completionForm === 'draft-pr' ? 'draft-pr' : input.completionForm === 'draft-evidence' ? 'evidence' : 'issue-comment',
      actions: input.steps.map((step) => ({
        name: step.name,
        command: [step.command, ...(step.args ?? [])].join(' '),
        exit_code: step.exitCode,
      })),
    },
    release_side_effects: {
      tag_created: false,
      release_created: false,
      package_published: false,
      final_changelog_accepted: false,
    },
    draft_pull_request: input.draftPullRequest ?? null,
    draft_evidence: input.draftEvidence ?? null,
    escalation: input.escalation ?? null,
  });
  const validation = validateLiveRunnerEvidence(evidence);
  if (!validation.ok) {
    throw new Error(`invalid Changelog Drafter live runner evidence: ${validation.errors.join(', ')}`);
  }
  return {
    schemaVersion: 1,
    kind: 'zj-loop.changelog-drafter-live-runner-result',
    outcome: input.completionForm,
    plan: input.plan,
    steps: input.steps,
    runner_evidence: evidence,
  };
}

function buildDraftSummary(draftRequest: any) {
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

function buildDraftPrBody(draftRequest: any) {
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

function verifierEvidenceFromSteps(steps: any[]) {
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

function normalizeDraftFile(file: string) {
  const value = String(file ?? '').trim();
  if (!value || value.startsWith('/') || value.includes('..') || !value.endsWith('.md')) return '';
  if (value.startsWith('zj-loop/')) return '';
  return value;
}

function slug(value: string) {
  return String(value)
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'unknown';
}

function shortHash(value: string) {
  let hash = 0;
  for (const character of String(value)) {
    hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  }
  return Math.abs(hash).toString(36).slice(0, 8);
}

function extractFirstUrl(text: string) {
  return String(text ?? '').match(/https?:\/\/\S+/)?.[0] ?? '';
}

function providerForDraftRequest(draftRequest: any): 'github' | 'gitlab' {
  const provider = draftRequest?.release_window?.provider ?? draftRequest?.provider;
  return provider === 'gitlab' ? 'gitlab' : 'github';
}
