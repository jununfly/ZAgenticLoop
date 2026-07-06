#!/usr/bin/env node
import { fileURLToPath } from 'node:url';

import {
  buildActivationRequestComment,
  evaluateActivationCommand,
  parseStructuredActivationComments,
} from './zj-loop-activation-contract.mjs';
import { ROUTE_DECISION_SCHEMA } from './issue-fix-request-contract.mjs';

export const DEFAULT_ROADMAP_ACTIVATION_REPLAY_SCENARIOS = [
  {
    name: 'activation-created',
    commandText: '/zj-loop start roadmap-sliced-development',
    requestedByPermission: 'write',
    sourceIssue: 321,
    expectOutcome: 'activation-request',
  },
  {
    name: 'activation-denied-permission',
    commandText: '/zj-loop start roadmap-sliced-development',
    requestedByPermission: 'read',
    sourceIssue: 322,
    expectOutcome: 'denied',
  },
  {
    name: 'activation-duplicate',
    commandText: '/zj-loop start roadmap-sliced-development',
    requestedByPermission: 'write',
    sourceIssue: 323,
    comments: [{
      id: 1,
      body: buildActivationRequestComment({
        requestId: 'rsd-323-001',
        sourceIssue: 323,
        pattern: 'roadmap-sliced-development',
        requestedBy: 'maintainer',
        requestedByPermission: 'write',
        requestedAt: '2026-07-06T00:00:00Z',
        commandCommentId: 11,
        commandText: '/zj-loop start roadmap-sliced-development',
      }),
    }],
    expectOutcome: 'duplicate',
  },
];

export function replayRoadmapActivation(scenario) {
  const decision = buildActivationRouteDecision(scenario);
  const evaluation = evaluateActivationCommand({
    commandText: scenario.commandText,
    requestedByPermission: scenario.requestedByPermission,
    sourceIssue: scenario.sourceIssue,
    comments: scenario.comments ?? [],
  });
  const steps = [
    { name: 'daily-triage-signal', status: 'observed', source_issue: scenario.sourceIssue },
    {
      name: 'route-decision',
      status: decision.allowed ? 'allowed' : 'denied',
      request_kind: decision.request_kind,
      target_consumer: decision.target_consumer,
    },
  ];

  if (evaluation.action === 'create-request') {
    const activationBody = buildActivationRequestComment({
      requestId: `rsd-${scenario.sourceIssue}-replay`,
      sourceIssue: scenario.sourceIssue,
      pattern: evaluation.pattern,
      requestedBy: 'daily-triage',
      requestedByPermission: scenario.requestedByPermission,
      requestedAt: '2026-07-06T00:00:00Z',
      commandCommentId: 'replay',
      commandText: scenario.commandText,
    });
    const activation = parseStructuredActivationComments([{ id: 99, body: activationBody }])[0];
    steps.push({ name: 'activation-request', status: 'pending', request_id: activation.fields.request_id });
    return {
      schemaVersion: 1,
      kind: 'zj-loop-roadmap-activation-e2e-replay',
      outcome: 'activation-request',
      routeDecision: decision,
      activation,
      steps,
    };
  }

  steps.push({ name: `activation-${evaluation.action}`, status: evaluation.action });
  return {
    schemaVersion: 1,
    kind: 'zj-loop-roadmap-activation-e2e-replay',
    outcome: evaluation.action,
    routeDecision: decision,
    activation: null,
    steps,
  };
}

export function runRoadmapActivationReplaySuite(scenarios = DEFAULT_ROADMAP_ACTIVATION_REPLAY_SCENARIOS) {
  const results = scenarios.map((scenario) => {
    const replay = replayRoadmapActivation(scenario);
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
    kind: 'zj-loop-roadmap-activation-e2e-replay-suite',
    passed: results.every((result) => result.pass),
    results,
  };
}

function buildActivationRouteDecision(scenario) {
  return {
    schema: ROUTE_DECISION_SCHEMA,
    decision_id: `rd_activation_${scenario.sourceIssue}`,
    source_signal_id: `issue:${scenario.sourceIssue}:activation-command`,
    route_id: 'roadmap-sliced-development',
    request_kind: 'activation-comment',
    target_consumer: 'roadmap-sliced-development',
    allowed: scenario.requestedByPermission !== 'read',
    guards: {
      route_enabled: true,
      permission_allowed: scenario.requestedByPermission !== 'read',
      consumer_allowed: true,
    },
    dedupe_key: `issue:${scenario.sourceIssue}:roadmap-sliced-development`,
    reason: scenario.requestedByPermission === 'read' ? 'insufficient-permission' : 'activation route matched',
    source_run_id: `issue-${scenario.sourceIssue}`,
    created_at: '2026-07-06T00:00:00Z',
  };
}

async function main() {
  const suite = runRoadmapActivationReplaySuite();
  console.log(JSON.stringify(suite, null, 2));
  if (!suite.passed) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
