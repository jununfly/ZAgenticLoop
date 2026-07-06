#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import {
  buildActivationDeniedComment,
  buildActivationDuplicateComment,
  buildActivationRequestComment,
  buildUnsupportedPatternComment,
  evaluateActivationCommand,
  parseStartCommand,
} from './zj-loop-activation-contract.mjs';
import { buildRoadmapActivationRouteDecision } from './roadmap-activation-e2e-replay.mjs';

const DEFAULT_ROUTE_TABLE = 'zj-loop/zj-loop-route-table.yaml';

export function dispatchRoadmapActivationCommand({
  routeTableText,
  commandText,
  requestedBy,
  requestedByPermission,
  sourceIssue,
  commandCommentId,
  comments = [],
  now = new Date().toISOString(),
  requestId = `rsd-${sourceIssue}-${stableTimestamp(now)}`,
} = {}) {
  const command = parseStartCommand(commandText);
  const routeDecision = buildRoadmapActivationRouteDecision({
    routeTableText,
    commandText,
    requestedByPermission,
    sourceIssue,
  });

  if (!routeDecision.allowed) {
    if (routeDecision.reason === 'insufficient-permission' && command.ok) {
      return {
        action: 'denied',
        routeDecision,
        commentBody: buildActivationDeniedComment({
          sourceIssue,
          pattern: command.pattern,
          deniedAt: now,
          commandCommentId,
          commandText,
          requestedBy,
          requestedByPermission,
          reason: routeDecision.reason,
        }),
      };
    }

    if (routeDecision.reason === 'unsupported-pattern') {
      return {
        action: 'unsupported-pattern',
        routeDecision,
        commentBody: buildUnsupportedPatternComment({
          sourceIssue,
          unsupportedPattern: command.pattern,
          commandCommentId,
          commandText,
          rejectedAt: now,
        }),
      };
    }

    return {
      action: 'route-denied',
      routeDecision,
      commentBody: null,
    };
  }

  const evaluation = evaluateActivationCommand({
    commandText,
    requestedByPermission,
    sourceIssue,
    comments,
  });

  if (evaluation.action === 'create-request') {
    return {
      action: 'create-request',
      routeDecision,
      commentBody: buildActivationRequestComment({
        requestId,
        sourceIssue,
        pattern: evaluation.pattern,
        requestedBy,
        requestedByPermission,
        requestedAt: now,
        commandCommentId,
        commandText,
      }),
    };
  }

  if (evaluation.action === 'duplicate') {
    return {
      action: 'duplicate',
      routeDecision,
      commentBody: buildActivationDuplicateComment({
        sourceIssue,
        pattern: evaluation.pattern,
        duplicateAt: now,
        commandCommentId,
        commandText,
        existingRequestId: evaluation.existingRequestId,
      }),
    };
  }

  return {
    action: evaluation.action,
    routeDecision,
    commentBody: null,
    reason: evaluation.reason,
  };
}

function stableTimestamp(value) {
  return String(value ?? '')
    .replace(/[^0-9A-Za-z]+/g, '')
    .slice(0, 14) || 'now';
}

async function main() {
  const routeTablePath = process.env.ROUTE_TABLE_PATH || DEFAULT_ROUTE_TABLE;
  const routeTableText = await readFile(routeTablePath, 'utf8');
  const comments = JSON.parse(process.env.ACTIVATION_COMMENTS_JSON || '[]');
  const result = dispatchRoadmapActivationCommand({
    routeTableText,
    commandText: process.env.COMMAND_TEXT,
    requestedBy: process.env.REQUESTED_BY,
    requestedByPermission: process.env.REQUESTED_BY_PERMISSION,
    sourceIssue: process.env.SOURCE_ISSUE,
    commandCommentId: process.env.COMMAND_COMMENT_ID,
    comments,
    now: process.env.NOW,
    requestId: process.env.REQUEST_ID,
  });

  if (process.env.ROUTE_DECISION_OUT) {
    await writeFile(process.env.ROUTE_DECISION_OUT, `${JSON.stringify(result.routeDecision, null, 2)}\n`);
  }
  if (process.env.ACTIVATION_COMMENT_OUT && result.commentBody) {
    await writeFile(process.env.ACTIVATION_COMMENT_OUT, result.commentBody);
  }
  if (process.env.GITHUB_OUTPUT) {
    const lines = [
      `action=${result.action}`,
      `route=${result.routeDecision.route ?? ''}`,
      `request_kind=${result.routeDecision.request_kind ?? ''}`,
      `target_consumer=${result.routeDecision.target_consumer ?? ''}`,
      `reason=${result.routeDecision.reason ?? result.reason ?? ''}`,
      `comment_created=${result.commentBody ? 'true' : 'false'}`,
    ];
    await writeFile(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`, { flag: 'a' });
  }
  console.log(JSON.stringify({
    action: result.action,
    routeDecision: result.routeDecision,
    commentCreated: Boolean(result.commentBody),
  }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
