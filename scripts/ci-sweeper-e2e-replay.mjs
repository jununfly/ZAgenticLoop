#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { classifyCiSweeperLifecycle } from './ci-sweeper-lifecycle.mjs';
import { buildCiSweeperRouteDecision } from './route-ci-failure.mjs';

const DEFAULT_ROUTE_TABLE = 'zj-loop/zj-loop-route-table.yaml';

export const DEFAULT_REPLAY_SCENARIOS = [
  {
    name: 'repair-pr',
    failures: [{
      workflow: 'validate-patterns',
      databaseId: 91001,
      headBranch: 'main',
      headSha: 'abc123',
      url: 'https://github.com/jununfly/ZAgenticLoop/actions/runs/91001',
    }],
    sweeperResult: {
      repairDiff: true,
      repairOutcome: 'success',
      validateOutcome: 'success',
      auditOutcome: 'success',
    },
    expectOutcome: 'repair-pr',
  },
  {
    name: 'escalation-issue',
    failures: [{
      workflow: 'audit',
      databaseId: 91002,
      headBranch: 'main',
      headSha: 'def456',
      url: 'https://github.com/jununfly/ZAgenticLoop/actions/runs/91002',
    }],
    sweeperResult: {
      repairDiff: true,
      repairOutcome: 'success',
      validateOutcome: 'failure',
      auditOutcome: 'success',
    },
    expectOutcome: 'escalation-issue',
  },
  {
    name: 'duplicate-request',
    failures: [{
      workflow: 'audit',
      databaseId: 91003,
      headBranch: 'main',
      headSha: 'fed987',
      url: 'https://github.com/jununfly/ZAgenticLoop/actions/runs/91003',
    }],
    existingRequests: [{
      request_id: 'PR #123',
      dedupe_key: 'ci:audit:91003',
      status: 'pending',
    }],
    sweeperResult: {
      repairDiff: true,
      repairOutcome: 'success',
      validateOutcome: 'success',
      auditOutcome: 'success',
    },
    expectOutcome: 'duplicate-request',
  },
  {
    name: 'route-denied-generated-branch',
    failures: [{
      workflow: 'audit',
      databaseId: 91004,
      headBranch: 'automated/ci-sweeper-audit-91004',
      headSha: '987fed',
      url: 'https://github.com/jununfly/ZAgenticLoop/actions/runs/91004',
    }],
    sweeperResult: {
      repairDiff: true,
      repairOutcome: 'success',
      validateOutcome: 'success',
      auditOutcome: 'success',
    },
    expectOutcome: 'route-denied',
  },
  {
    name: 'route-denied-stale-source-run',
    failures: [{
      workflow: 'audit',
      databaseId: 91005,
      headBranch: 'main',
      headSha: '456abc',
      url: 'https://github.com/jununfly/ZAgenticLoop/actions/runs/91005',
      isLatestFailure: false,
    }],
    sweeperResult: {
      repairDiff: true,
      repairOutcome: 'success',
      validateOutcome: 'success',
      auditOutcome: 'success',
    },
    expectOutcome: 'route-denied',
  },
  {
    name: 'existing-escalation-issue',
    failures: [{
      workflow: 'audit',
      databaseId: 91006,
      headBranch: 'main',
      headSha: '789abc',
      url: 'https://github.com/jununfly/ZAgenticLoop/actions/runs/91006',
    }],
    existingLifecycle: {
      escalationIssueNumber: '321',
    },
    sweeperResult: {
      repairDiff: true,
      repairOutcome: 'success',
      validateOutcome: 'success',
      auditOutcome: 'success',
    },
    expectOutcome: 'existing_escalation_issue',
  },
];

function allGatesSucceeded(sweeperResult) {
  return sweeperResult?.repairOutcome === 'success'
    && sweeperResult?.validateOutcome === 'success'
    && sweeperResult?.auditOutcome === 'success';
}

