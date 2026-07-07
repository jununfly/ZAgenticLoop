#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import {
  ACTIVATION_KINDS,
  buildActivationConsumedComment,
  buildActivationFailedComment,
  buildActivationRequestComment,
  evaluateActivationCommand,
  parseStructuredActivationComments,
  parseStartCommand,
} from './zj-loop-activation-contract.mjs';
import { ROUTE_DECISION_SCHEMA } from './issue-fix-request-contract.mjs';
import { findRoute } from './route-ci-failure.mjs';

const DEFAULT_ROUTE_TABLE = 'zj-loop/zj-loop-route-table.yaml';

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
  {
    name: 'activation-resume-existing',
    commandText: '/zj-loop start roadmap-sliced-development',
    requestedByPermission: 'write',
    sourceIssue: 325,
    comments: activationLifecycleComments({
      sourceIssue: 325,
      requestId: 'rsd-325-001',
      lifecycle: 'consumed',
    }),
    expectOutcome: 'resume-existing',
  },
  {
    name: 'activation-resume-blocked-missing-anchors',
    commandText: '/zj-loop start roadmap-sliced-development',
    requestedByPermission: 'write',
    sourceIssue: 326,
    comments: activationLifecycleComments({
      sourceIssue: 326,
      requestId: 'rsd-326-001',
      lifecycle: 'consumed-missing-anchors',
    }),
    expectOutcome: 'blocked',
  },
  {
    name: 'activation-failed-retry',
    commandText: '/zj-loop start roadmap-sliced-development',
    requestedByPermission: 'write',
    sourceIssue: 327,
    comments: activationLifecycleComments({
      sourceIssue: 327,
      requestId: 'rsd-327-001',
      lifecycle: 'failed',
    }),
    expectOutcome: 'activation-request',
  },
  {
    name: 'activation-ambiguous-blocked',
    commandText: '/zj-loop start roadmap-sliced-development',
    requestedByPermission: 'write',
    sourceIssue: 328,
    comments: activationLifecycleComments({
      sourceIssue: 328,
      requestId: 'rsd-328-001',
      lifecycle: 'ambiguous',
    }),
    expectOutcome: 'blocked',
  },
];

export function buildRoadmapActivationRouteDecision({
  routeTableText,
  commandText,
  requestedByPermission,
  sourceIssue,
  producer = 'daily-triage',
  sourceRunId = 'roadmap-activation-replay',
} = {}) {
  const command = parseStartCommand(commandText);
  const route = findRoute(routeTableText, 'roadmap-sliced-development');
  const normalizedPermission = String(requestedByPermission ?? '').toLowerCase();
  const routeEnabled = route?.enabled === true;
  const requestKindAllowed = route?.request_kind === 'activation-comment';
  const consumerAllowed = route?.consumer === 'roadmap-sliced-development';
  const allowedPermissions = Array.isArray(route?.guards?.allowed_permissions)
    ? route.guards.allowed_permissions.map((permission) => String(permission).toLowerCase())
    : ['admin', 'maintain', 'write'];
  const permissionAllowed = allowedPermissions.includes(normalizedPermission);
  const signalId = `issue:${sourceIssue}:activation-command`;
  const allowed = command.ok && routeEnabled && requestKindAllowed && consumerAllowed && permissionAllowed;
  const reason = routeDecisionReason({
    command,
    route,
    routeEnabled,
    requestKindAllowed,
    consumerAllowed,
    permissionAllowed,
  });

  return {
    schema: ROUTE_DECISION_SCHEMA,
    decision_id: `rd_activation_${stableHash(`${signalId}:${command.pattern ?? command.commandText}`)}`,
    source_signal_id: signalId,
    signal_id: signalId,
    source: 'issue',
    subject: `issue #${sourceIssue}`,
    priority: 'P2',
    state: 'none',
    route: 'roadmap-sliced-development',
    request_kind: route?.request_kind ?? 'activation-comment',
    requested_action: 'activate',
    target_consumer: route?.consumer ?? 'roadmap-sliced-development',
    allowed,
    status: allowed ? 'pending' : 'denied',
    guards: {
      route_enabled: routeEnabled,
      request_kind_allowed: requestKindAllowed,
      permission_allowed: permissionAllowed,
      consumer_allowed: consumerAllowed,
    },
    risk: 'medium',
    confidence: allowed ? 'high' : 'medium',
    evidence: [`issue:${sourceIssue}`],
    producer,
    dedupe_key: `issue:${sourceIssue}:roadmap-sliced-development`,
    reason,
    source_run_id: sourceRunId,
    created_at: '2026-07-06T00:00:00Z',
  };
}

