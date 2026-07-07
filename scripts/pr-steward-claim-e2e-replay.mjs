#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import {
  applyFixConsumerTransition,
  buildIssueFixRequestLifecycleComment,
  validateIssueFixRequest,
} from './issue-fix-request-contract.mjs';
import {
  DEFAULT_PR_STEWARD_FIX_REQUEST_SCENARIOS,
  replayPrStewardFixRequest,
} from './pr-steward-fix-request-e2e-replay.mjs';

const DEFAULT_ROUTE_TABLE = 'zj-loop/zj-loop-route-table.yaml';
const ROUTE_ID = 'pr-steward-fix-request';
const CONSUMER_ID = 'pr-steward';
const CAPABILITY = 'pr-review-and-readiness-fix';

export const DEFAULT_PR_STEWARD_CLAIM_SCENARIOS = [
  {
    name: 'failing-pr-request-consumed',
    expectOutcome: 'consumed',
    sourceScenarioName: 'synchronize-failing-checks',
    claimInput: {
      current_pr_head_sha: 'abc123def456',
    },
  },
  {
    name: 'consumer-mismatch-denied',
    expectOutcome: 'claim-denied',
    sourceScenarioName: 'synchronize-failing-checks',
    claimInput: {
      current_pr_head_sha: 'abc123def456',
    },
    mutateRequest(request) {
      return {
        ...request,
        requested_consumer: {
          ...request.requested_consumer,
          consumer_id: 'dependency-sweeper',
        },
      };
    },
  },
  {
    name: 'missing-verifier-denied',
    expectOutcome: 'claim-denied',
    sourceScenarioName: 'synchronize-failing-checks',
    claimInput: {
      current_pr_head_sha: 'abc123def456',
    },
    mutateRequest(request) {
      return {
        ...request,
        verification_gate: {
          commands: [],
        },
      };
    },
  },
  {
    name: 'non-requested-denied',
    expectOutcome: 'claim-denied',
    sourceScenarioName: 'synchronize-failing-checks',
    claimInput: {
      current_pr_head_sha: 'abc123def456',
    },
    mutateRequest(request) {
      return {
        ...request,
        status: 'consumed',
      };
    },
  },
  {
    name: 'stale-head-denied',
    expectOutcome: 'claim-denied',
    sourceScenarioName: 'synchronize-failing-checks',
    claimInput: {
      current_pr_head_sha: 'new789head000',
    },
  },
  {
    name: 'non-main-base-denied-at-claim',
    expectOutcome: 'claim-denied',
    sourceScenarioName: 'synchronize-failing-checks',
    claimInput: {
      current_pr_head_sha: 'abc123def456',
    },
    mutateRequest(request) {
      return {
        ...request,
        subject: {
          ...request.subject,
          base_branch: 'develop',
        },
      };
    },
  },
  {
    name: 'duplicate-existing-request-not-claimed',
    expectOutcome: 'route-duplicate',
    sourceScenarioName: 'duplicate-same-pr-head',
    claimInput: {
      current_pr_head_sha: 'abc123def456',
    },
  },
];

