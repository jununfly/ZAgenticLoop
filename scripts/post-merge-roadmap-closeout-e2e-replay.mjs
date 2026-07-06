#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { ROUTE_DECISION_SCHEMA } from './issue-fix-request-contract.mjs';
import {
  buildRoadmapCloseoutPlan,
  parsePostMergeContractFromPrBody,
} from './post-merge-roadmap-closeout-contract.mjs';
import { findRoute } from './route-ci-failure.mjs';

const DEFAULT_ROUTE_TABLE = 'zj-loop/zj-loop-route-table.yaml';
const REPORT_EVIDENCE_SCHEMA = 'zj-loop.post_merge_roadmap_closeout_report.v1';
const ROUTE_ID = 'post-merge-roadmap-closeout';

const VALID_PR_BODY = [
  '## Post-Merge Contract',
  '',
  '```yaml',
  'kind: zj-loop.post-merge-contract',
  'version: 1',
  'consumer: post-merge-cleanup',
  'mode: roadmap-closeout',
  'roadmap:',
  '  id: post-merge-roadmap-closeout-e2e',
  '  branch: zjal/post-merge-roadmap-closeout-e2e',
  'carrier:',
  '  issue: 42',
  'cleanup:',
  '  delete_merged_branch: true',
  '  close_carrier_issue: true',
  'safety:',
  '  require_pr_merged: true',
  '  require_branch_merged: true',
  '  no_pending_followups: true',
  '  missing_contract_behavior: report-only',
  '```',
].join('\n');

const VALID_MERGED_PR_SIGNAL = {
  source: 'pull_request',
  action: 'closed',
  merged: true,
  repo: 'jununfly/ZAgenticLoop',
  pr_number: 24,
  subject: 'PR #24',
  body: VALID_PR_BODY,
  headRefName: 'zjal/post-merge-roadmap-closeout-e2e',
  headRepositoryOwner: 'jununfly',
  baseRepositoryOwner: 'jununfly',
  baseRefName: 'main',
  priority: 'P2',
  risk: 'medium',
  confidence: 'high',
};

export const DEFAULT_POST_MERGE_ROADMAP_CLOSEOUT_SCENARIOS = [
  {
    name: 'valid-merged-roadmap-pr',
    expectOutcome: 'report-evidence',
    signal: VALID_MERGED_PR_SIGNAL,
  },
  {
    name: 'missing-contract',
    expectOutcome: 'report-evidence',
    signal: {
      source: 'pull_request',
      action: 'closed',
      merged: true,
      repo: 'jununfly/ZAgenticLoop',
      pr_number: 25,
      subject: 'PR #25',
      body: '## Summary\n\nNo post-merge contract here.',
      headRefName: 'zjal/missing-contract',
      headRepositoryOwner: 'jununfly',
      baseRepositoryOwner: 'jununfly',
      baseRefName: 'main',
      priority: 'P2',
      risk: 'medium',
      confidence: 'medium',
    },
  },
  {
    name: 'branch-mismatch',
    expectOutcome: 'report-evidence',
    signal: {
      ...VALID_MERGED_PR_SIGNAL,
      pr_number: 26,
      subject: 'PR #26',
      headRefName: 'feature/not-the-roadmap-branch',
    },
  },
  {
    name: 'fork-head-repository',
    expectOutcome: 'report-evidence',
    signal: {
      ...VALID_MERGED_PR_SIGNAL,
      pr_number: 27,
      subject: 'PR #27',
      headRepositoryOwner: 'external-user',
    },
  },
  {
    name: 'unknown-head-repository',
    expectOutcome: 'report-evidence',
    signal: {
      ...VALID_MERGED_PR_SIGNAL,
      pr_number: 28,
      subject: 'PR #28',
      headRepositoryOwner: undefined,
    },
  },
];

