#!/usr/bin/env node
import { fileURLToPath } from 'node:url';

import {
  applyFixConsumerTransition,
} from './issue-fix-request-contract.mjs';
import {
  dispatchSignalToIssueFixRequest,
} from './issue-fix-request-dispatcher.mjs';

function routeTableFor(route) {
  return `
routes:
  - route_id: "${route.route_id}"
    enabled: ${route.enabled === false ? 'false' : 'true'}
    request_kind: "${route.request_kind}"
    consumer: "${route.consumer}"
    match:
      source: ["${route.source ?? 'ci'}"]
    guards:
      branch_allowlist: ["main"]
      fix_consumer_allowlist: ["ci-sweeper", "pr-steward", "dependency-sweeper"]
`;
}

const BASE_SIGNAL = {
  source: 'ci',
  repo: 'jununfly/ZAgenticLoop',
  head_branch: 'main',
  fix_scope: {
    files_or_areas: ['scripts/', '.github/workflows/'],
    non_goals: ['auto-merge'],
  },
};

export const DEFAULT_ISSUE_FIX_REQUEST_REPLAY_SCENARIOS = [
  {
    name: 'ci-sweeper-fix-pr',
    route: { route_id: 'ci-sweeper', request_kind: 'issue-fix-request', consumer: 'ci-sweeper' },
    signal: {
      ...BASE_SIGNAL,
      signal_id: 'ci:validate-patterns:91001',
      summary: 'validate-patterns workflow run 91001 failed',
      source_url: 'https://github.com/jununfly/ZAgenticLoop/actions/runs/91001',
      source_run_id: '91001',
    },
    consumerOutcome: 'fix-pr',
    expectOutcome: 'fix-pr',
  },
  {
    name: 'ci-sweeper-duplicate',
    route: { route_id: 'ci-sweeper', request_kind: 'issue-fix-request', consumer: 'ci-sweeper' },
    signal: {
      ...BASE_SIGNAL,
      signal_id: 'ci:audit:91002',
      summary: 'audit workflow run 91002 failed',
      source_run_id: '91002',
    },
    existingRequests: [{
      request_id: 'ifr_existing',
      status: 'requested',
      dedupe_key: 'jununfly/ZAgenticLoop:ci-sweeper:ci:audit:91002:scripts-github-workflows',
    }],
    consumerOutcome: 'fix-pr',
    expectOutcome: 'duplicate',
  },
  {
    name: 'activation-kind-denied',
    route: {
      route_id: 'roadmap-sliced-development',
      request_kind: 'activation-comment',
      consumer: 'pr-steward',
    },
    signal: {
      ...BASE_SIGNAL,
      signal_id: 'issue:123',
      source: 'issue',
      summary: 'plan activation request',
      source_run_id: 'issue-123',
    },
    consumerOutcome: 'fix-pr',
    expectOutcome: 'denied',
  },
  {
    name: 'dependency-sweeper-failed',
    route: {
      route_id: 'dependency-sweeper',
      request_kind: 'issue-fix-request',
      consumer: 'dependency-sweeper',
      source: 'dependency',
    },
    signal: {
      ...BASE_SIGNAL,
      signal_id: 'dependency:npm:yaml',
      source: 'dependency',
      summary: 'Patch dependency update requires verifier-backed fix',
      source_run_id: 'dep-yaml',
      fix_scope: {
        files_or_areas: ['package.json', 'package-lock.json'],
        non_goals: ['major upgrades'],
      },
    },
    consumerOutcome: 'failed',
    expectOutcome: 'failed',
  },
  {
    name: 'pr-steward-fix-pr',
    route: { route_id: 'pr-steward', request_kind: 'issue-fix-request', consumer: 'pr-steward', source: 'pr' },
    signal: {
      ...BASE_SIGNAL,
      signal_id: 'pr:42:review-comment',
      source: 'pr',
      summary: 'PR review comment requires a scoped fix',
      source_run_id: 'pr-42',
      fix_scope: {
        files_or_areas: ['docs/'],
        non_goals: ['merge PR'],
      },
    },
    consumerOutcome: 'fix-pr',
    expectOutcome: 'fix-pr',
  },
];

export function replayIssueFixRequestChain(scenario) {
  const dispatch = dispatchSignalToIssueFixRequest({
    routeTableText: routeTableFor(scenario.route),
    routeId: scenario.route.route_id,
    signal: scenario.signal,
    existingRequests: scenario.existingRequests,
    createdAt: '2026-07-06T00:00:00Z',
  });
  const steps = [
    {
      name: 'signal',
      status: 'observed',
      signal_id: scenario.signal.signal_id,
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
    return buildReplay({ scenario, dispatch, steps, outcome: 'denied' });
  }
  if (dispatch.action === 'duplicate') {
    steps.push({ name: 'issue-fix-request', status: 'duplicate' });
    return buildReplay({ scenario, dispatch, steps, outcome: 'duplicate' });
  }

  steps.push({ name: 'issue-fix-request', status: 'requested' });
  const claimed = applyFixConsumerTransition({
    request: dispatch.issueFixRequest,
    consumerId: scenario.route.consumer,
    transition: 'claim',
    at: '2026-07-06T00:01:00Z',
  });
  steps.push({ name: 'fix-consumer-claim', status: claimed.status, consumer: scenario.route.consumer });

  if (scenario.consumerOutcome === 'failed') {
    const failed = applyFixConsumerTransition({
      request: claimed,
      consumerId: scenario.route.consumer,
      transition: 'fail',
      reason: 'verifier-gate-failed',
      at: '2026-07-06T00:02:00Z',
    });
    steps.push({ name: 'fix-consumer-failed', status: 'failed', reason: 'verifier-gate-failed' });
    return buildReplay({ scenario, dispatch, steps, issueFixRequest: failed, outcome: 'failed' });
  }

  const prOpened = applyFixConsumerTransition({
    request: claimed,
    consumerId: scenario.route.consumer,
    transition: 'open_pr',
    linkedPr: `https://github.com/${scenario.signal.repo}/pull/replay-${scenario.route.route_id}`,
    at: '2026-07-06T00:02:00Z',
  });
  steps.push({ name: 'fix-pr', status: 'pr_opened', linked_pr: prOpened.lifecycle.linked_pr });
  return buildReplay({ scenario, dispatch, steps, issueFixRequest: prOpened, outcome: 'fix-pr' });
}

export function runIssueFixRequestReplaySuite(scenarios = DEFAULT_ISSUE_FIX_REQUEST_REPLAY_SCENARIOS) {
  const results = scenarios.map((scenario) => {
    const replay = replayIssueFixRequestChain(scenario);
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
    kind: 'zj-loop-issue-fix-request-e2e-replay-suite',
    passed: results.every((result) => result.pass),
    results,
  };
}

function buildReplay({ scenario, dispatch, steps, issueFixRequest = dispatch.issueFixRequest, outcome }) {
  return {
    schemaVersion: 1,
    kind: 'zj-loop-issue-fix-request-e2e-replay',
    scenario: scenario.name,
    outcome,
    routeDecision: dispatch.routeDecision,
    issueFixRequest,
    steps,
  };
}

async function main() {
  const suite = runIssueFixRequestReplaySuite();
  console.log(JSON.stringify(suite, null, 2));
  if (!suite.passed) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