export function replayPrStewardClaim({
  routeTableText,
  scenario,
  createdAt = '2026-07-07T00:00:00Z',
} = {}) {
  const sourceScenario = findPrStewardFixRequestScenario(scenario.sourceScenarioName);
  const fixRequestReplay = replayPrStewardFixRequest({
    routeTableText,
    scenario: sourceScenario,
    createdAt,
  });
  const steps = [
    {
      name: 'pull-request-event',
      status: 'observed',
      pr_number: sourceScenario.signal?.pr_number,
      action: sourceScenario.signal?.action,
      checks: sourceScenario.signal?.checks,
      check_source: sourceScenario.signal?.check_source,
    },
    {
      name: 'route-decision',
      status: fixRequestReplay.routeDecision.allowed ? 'allowed' : 'denied',
      route_id: fixRequestReplay.routeDecision.route_id,
      request_kind: fixRequestReplay.routeDecision.request_kind,
      reason: fixRequestReplay.routeDecision.reason,
    },
  ];

  if (fixRequestReplay.outcome === 'denied') {
    steps.push({ name: 'issue-fix-request', status: 'not-created' });
    return buildReplay({
      scenario,
      outcome: 'route-denied',
      fixRequestReplay,
      requestBeforeClaim: null,
      claimedRequest: null,
      claimEvidence: null,
      steps,
    });
  }
  if (fixRequestReplay.outcome === 'duplicate') {
    steps.push({ name: 'issue-fix-request', status: 'duplicate' });
    return buildReplay({
      scenario,
      outcome: 'route-duplicate',
      fixRequestReplay,
      requestBeforeClaim: fixRequestReplay.issueFixRequest,
      claimedRequest: null,
      claimEvidence: null,
      steps,
    });
  }

  const requestBeforeClaim = scenario.mutateRequest
    ? scenario.mutateRequest(fixRequestReplay.issueFixRequest)
    : fixRequestReplay.issueFixRequest;
  steps.push({ name: 'issue-fix-request', status: requestBeforeClaim.status });

  const claimValidation = validatePrStewardClaimRequest({
    request: requestBeforeClaim,
    claimInput: scenario.claimInput,
  });
  if (!claimValidation.ok) {
    steps.push({
      name: 'pr-steward-claim',
      status: 'denied',
      reason: claimValidation.errors.join(', '),
    });
    return buildReplay({
      scenario,
      outcome: 'claim-denied',
      fixRequestReplay,
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
  const claimEvidence = buildPrStewardClaimEvidence({ claimedRequest });
  steps.push({ name: 'pr-steward-claim', status: claimedRequest.status, consumer: CONSUMER_ID });

  return buildReplay({
    scenario,
    outcome: 'consumed',
    fixRequestReplay,
    requestBeforeClaim,
    claimedRequest,
    claimEvidence,
    claimValidation,
    steps,
  });
}

export async function runPrStewardClaimReplaySuite({
  routeTablePath = DEFAULT_ROUTE_TABLE,
  routeTableText,
  scenarios = DEFAULT_PR_STEWARD_CLAIM_SCENARIOS,
} = {}) {
  const resolvedRouteTableText = routeTableText ?? await readFile(routeTablePath, 'utf8');
  const results = scenarios.map((scenario) => {
    const replay = replayPrStewardClaim({ routeTableText: resolvedRouteTableText, scenario });
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
    kind: 'zj-loop-pr-steward-claim-e2e-replay-suite',
    routeTablePath,
    passed: results.every((result) => result.pass),
    results,
  };
}

export function validatePrStewardClaimRequest({ request, claimInput } = {}) {
  const errors = [];
  const baseValidation = validateIssueFixRequest(request);
  if (!baseValidation.ok) errors.push(...baseValidation.errors);
  if (request?.status !== 'requested') errors.push(`status must be requested, got ${request?.status ?? 'missing'}`);
  if (request?.subject?.type !== 'pull_request') errors.push('subject.type must be pull_request');
  if (request?.subject?.base_branch !== 'main') {
    errors.push(`subject.base_branch must be main, got ${request?.subject?.base_branch ?? 'missing'}`);
  }
  if (request?.source_signal?.source !== 'pull_request') errors.push('source_signal.source must be pull_request');
  if (request?.route_decision?.route_id !== ROUTE_ID) errors.push(`route_id must be ${ROUTE_ID}`);
  if (request?.route_decision?.target_consumer !== CONSUMER_ID) {
    errors.push(`target_consumer must be ${CONSUMER_ID}`);
  }
  if (request?.requested_consumer?.consumer_id !== CONSUMER_ID) {
    errors.push(`consumer must be ${CONSUMER_ID}`);
  }
  if (request?.requested_consumer?.capability !== CAPABILITY) {
    errors.push(`capability must be ${CAPABILITY}`);
  }
  if (!Array.isArray(request?.verification_gate?.commands) || request.verification_gate.commands.length === 0) {
    errors.push('verification gate is required before claim');
  }
  if (!claimInput?.current_pr_head_sha) {
    errors.push('current_pr_head_sha is required before claim');
  }
  if (claimInput?.current_pr_head_sha && request?.subject?.head_sha !== claimInput.current_pr_head_sha) {
    errors.push('current_pr_head_sha must match request subject head_sha');
  }
  return { ok: errors.length === 0, errors };
}

function buildPrStewardClaimEvidence({ claimedRequest }) {
  return {
    schema: 'zj-loop.pr_steward_claim.v1',
    status: 'consumed',
    request_id: claimedRequest.request_id,
    consumer_id: CONSUMER_ID,
    capability: claimedRequest.requested_consumer.capability,
    evidence_store: 'structured Issue Fix Request lifecycle comments',
    lifecycle_comment: buildIssueFixRequestLifecycleComment(claimedRequest),
    side_effects: {
      source_pr_comment_created: false,
      source_pr_label_changed: false,
      source_pr_rebased: false,
      source_pr_merged: false,
      workflow_dispatched: false,
      repair_started: false,
      branch_created: false,
      fix_pr_created: false,
      auto_merge_enabled: false,
    },
  };
}

function findPrStewardFixRequestScenario(name) {
  const scenario = DEFAULT_PR_STEWARD_FIX_REQUEST_SCENARIOS.find((item) => item.name === name);
  if (!scenario) throw new Error(`Unknown PR Steward fix request scenario: ${name}`);
  return scenario;
}

function buildReplay({
  scenario,
  outcome,
  fixRequestReplay,
  requestBeforeClaim,
  claimedRequest,
  claimEvidence,
  claimValidation = null,
  steps,
}) {
  return {
    schemaVersion: 1,
    kind: 'zj-loop-pr-steward-claim-e2e-replay',
    scenario: scenario.name,
    outcome,
    routeDecision: fixRequestReplay.routeDecision,
    requestBeforeClaim,
    claimedRequest,
    claimEvidence,
    claimValidation,
    steps,
  };
}

async function main() {
  const routeTablePath = process.env.ROUTE_TABLE_PATH || DEFAULT_ROUTE_TABLE;
  const suite = await runPrStewardClaimReplaySuite({ routeTablePath });
  console.log(JSON.stringify(suite, null, 2));
  if (!suite.passed) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