export function replayPostMergeRoadmapCloseout({ routeTableText, scenario, createdAt = '2026-07-06T00:00:00Z' }) {
  const routeDecision = buildPostMergeRoadmapCloseoutRouteDecision({
    routeTableText,
    signal: scenario.signal,
    createdAt,
  });
  const steps = [
    { name: 'merged-pr-signal', status: 'observed', pr_number: scenario.signal?.pr_number },
    {
      name: 'route-decision',
      status: routeDecision.allowed ? 'allowed' : 'denied',
      request_kind: routeDecision.request_kind,
      target_consumer: routeDecision.target_consumer,
    },
  ];

  if (!routeDecision.allowed) {
    steps.push({ name: 'route-denied', status: 'denied', reason: routeDecision.reason });
    return {
      schemaVersion: 1,
      kind: 'zj-loop-post-merge-roadmap-closeout-e2e-replay',
      outcome: 'route-denied',
      routeDecision,
      closeoutPlan: null,
      reportEvidence: null,
      steps,
    };
  }

  const contractResult = parsePostMergeContractFromPrBody(scenario.signal?.body ?? '');
  const closeoutPlan = buildRoadmapCloseoutPlan({
    pr: normalizePrSignal(scenario.signal),
    contractResult,
  });
  steps.push({ name: 'contract-parse', status: contractResult.ok ? 'parsed' : 'report-only', reason: contractResult.reason });
  steps.push({ name: 'closeout-plan', status: closeoutPlan.status, reason: closeoutPlan.reason });

  const reportEvidence = buildPostMergeRoadmapCloseoutReportEvidence({
    routeDecision,
    closeoutPlan,
    signal: scenario.signal,
    createdAt,
  });

  return {
    schemaVersion: 1,
    kind: 'zj-loop-post-merge-roadmap-closeout-e2e-replay',
    outcome: 'report-evidence',
    routeDecision,
    closeoutPlan,
    reportEvidence,
    steps,
  };
}

