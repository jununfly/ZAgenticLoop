#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import {
  applyFixConsumerTransition,
  buildIssueFixRequestLifecycleComment,
  validateIssueFixRequest,
} from './issue-fix-request-contract.mjs';
import {
  dispatchSignalToIssueFixRequest,
} from './issue-fix-request-dispatcher.mjs';

const DEFAULT_ROUTE_TABLE = 'zj-loop/zj-loop-route-table.yaml';
const ROUTE_ID = 'dependency-sweeper';
const CONSUMER_ID = 'dependency-sweeper';
const ALLOWED_CAPABILITIES = new Set(['patch-dependency-fix', 'minor-dependency-fix']);

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
      'package manifest edits during claim',
      'lockfile edits during claim',
    ],
  },
  acceptance_criteria: [
    'Claim the dependency fix request for Dependency Sweeper.',
    'Record consumed lifecycle evidence without starting dependency repair.',
    'Leave package manifests, lockfiles, branches, PRs, and workflow dispatches unchanged.',
  ],
  verification_commands: ['npm ci', 'npm test'],
};

export const DEFAULT_DEPENDENCY_SWEEPER_CLAIM_SCENARIOS = [
  {
    name: 'patch-request-consumed',
    expectOutcome: 'consumed',
    signal: {
      ...BASE_SIGNAL,
      signal_id: 'dependency:npm:yaml:patch-claim',
      summary: 'Patch update for yaml is ready for Dependency Sweeper claim.',
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
    name: 'minor-request-consumed',
    expectOutcome: 'consumed',
    signal: {
      ...BASE_SIGNAL,
      signal_id: 'dependency:npm:ajv:minor-claim',
      summary: 'Minor update for ajv is ready for Dependency Sweeper claim.',
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
    name: 'consumer-mismatch-denied',
    expectOutcome: 'claim-denied',
    mutateRequest(request) {
      return {
        ...request,
        requested_consumer: {
          ...request.requested_consumer,
          consumer_id: 'pr-steward',
        },
      };
    },
    signal: {
      ...BASE_SIGNAL,
      signal_id: 'dependency:npm:yaml:consumer-mismatch',
      summary: 'Patch update for yaml must not be claimed by the wrong consumer.',
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
    name: 'missing-verifier-denied',
    expectOutcome: 'claim-denied',
    mutateRequest(request) {
      return {
        ...request,
        verification_gate: {
          commands: [],
        },
      };
    },
    signal: {
      ...BASE_SIGNAL,
      signal_id: 'dependency:npm:yaml:missing-verifier',
      summary: 'Patch update for yaml lacks verifier gate.',
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
    name: 'non-requested-denied',
    expectOutcome: 'claim-denied',
    mutateRequest(request) {
      return {
        ...request,
        status: 'consumed',
      };
    },
    signal: {
      ...BASE_SIGNAL,
      signal_id: 'dependency:npm:yaml:already-consumed',
      summary: 'Already consumed request should not be claimed again.',
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
    name: 'major-update-denied-before-request',
    expectOutcome: 'route-denied',
    signal: {
      ...BASE_SIGNAL,
      signal_id: 'dependency:npm:yaml:major-claim',
      summary: 'Major update for yaml requires human review before claim.',
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
    name: 'high-risk-denied-before-request',
    expectOutcome: 'route-denied',
    signal: {
      ...BASE_SIGNAL,
      signal_id: 'dependency:npm:yaml:high-risk-claim',
      summary: 'High risk update for yaml requires human review before claim.',
      package_name: 'yaml',
      current_version: '2.7.0',
      target_version: '2.7.1',
      update_type: 'patch',
      risk: 'high',
      priority: 'P1',
      confidence: 'medium',
    },
  },
];

export function replayDependencySweeperClaim({ routeTableText, scenario, createdAt = '2026-07-07T00:00:00Z' }) {
  const dispatch = dispatchSignalToIssueFixRequest({
    routeTableText,
    routeId: ROUTE_ID,
    signal: scenario.signal,
    existingRequests: [],
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
    steps.push({ name: 'issue-fix-request', status: 'not-created' });
    return buildReplay({
      scenario,
      outcome: 'route-denied',
      dispatch,
      requestBeforeClaim: null,
      claimedRequest: null,
      claimEvidence: null,
      steps,
    });
  }
  if (dispatch.action === 'duplicate') {
    steps.push({ name: 'issue-fix-request', status: 'duplicate' });
    return buildReplay({
      scenario,
      outcome: 'route-denied',
      dispatch,
      requestBeforeClaim: dispatch.issueFixRequest,
      claimedRequest: null,
      claimEvidence: null,
      steps,
    });
  }

  const requestBeforeClaim = scenario.mutateRequest
    ? scenario.mutateRequest(dispatch.issueFixRequest)
    : dispatch.issueFixRequest;
  steps.push({ name: 'issue-fix-request', status: requestBeforeClaim.status });

  const claimValidation = validateDependencySweeperClaimRequest(requestBeforeClaim);
  if (!claimValidation.ok) {
    steps.push({
      name: 'dependency-sweeper-claim',
      status: 'denied',
      reason: claimValidation.errors.join(', '),
    });
    return buildReplay({
      scenario,
      outcome: 'claim-denied',
      dispatch,
      requestBeforeClaim,
      claimedRequest: null,
      claimEvidence: null,
      claimValidation,
      steps,
    });
  }

  const claimedRequest = applyFixConsumerTransition({
    request: requestBeforeClaim,
    consumerId: CONSUMER_ID,
    transition: 'claim',
    at: '2026-07-07T00:01:00Z',
  });
  const claimEvidence = buildDependencySweeperClaimEvidence({ claimedRequest });
  steps.push({ name: 'dependency-sweeper-claim', status: claimedRequest.status, consumer: CONSUMER_ID });

  return buildReplay({
    scenario,
    outcome: 'consumed',
    dispatch,
    requestBeforeClaim,
    claimedRequest,
    claimEvidence,
    claimValidation,
    steps,
  });
}

export async function runDependencySweeperClaimReplaySuite({
  routeTablePath = DEFAULT_ROUTE_TABLE,
  routeTableText,
  scenarios = DEFAULT_DEPENDENCY_SWEEPER_CLAIM_SCENARIOS,
} = {}) {
  const resolvedRouteTableText = routeTableText ?? await readFile(routeTablePath, 'utf8');
  const results = scenarios.map((scenario) => {
    const replay = replayDependencySweeperClaim({ routeTableText: resolvedRouteTableText, scenario });
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
    kind: 'zj-loop-dependency-sweeper-claim-e2e-replay-suite',
    routeTablePath,
    passed: results.every((result) => result.pass),
    results,
  };
}

export function validateDependencySweeperClaimRequest(request) {
  const errors = [];
  const baseValidation = validateIssueFixRequest(request);
  if (!baseValidation.ok) errors.push(...baseValidation.errors);
  if (request?.status !== 'requested') errors.push(`status must be requested, got ${request?.status ?? 'missing'}`);
  if (request?.requested_consumer?.consumer_id !== CONSUMER_ID) {
    errors.push(`consumer must be ${CONSUMER_ID}`);
  }
  if (!ALLOWED_CAPABILITIES.has(request?.requested_consumer?.capability)) {
    errors.push(`unsupported capability ${request?.requested_consumer?.capability ?? 'missing'}`);
  }
  if (!Array.isArray(request?.verification_gate?.commands) || request.verification_gate.commands.length === 0) {
    errors.push('verification gate is required before claim');
  }
  if (request?.route_decision?.route_id !== ROUTE_ID) errors.push(`route_id must be ${ROUTE_ID}`);
  if (request?.route_decision?.risk === 'high' || request?.route_decision?.risk === 'critical') {
    errors.push('high or critical risk dependency request requires human review');
  }
  return { ok: errors.length === 0, errors };
}

function buildDependencySweeperClaimEvidence({ claimedRequest }) {
  return {
    schema: 'zj-loop.dependency_sweeper_claim.v1',
    status: 'consumed',
    request_id: claimedRequest.request_id,
    consumer_id: CONSUMER_ID,
    capability: claimedRequest.requested_consumer.capability,
    evidence_store: 'structured Issue Fix Request lifecycle comments',
    lifecycle_comment: buildIssueFixRequestLifecycleComment(claimedRequest),
    side_effects: {
      package_manifest_edited: false,
      lockfile_edited: false,
      branch_created: false,
      pull_request_created: false,
      workflow_dispatched: false,
      repair_started: false,
      auto_merge_enabled: false,
    },
  };
}

function buildReplay({
  scenario,
  outcome,
  dispatch,
  requestBeforeClaim,
  claimedRequest,
  claimEvidence,
  claimValidation = null,
  steps,
}) {
  return {
    schemaVersion: 1,
    kind: 'zj-loop-dependency-sweeper-claim-e2e-replay',
    scenario: scenario.name,
    outcome,
    routeDecision: dispatch.routeDecision,
    requestBeforeClaim,
    claimedRequest,
    claimEvidence,
    claimValidation,
    steps,
  };
}

async function main() {
  const routeTablePath = process.env.ROUTE_TABLE_PATH || DEFAULT_ROUTE_TABLE;
  const suite = await runDependencySweeperClaimReplaySuite({ routeTablePath });
  console.log(JSON.stringify(suite, null, 2));
  if (!suite.passed) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
