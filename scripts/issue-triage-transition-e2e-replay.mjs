#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import {
  replayIssueBacklogTriage,
} from './issue-backlog-triage-e2e-replay.mjs';
import { findRoute } from './route-ci-failure.mjs';

import {
  runIssueTriageTransitionRunner,
} from '../tools/zj-loop-core/dist/index.js';

const DEFAULT_ROUTE_TABLE = 'zj-loop/zj-loop-route-table.yaml';

export const ISSUE_TRIAGE_TRANSITION_E2E_SCENARIOS = Object.freeze([
  {
    name: 'ready-for-agent-confirmed-plans-issue-fix-request',
    expectStatus: 'confirmed',
    signal: {
      signal_id: 'issue:126:agent-ready',
      source: 'issue',
      repo: 'jununfly/ZAgenticLoop',
      issue: 126,
      scan_window: 'open-issues:last-24h',
      signal_kind: 'label-suggestion-observation',
      subject: 'issue-126',
      summary: 'Issue #126 includes a narrow bug report, reproduction, and verification command.',
      category_role: 'bug',
      recommended_state: 'ready-for-agent',
      priority: 'P2',
      risk: 'medium',
      confidence: 'high',
      observed_label_candidates: ['bug', 'ready-for-agent'],
      evidence: ['https://github.com/jununfly/ZAgenticLoop/issues/126'],
    },
  },
  {
    name: 'needs-info-confirmed-stays-triage-only',
    expectStatus: 'confirmed',
    signal: {
      signal_id: 'issue:123:missing-info',
      source: 'issue',
      repo: 'jununfly/ZAgenticLoop',
      issue: 123,
      scan_window: 'open-issues:last-24h',
      signal_kind: 'missing-info-observation',
      subject: 'issue-123',
      summary: 'Issue #123 lacks reproduction and environment details.',
      priority: 'P2',
      risk: 'medium',
      confidence: 'high',
      missing: ['reproduction', 'environment'],
      evidence: ['https://github.com/jununfly/ZAgenticLoop/issues/123'],
    },
  },
  {
    name: 'wontfix-candidate-escalates',
    expectStatus: 'escalated',
    signal: {
      signal_id: 'issue:127:wontfix-candidate',
      source: 'issue',
      repo: 'jununfly/ZAgenticLoop',
      issue: 127,
      scan_window: 'open-issues:last-24h',
      signal_kind: 'human-attention-candidate',
      subject: 'issue-127',
      summary: 'Issue #127 appears outside the project scope.',
      category_role: 'enhancement',
      recommended_state: 'wontfix',
      priority: 'P3',
      risk: 'medium',
      confidence: 'medium',
      reason: 'outside documented project scope',
      evidence: ['https://github.com/jununfly/ZAgenticLoop/issues/127'],
    },
  },
]);

export async function runIssueTriageTransitionE2EReplaySuite({
  routeTablePath = DEFAULT_ROUTE_TABLE,
  routeTableText,
  scenarios = ISSUE_TRIAGE_TRANSITION_E2E_SCENARIOS,
} = {}) {
  const resolvedRouteTableText = routeTableText ?? await readFile(routeTablePath, 'utf8');
  const transitionRoute = routeStatusForIssueTriageTransition(resolvedRouteTableText);
  const results = scenarios.map((scenario) => {
    const backlogReplay = replayIssueBacklogTriage({
      routeTableText: resolvedRouteTableText,
      scenario,
    });
    const transitionReplay = backlogReplay.recommendedTriageTransition
      ? runIssueTriageTransitionRunner({
          route: transitionRoute,
          request: backlogReplay.recommendedTriageTransition,
          actorPermission: 'maintainer',
          command: backlogReplay.recommendedTriageTransition.confirm_command,
          confirmationPhrase: 'CONFIRM_TRIAGE_TRANSITION',
        })
      : null;
    const actual = transitionReplay?.decision?.status ?? 'not-run';
    const issueFixRequestPlanned = transitionReplay?.confirmed_transition?.issue_fix_request !== null;
    return {
      name: scenario.name,
      expected: scenario.expectStatus,
      actual,
      pass: actual === scenario.expectStatus && transitionReplay?.validation?.ok === true,
      chain: 'GitHub/GitLab Issues Backlog -> Route Decision -> Recommended Triage Transition -> Confirmed Triage Transition -> Issue Fix Request Plan',
      backlogReplay,
      transitionReplay,
      issueFixRequestPlanned,
    };
  });

  return {
    schemaVersion: 1,
    kind: 'zj-loop-issue-triage-transition-e2e-replay-suite',
    routeTablePath,
    passed: results.every((result) => result.pass),
    results,
  };
}

function routeStatusForIssueTriageTransition(routeTableText) {
  const route = findRoute(routeTableText, 'issue-triage-transition');
  if (!route) throw new Error('issue-triage-transition route not found');
  return {
    route_id: 'issue-triage-transition',
    consumer: route.consumer,
    consumer_kind: route.consumer_kind,
    enabled: route.enabled === true,
    request_kind: route.request_kind,
    execution_mode: route.execution?.mode,
    side_effect_level: route.execution?.side_effect_level,
    completion_forms: route.execution?.completion_forms ?? [],
    maturity_protocol: route.maturity?.protocol,
    maturity_runner: route.maturity?.runner,
    max_side_effect_level: route.capabilities?.max_side_effect_level,
    capability_scopes: route.capabilities?.scopes ?? [],
    capability_verifiers: route.capabilities?.verifiers ?? [],
    recent_success_evidence: route.execution?.recent_success_evidence ?? [],
    readiness: 'user-project-ready',
    readiness_reasons: [],
    user_project_ready: true,
    section: 'routes',
    destructive: false,
    side_effecting: true,
  };
}

async function main() {
  const routeTablePath = process.env.ROUTE_TABLE_PATH || DEFAULT_ROUTE_TABLE;
  const suite = await runIssueTriageTransitionE2EReplaySuite({ routeTablePath });
  console.log(JSON.stringify(suite, null, 2));
  if (!suite.passed) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