export function replayRoadmapActivation({ routeTableText, scenario }) {
  const decision = buildRoadmapActivationRouteDecision({
    routeTableText,
    commandText: scenario.commandText,
    requestedByPermission: scenario.requestedByPermission,
    sourceIssue: scenario.sourceIssue,
  });
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

  if (!decision.allowed) {
    steps.push({ name: 'activation-route-denied', status: 'denied', reason: decision.reason });
    return {
      schemaVersion: 1,
      kind: 'zj-loop-roadmap-activation-e2e-replay',
      outcome: decision.reason === 'insufficient-permission' ? 'denied' : 'route-denied',
      routeDecision: decision,
      activation: null,
      steps,
    };
  }

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

  if (evaluation.action === 'resume-existing') {
    steps.push({
      name: 'activation-resume-existing',
      status: 'audit-only',
      request_id: evaluation.existingRequestId,
      consumed_comment_id: evaluation.consumedCommentId,
      next_action: evaluation.resumeAnchors.nextAction,
    });
    return {
      schemaVersion: 1,
      kind: 'zj-loop-roadmap-activation-e2e-replay',
      outcome: 'resume-existing',
      routeDecision: decision,
      activation: null,
      resume: {
        request_id: evaluation.existingRequestId,
        consumed_comment_id: evaluation.consumedCommentId,
        resume_policy: 'resume-without-new-activation',
        anchors: evaluation.resumeAnchors,
      },
      steps,
    };
  }

  if (evaluation.action === 'blocked') {
    steps.push({
      name: 'activation-blocked',
      status: 'blocked',
      reason: evaluation.reason,
      request_id: evaluation.existingRequestId ?? null,
    });
    return {
      schemaVersion: 1,
      kind: 'zj-loop-roadmap-activation-e2e-replay',
      outcome: 'blocked',
      routeDecision: decision,
      activation: null,
      resume: null,
      reason: evaluation.reason,
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

function activationLifecycleComments({ sourceIssue, requestId, lifecycle }) {
  const request = {
    id: 1,
    body: buildActivationRequestComment({
      requestId,
      sourceIssue,
      pattern: 'roadmap-sliced-development',
      requestedBy: 'maintainer',
      requestedByPermission: 'write',
      requestedAt: '2026-07-06T00:00:00Z',
      commandCommentId: 11,
      commandText: '/zj-loop start roadmap-sliced-development',
    }),
  };
  if (lifecycle === 'failed') {
    return [request, {
      id: 2,
      body: buildActivationFailedComment({
        requestId,
        sourceIssue,
        pattern: 'roadmap-sliced-development',
        failedAt: '2026-07-06T00:02:00Z',
        reason: 'malformed-request',
        nextAction: 'create a new activation request',
      }),
    }];
  }
  if (lifecycle === 'consumed') {
    return [request, {
      id: 2,
      body: buildActivationConsumedComment({
        requestId,
        sourceIssue,
        pattern: 'roadmap-sliced-development',
        consumedAt: '2026-07-06T00:02:00Z',
        roadmapBranch: `zjal/issue-${sourceIssue}`,
        roadmapFile: `docs/designs/tmp-issue-${sourceIssue}-roadmap.md`,
        roadmapView: `docs/designs/tmp-issue-${sourceIssue}-roadmap.md`,
        nextAction: 'resume roadmap slice 1-1',
      }),
    }];
  }
  if (lifecycle === 'consumed-missing-anchors') {
    return [request, {
      id: 2,
      body: `<!-- zj-loop
kind: ${ACTIVATION_KINDS.consumed}
version: 1
request_id: ${requestId}
source_issue: ${sourceIssue}
pattern: roadmap-sliced-development
consumed_at: 2026-07-06T00:02:00Z
roadmap_branch: zjal/issue-${sourceIssue}
-->`,
    }];
  }
  if (lifecycle === 'ambiguous') {
    return [
      ...activationLifecycleComments({ sourceIssue, requestId, lifecycle: 'consumed' }),
      {
        id: 3,
        body: buildActivationFailedComment({
          requestId,
          sourceIssue,
          pattern: 'roadmap-sliced-development',
          failedAt: '2026-07-06T00:03:00Z',
          reason: 'later-failure',
          nextAction: 'manual review',
        }),
      },
    ];
  }
  return [request];
}

export async function runRoadmapActivationReplaySuite({
  routeTablePath = DEFAULT_ROUTE_TABLE,
  routeTableText,
  scenarios = DEFAULT_ROADMAP_ACTIVATION_REPLAY_SCENARIOS,
} = {}) {
  const resolvedRouteTableText = routeTableText ?? await readFile(routeTablePath, 'utf8');
  const results = scenarios.map((scenario) => {
    const replay = replayRoadmapActivation({ routeTableText: resolvedRouteTableText, scenario });
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
    routeTablePath,
    passed: results.every((result) => result.pass),
    results,
  };
}

function routeDecisionReason({
  command,
  route,
  routeEnabled,
  requestKindAllowed,
  consumerAllowed,
  permissionAllowed,
}) {
  if (!command.ok) return command.reason;
  if (!route) return 'roadmap-activation-route-missing';
  if (!routeEnabled) return 'roadmap-activation-route-disabled';
  if (!requestKindAllowed) return 'roadmap-activation-request-kind-invalid';
  if (!consumerAllowed) return 'roadmap-activation-consumer-invalid';
  if (!permissionAllowed) return 'insufficient-permission';
  return 'activation route matched';
}

function stableHash(value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 12);
}

async function main() {
  const routeTablePath = process.env.ROUTE_TABLE_PATH || DEFAULT_ROUTE_TABLE;
  const suite = await runRoadmapActivationReplaySuite({ routeTablePath });
  console.log(JSON.stringify(suite, null, 2));
  if (!suite.passed) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
