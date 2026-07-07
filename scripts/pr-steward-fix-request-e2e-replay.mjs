#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { buildIssueFixRequestComment } from './issue-fix-request-contract.mjs';
import { dispatchSignalToIssueFixRequest } from './issue-fix-request-dispatcher.mjs';

const DEFAULT_ROUTE_TABLE = 'zj-loop/zj-loop-route-table.yaml';
const ROUTE_ID = 'pr-steward-fix-request';
const VERIFIER_COMMANDS = [
  'npm run test:pr-steward-report',
  'npm run test:issue-fix-request',
  'npm run test:route-decision',
  'git diff --check',
];

const BASE_SIGNAL = {
  source: 'pull_request',
  repo: 'jununfly/ZAgenticLoop',
  pr_number: 42,
  head_sha: 'abc123def456',
  base_branch: 'main',
  head_branch: 'feature/pr-red',
  draft: false,
  checks: 'failure',
  check_source: 'github_status_check_rollup',
  priority: 'P1',
  state: 'none',
  risk: 'medium',
  confidence: 'high',
  evidence: ['https://github.com/jununfly/ZAgenticLoop/pull/42'],
  summary: 'PR #42 has failing GitHub status checks after synchronize.',
  source_url: 'https://github.com/jununfly/ZAgenticLoop/pull/42',
  verification_commands: VERIFIER_COMMANDS,
  fix_scope: {
    files_or_areas: ['pull-request-checks'],
    non_goals: ['edit source PR', 'comment on source PR', 'label source PR', 'rebase source PR', 'merge source PR'],
  },
  acceptance_criteria: [
    'Create or dedupe an independent Issue Fix Request for the failing PR head SHA.',
    'Do not claim the request, edit the PR, comment on the PR, label, rebase, merge, or dispatch workflows.',
  ],
};

export const DEFAULT_PR_STEWARD_FIX_REQUEST_SCENARIOS = [
  {
    name: 'synchronize-failing-checks',
    expectOutcome: 'create-request',
    signal: buildPrSignal({
      ...BASE_SIGNAL,
      action: 'synchronize',
      signal_id: 'pr:42:head:abc123def456:checks:failure',
    }),
  },
  {
    name: 'ready-for-review-failing-checks',
    expectOutcome: 'create-request',
    signal: buildPrSignal({
      ...BASE_SIGNAL,
      pr_number: 43,
      head_sha: 'def456abc123',
      action: 'ready_for_review',
      signal_id: 'pr:43:head:def456abc123:checks:failure',
      source_url: 'https://github.com/jununfly/ZAgenticLoop/pull/43',
      evidence: ['https://github.com/jununfly/ZAgenticLoop/pull/43'],
    }),
  },
  {
    name: 'duplicate-same-pr-head',
    expectOutcome: 'duplicate',
    signal: buildPrSignal({
      ...BASE_SIGNAL,
      action: 'synchronize',
      signal_id: 'pr:42:head:abc123def456:checks:failure',
    }),
    existingRequests: [{
      request_id: 'ifr_existing_pr_42',
      status: 'requested',
      dedupe_key: 'pr:jununfly/ZAgenticLoop:42:head:abc123def456:checks:failure',
      issue_url: 'https://github.com/jununfly/ZAgenticLoop/issues/200',
    }],
  },
  {
    name: 'missing-github-check-source',
    expectOutcome: 'denied',
    signal: buildPrSignal({
      ...BASE_SIGNAL,
      action: 'synchronize',
      signal_id: 'pr:42:head:abc123def456:checks:failure:missing-source',
      check_source: 'text_heuristic',
    }),
  },
  {
    name: 'draft-pr-denied',
    expectOutcome: 'denied',
    signal: buildPrSignal({
      ...BASE_SIGNAL,
      action: 'synchronize',
      signal_id: 'pr:42:head:abc123def456:checks:failure:draft',
      draft: true,
    }),
  },
  {
    name: 'non-main-base-denied',
    expectOutcome: 'denied',
    signal: buildPrSignal({
      ...BASE_SIGNAL,
      action: 'synchronize',
      signal_id: 'pr:42:head:abc123def456:checks:failure:dev',
      base_branch: 'develop',
    }),
  },
  {
    name: 'opened-action-denied',
    expectOutcome: 'denied',
    signal: buildPrSignal({
      ...BASE_SIGNAL,
      action: 'opened',
      signal_id: 'pr:42:head:abc123def456:checks:failure:opened',
    }),
  },
];