export function classifyCiSweeperOutcome(routeDecision, sweeperResult = {}, lifecycle = null) {
  if (routeDecision.status === 'duplicate') return 'duplicate-request';
  if (routeDecision.status === 'denied') return 'route-denied';
  if (routeDecision.status === 'ignored') return 'route-ignored';
  if (!routeDecision.dispatch) return 'route-not-dispatched';
  if (lifecycle && lifecycle.kind !== 'none') return lifecycle.kind;

  if (sweeperResult.repairDiff === true && allGatesSucceeded(sweeperResult)) {
    return 'repair-pr';
  }

  return 'escalation-issue';
}

export function replayCiSweeperDogfood({
  routeTableText,
  failures,
  existingRequests = [],
  existingLifecycle = {},
  sweeperResult = {},
  repository = 'jununfly/ZAgenticLoop',
  sourceRunId = 'daily-triage-replay',
} = {}) {
  const routeDecision = buildCiSweeperRouteDecision({
    routeTableText,
    failures,
    existingRequests,
    repository,
    sourceRunId,
  });
  const lifecycle = routeDecision.dispatch
    ? classifyCiSweeperLifecycle({
      dedupeKey: routeDecision.dedupe_key,
      sourceWorkflow: routeDecision.source_workflow,
      sourceRunId: routeDecision.source_run_id,
      requestBranch: routeDecision.request_branch,
      ...existingLifecycle,
    })
    : null;
  const outcome = classifyCiSweeperOutcome(routeDecision, sweeperResult, lifecycle);
  const steps = [
    {
      name: 'daily-triage-signal',
      status: Array.isArray(failures) && failures.length > 0 ? 'observed' : 'empty',
      evidence: failures?.map((failure) => failure.url).filter(Boolean) ?? [],
    },
    {
      name: 'route-table-decision',
      status: routeDecision.status,
      route: routeDecision.route,
      reason: routeDecision.reason ?? null,
      dedupe_key: routeDecision.dedupe_key ?? null,
      request_branch: routeDecision.request_branch ?? null,
    },
  ];

  if (lifecycle) {
    steps.push({
      name: 'existing-lifecycle-classification',
      status: lifecycle.kind,
      ref: lifecycle.ref,
      dispatch_allowed: lifecycle.dispatch_allowed,
      next_action: lifecycle.next_action,
    });
  }

  if (routeDecision.dispatch && (!lifecycle || lifecycle.kind === 'none')) {
    steps.push({
      name: 'ci-sweeper-dispatch',
      status: 'pending',
      workflow: routeDecision.source_workflow,
      run_id: routeDecision.source_run_id,
    });
    steps.push({
      name: 'ci-sweeper-outcome',
      status: outcome,
      repair_diff: sweeperResult.repairDiff === true,
      repair_outcome: sweeperResult.repairOutcome ?? 'unknown',
      validate_outcome: sweeperResult.validateOutcome ?? 'unknown',
      audit_outcome: sweeperResult.auditOutcome ?? 'unknown',
    });
  }

  return {
    schemaVersion: 1,
    kind: 'zj-loop-ci-sweeper-e2e-replay',
    outcome,
    routeDecision,
    lifecycle,
    steps,
  };
}

export async function runReplaySuite({
  routeTablePath = DEFAULT_ROUTE_TABLE,
  scenarios = DEFAULT_REPLAY_SCENARIOS,
} = {}) {
  const routeTableText = await readFile(routeTablePath, 'utf8');
  const results = scenarios.map((scenario) => {
    const replay = replayCiSweeperDogfood({
      routeTableText,
      failures: scenario.failures,
      existingRequests: scenario.existingRequests,
      existingLifecycle: scenario.existingLifecycle,
      sweeperResult: scenario.sweeperResult,
    });
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
    kind: 'zj-loop-ci-sweeper-e2e-replay-suite',
    routeTablePath,
    passed: results.every((result) => result.pass),
    results,
  };
}

async function main() {
  const routeTablePath = process.env.ROUTE_TABLE_PATH || DEFAULT_ROUTE_TABLE;
  const suite = await runReplaySuite({ routeTablePath });
  console.log(JSON.stringify(suite, null, 2));
  if (!suite.passed) {
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
