#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { dispatchSignalToIssueFixRequest } from './issue-fix-request-dispatcher.mjs';

const DEFAULT_ROUTE_TABLE = 'zj-loop/zj-loop-route-table.yaml';
const ROUTE_ID = 'dependency-sweeper';

const BASE_SIGNAL = {
  source: 'dependency',
  repo: 'jununfly/ZAgenticLoop',
  head_branch: 'main',
  source_url: 'https://github.com/jununfly/ZAgenticLoop/security/dependabot',
  fix_scope: {
    files_or_areas: ['package.json', 'package-lock.json'],
    non_goals: [
      'major upgrades',
      'high or critical vulnerability policy decisions',
      'auto-merge',
    ],
  },
  acceptance_criteria: [
    'Create a verifier-backed dependency fix request for Dependency Sweeper.',
    'Keep the change scoped to dependency manifests and lockfiles.',
    'Escalate risky dependency policy decisions instead of auto-fixing them.',
  ],
  verification_commands: ['npm ci', 'npm test'],
};

export const DEFAULT_DEPENDENCY_SWEEPER_ROUTE_SCENARIOS = [
  {
    name: 'patch-low-requested',
    expectOutcome: 'requested',
    signal: {
      ...BASE_SIGNAL,
      signal_id: 'dependency:npm:yaml:patch-low',
      summary: 'Patch update for yaml is low risk.',
      package_name: 'yaml',
      current_version: '2.7.0',
      target_version: '2.7.1',
      update_type: 'patch',
      risk: 'low',
      priority: 'P2',
      confidence: 'high',
    },
  },
  {
    name: 'minor-medium-requested',
    expectOutcome: 'requested',
    signal: {
      ...BASE_SIGNAL,
      signal_id: 'dependency:npm:ajv:minor-medium',
      summary: 'Minor update for ajv requires verifier-backed handling.',
      package_name: 'ajv',
      current_version: '8.16.0',
      target_version: '8.17.1',
      update_type: 'minor',
      risk: 'medium',
      priority: 'P2',
      confidence: 'medium',
    },
  },
  {
    name: 'duplicate-active-request',
    expectOutcome: 'duplicate',
    signal: {
      ...BASE_SIGNAL,
      signal_id: 'dependency:npm:yaml:duplicate',
      summary: 'Duplicate patch update for yaml is already requested.',
      package_name: 'yaml',
      current_version: '2.7.0',
      target_version: '2.7.1',
      update_type: 'patch',
      risk: 'low',
      priority: 'P2',
      confidence: 'high',
    },
    existingRequests: [{
      request_id: 'ifr_existing_dependency_yaml',
      status: 'requested',
      dedupe_key: 'jununfly/ZAgenticLoop:dependency-sweeper:dependency:npm:yaml:duplicate:package-json-package-lock-json',
    }],
  },
  {
    name: 'major-medium-denied',
    expectOutcome: 'denied',
    signal: {
      ...BASE_SIGNAL,
      signal_id: 'dependency:npm:yaml:major-medium',
      summary: 'Major update for yaml requires human review.',
      package_name: 'yaml',
      current_version: '2.7.0',
      target_version: '3.0.0',
      update_type: 'major',
      risk: 'medium',
      priority: 'P1',
      confidence: 'medium',
    },
  },
  {
    name: 'patch-high-denied',
    expectOutcome: 'denied',
    signal: {
      ...BASE_SIGNAL,
      signal_id: 'dependency:npm:yaml:patch-high',
      summary: 'High risk patch requires human review.',
      package_name: 'yaml',
      current_version: '2.7.0',
      target_version: '2.7.1',
      update_type: 'patch',
      risk: 'high',
      priority: 'P1',
      confidence: 'medium',
    },
  },
  {
    name: 'critical-cve-denied',
    expectOutcome: 'denied',
    signal: {
      ...BASE_SIGNAL,
      signal_id: 'dependency:npm:yaml:critical-cve',
      summary: 'Critical CVE requires human policy decision.',
      package_name: 'yaml',
      current_version: '2.7.0',
      target_version: '2.7.1',
      update_type: 'patch',
      risk: 'critical',
      priority: 'P0',
      confidence: 'high',
    },
  },
  {
    name: 'feature-branch-denied',
    expectOutcome: 'denied',
    signal: {
      ...BASE_SIGNAL,
      signal_id: 'dependency:npm:yaml:feature-branch',
      summary: 'Dependency update on a feature branch is outside the route allowlist.',
      package_name: 'yaml',
      current_version: '2.7.0',
      target_version: '2.7.1',
      update_type: 'patch',
      risk: 'low',
      priority: 'P2',
      confidence: 'high',
      head_branch: 'feature/dependency-update',
    },
  },
];

export function replayDependencySweeperRoute({ routeTableText, scenario, createdAt = '2026-07-07T00:00:00Z' }) {
  const dispatch = dispatchSignalToIssueFixRequest({
    routeTableText,
    routeId: ROUTE_ID,
    signal: scenario.signal,
    existingRequests: scenario.existingRequests ?? [],
    createdAt,
  });
  const steps = [
    {
      name: 'dependency-alert',
      status: 'observed',
      package_name: scenario.signal?.package_name,
      update_type: scenario.signal?.update_type,
      risk: scenario.signal?.risk,
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
  return buildReplay({ scenario, dispatch, steps, outcome: 'requested' });
}

export async function runDependencySweeperRouteReplaySuite({
  routeTablePath = DEFAULT_ROUTE_TABLE,
  routeTableText,
  scenarios = DEFAULT_DEPENDENCY_SWEEPER_ROUTE_SCENARIOS,
} = {}) {
  const resolvedRouteTableText = routeTableText ?? await readFile(routeTablePath, 'utf8');
  const results = scenarios.map((scenario) => {
    const replay = replayDependencySweeperRoute({ routeTableText: resolvedRouteTableText, scenario });
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
    kind: 'zj-loop-dependency-sweeper-route-e2e-replay-suite',
    routeTablePath,
    passed: results.every((result) => result.pass),
    results,
  };
}

function buildReplay({ scenario, dispatch, steps, outcome }) {
  return {
    schemaVersion: 1,
    kind: 'zj-loop-dependency-sweeper-route-e2e-replay',
    scenario: scenario.name,
    outcome,
    routeDecision: dispatch.routeDecision,
    issueFixRequest: dispatch.issueFixRequest,
    steps,
  };
}

async function main() {
  const routeTablePath = process.env.ROUTE_TABLE_PATH || DEFAULT_ROUTE_TABLE;
  const suite = await runDependencySweeperRouteReplaySuite({ routeTablePath });
  console.log(JSON.stringify(suite, null, 2));
  if (!suite.passed) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