export async function runPostMergeRoadmapCloseoutReplaySuite({
  routeTablePath = DEFAULT_ROUTE_TABLE,
  routeTableText,
  scenarios = DEFAULT_POST_MERGE_ROADMAP_CLOSEOUT_SCENARIOS,
} = {}) {
  const resolvedRouteTableText = routeTableText ?? await readFile(routeTablePath, 'utf8');
  const results = scenarios.map((scenario) => {
    const replay = replayPostMergeRoadmapCloseout({ routeTableText: resolvedRouteTableText, scenario });
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
    kind: 'zj-loop-post-merge-roadmap-closeout-e2e-replay-suite',
    routeTablePath,
    passed: results.every((result) => result.pass),
    results,
  };
}

export function buildPostMergeRoadmapCloseoutRouteDecision({ routeTableText, signal, createdAt }) {
  const route = findRoute(routeTableText, ROUTE_ID);
  const signalId = signal?.signal_id ?? `pr:${signal?.pr_number ?? 'unknown'}:post-merge`;
  const routeEnabled = route?.enabled === true;
  const requestKindAllowed = route?.request_kind === 'report-only';
  const consumerAllowed = route?.consumer === 'post-merge-cleanup';
  const modeAllowed = route?.mode === 'roadmap-closeout';
  const routeMatched = routeMatchesSignal(route, signal);
  const sideEffectsBlocked = route?.guards?.destructive_actions_enabled === false;
  const allowed = Boolean(route && routeEnabled && requestKindAllowed && consumerAllowed && modeAllowed && routeMatched && sideEffectsBlocked);

  return {
    schema: ROUTE_DECISION_SCHEMA,
    decision_id: `rd_post_merge_${stableHash([ROUTE_ID, signalId, signal?.repo].join(':'))}`,
    source_signal_id: signalId,
    signal_id: signalId,
    source: signal?.source ?? '',
    subject: signal?.subject ?? `PR #${signal?.pr_number ?? 'unknown'}`,
    priority: signal?.priority ?? 'P2',
    state: 'none',
    route: ROUTE_ID,
    route_id: ROUTE_ID,
    request_kind: route?.request_kind ?? '',
    requested_action: 'report',
    target_consumer: route?.consumer ?? '',
    allowed,
    status: allowed ? 'closed' : 'denied',
    guards: {
      route_enabled: routeEnabled,
      request_kind_allowed: requestKindAllowed,
      consumer_allowed: consumerAllowed,
      mode_allowed: modeAllowed,
      route_matched: routeMatched,
      side_effects_blocked: sideEffectsBlocked,
      no_request_created: true,
    },
    risk: signal?.risk ?? 'medium',
    confidence: signal?.confidence ?? 'medium',
    evidence: [`pr:${signal?.pr_number ?? 'unknown'}`],
    producer: 'post-merge',
    dedupe_key: `${ROUTE_ID}:pr:${signal?.pr_number ?? 'unknown'}`,
    reason: routeDecisionReason({ route, routeEnabled, requestKindAllowed, consumerAllowed, modeAllowed, routeMatched, sideEffectsBlocked }),
    source_run_id: signal?.source_run_id ?? '',
    created_at: createdAt,
  };
}

function buildPostMergeRoadmapCloseoutReportEvidence({ routeDecision, closeoutPlan, signal, createdAt }) {
  return {
    schema: REPORT_EVIDENCE_SCHEMA,
    status: 'reported',
    created_at: createdAt,
    evidence_store: 'GitHub pull request comment',
    source_pr: signal?.pr_number ?? null,
    route_decision: routeDecision,
    closeout_plan: closeoutPlan,
    summary: `Post-merge roadmap closeout report for PR #${signal?.pr_number ?? 'unknown'}`,
    side_effects: {
      issue_fix_request_created: false,
      activation_request_created: false,
      workflow_dispatched: false,
      consumer_work_started: false,
      branch_deleted: false,
      carrier_issue_closed: false,
    },
    next_action: 'record-pr-comment-evidence',
  };
}

function normalizePrSignal(signal) {
  return {
    number: signal?.pr_number,
    merged: signal?.merged,
    headRefName: signal?.headRefName,
    headRepositoryOwner: signal?.headRepositoryOwner,
    baseRepositoryOwner: signal?.baseRepositoryOwner,
    baseRefName: signal?.baseRefName,
  };
}

function routeMatchesSignal(route, signal) {
  if (!route) return false;
  const match = route.match ?? {};
  return Object.entries(match).every(([key, allowedValues]) => {
    if (!Array.isArray(allowedValues) || allowedValues.length === 0) return true;
    return allowedValues.includes(signal?.[key]);
  });
}

function routeDecisionReason({ route, routeEnabled, requestKindAllowed, consumerAllowed, modeAllowed, routeMatched, sideEffectsBlocked }) {
  if (!route) return 'post-merge-roadmap-closeout-route-missing';
  if (!routeEnabled) return 'post-merge-roadmap-closeout-route-disabled';
  if (!requestKindAllowed) return 'post-merge-roadmap-closeout-request-kind-invalid';
  if (!consumerAllowed) return 'post-merge-roadmap-closeout-consumer-invalid';
  if (!modeAllowed) return 'post-merge-roadmap-closeout-mode-invalid';
  if (!routeMatched) return 'signal-does-not-match-route';
  if (!sideEffectsBlocked) return 'post-merge-roadmap-closeout-side-effects-enabled';
  return 'post-merge roadmap closeout route matched';
}

function stableHash(value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 12);
}

async function main() {
  const routeTablePath = process.env.ROUTE_TABLE_PATH || DEFAULT_ROUTE_TABLE;
  const suite = await runPostMergeRoadmapCloseoutReplaySuite({ routeTablePath });
  console.log(JSON.stringify(suite, null, 2));
  if (!suite.passed) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