export function replayPrStewardFixRequest({
  routeTableText,
  scenario,
  createdAt = '2026-07-07T00:00:00Z',
} = {}) {
  const dispatch = dispatchSignalToIssueFixRequest({
    routeTableText,
    routeId: ROUTE_ID,
    signal: scenario.signal,
    existingRequests: scenario.existingRequests,
    createdAt,
  });
  const steps = [
    {
      name: 'pull-request-event',
      status: 'observed',
      pr_number: scenario.signal?.pr_number,
      action: scenario.signal?.action,
      checks: scenario.signal?.checks,
      check_source: scenario.signal?.check_source,
    },
    {
      name: 'route-decision',
      status: dispatch.routeDecision.allowed ? 'allowed' : 'denied',
      route_id: dispatch.routeDecision.route_id,
      request_kind: dispatch.routeDecision.request_kind,
      reason: dispatch.routeDecision.reason,
    },
  ];

  if (dispatch.action === 'denied') {
    steps.push({ name: 'issue-fix-request', status: 'not-created' });
    return buildReplay({ scenario, dispatch, steps, outcome: 'denied' });
  }
  if (dispatch.action === 'duplicate') {
    steps.push({
      name: 'issue-fix-request',
      status: 'duplicate',
      existing_request_url: dispatch.issueFixRequest?.lifecycle?.existing_request_url ?? '',
    });
    return buildReplay({ scenario, dispatch, steps, outcome: 'duplicate' });
  }

  const issueBody = buildPrStewardFixRequestIssueBody(dispatch.issueFixRequest);
  steps.push({ name: 'issue-fix-request', status: 'requested' });
  return buildReplay({ scenario, dispatch, steps, outcome: 'create-request', issueBody });
}

export async function runPrStewardFixRequestReplaySuite({
  routeTablePath = DEFAULT_ROUTE_TABLE,
  routeTableText,
  scenarios = DEFAULT_PR_STEWARD_FIX_REQUEST_SCENARIOS,
} = {}) {
  const resolvedRouteTableText = routeTableText ?? await readFile(routeTablePath, 'utf8');
  const results = scenarios.map((scenario) => {
    const replay = replayPrStewardFixRequest({ routeTableText: resolvedRouteTableText, scenario });
    return {
      name: scenario.name,
      expected: scenario.expectOutcome,
      actual: replay.outcome,
      pass: replay.outcome === scenario.expectOutcome,
      replay,
    };
  });

  return {
    schemaVersion: 1,
    kind: 'zj-loop-pr-steward-fix-request-e2e-replay-suite',
    routeTablePath,
    passed: results.every((result) => result.pass),
    results,
  };
}

export function buildPrStewardFixRequestIssueTitle(request) {
  const prNumber = request?.subject?.pr_number ?? 'unknown';
  return `[Issue Fix Request] pr-steward-fix-request: PR #${prNumber} failing checks`;
}

export function buildPrStewardFixRequestIssueBody(request) {
  return [
    `# ${buildPrStewardFixRequestIssueTitle(request)}`,
    '',
    `Source PR: ${request?.source_signal?.source_url ?? ''}`,
    `Dedupe key: \`${request?.dedupe_key ?? ''}\``,
    '',
    buildIssueFixRequestComment(request).trimEnd(),
    '',
  ].join('\n');
}

function buildPrSignal(signal) {
  return {
    ...signal,
    dedupe_key: `pr:${signal.repo}:${signal.pr_number}:head:${signal.head_sha}:checks:failure`,
    request_subject: {
      type: 'pull_request',
      repo: signal.repo,
      pr_number: signal.pr_number,
      head_sha: signal.head_sha,
      base_branch: signal.base_branch,
    },
  };
}

function buildReplay({ scenario, dispatch, steps, outcome, issueBody = null }) {
  return {
    schemaVersion: 1,
    kind: 'zj-loop-pr-steward-fix-request-e2e-replay',
    scenario: scenario.name,
    outcome,
    routeDecision: dispatch.routeDecision,
    issueFixRequest: dispatch.issueFixRequest,
    issueTitle: dispatch.issueFixRequest ? buildPrStewardFixRequestIssueTitle(dispatch.issueFixRequest) : null,
    issueBody,
    sideEffects: {
      issue_created: false,
      pr_comment_created: false,
      pr_label_changed: false,
      pr_rebased: false,
      pr_merged: false,
      workflow_dispatched: false,
      consumer_claimed: false,
    },
    steps,
  };
}

async function main() {
  const routeTablePath = process.env.ROUTE_TABLE_PATH || DEFAULT_ROUTE_TABLE;
  const suite = await runPrStewardFixRequestReplaySuite({ routeTablePath });
  console.log(JSON.stringify(suite, null, 2));
  if (!suite.passed) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
