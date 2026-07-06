import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { dispatchRoadmapActivationCommand } from './roadmap-activation-dispatcher.mjs';
import {
  buildActivationRequestComment,
  parseStructuredActivationComments,
} from './zj-loop-activation-contract.mjs';

const ROUTE_TABLE_PATH = 'zj-loop/zj-loop-route-table.yaml';

async function routeTableText() {
  return readFile(ROUTE_TABLE_PATH, 'utf8');
}

test('Roadmap activation dispatcher creates request comment from enabled route', async () => {
  const result = dispatchRoadmapActivationCommand({
    routeTableText: await routeTableText(),
    commandText: '/zj-loop start roadmap-sliced-development',
    requestedBy: 'maintainer',
    requestedByPermission: 'write',
    sourceIssue: 42,
    commandCommentId: 1001,
    now: '2026-07-06T00:00:00Z',
    requestId: 'rsd-42-test',
  });
  const parsed = parseStructuredActivationComments([{ id: 1, body: result.commentBody }])[0];

  assert.equal(result.action, 'create-request');
  assert.equal(result.routeDecision.allowed, true);
  assert.equal(result.routeDecision.request_kind, 'activation-comment');
  assert.equal(parsed.fields.kind, 'zj-loop.activation-request');
  assert.equal(parsed.fields.request_id, 'rsd-42-test');
});

test('Roadmap activation dispatcher returns duplicate comment for active pending request', async () => {
  const existingComment = buildActivationRequestComment({
    requestId: 'rsd-43-existing',
    sourceIssue: 43,
    pattern: 'roadmap-sliced-development',
    requestedBy: 'maintainer',
    requestedByPermission: 'write',
    requestedAt: '2026-07-06T00:00:00Z',
    commandCommentId: 1002,
    commandText: '/zj-loop start roadmap-sliced-development',
  });
  const result = dispatchRoadmapActivationCommand({
    routeTableText: await routeTableText(),
    commandText: '/zj-loop start roadmap-sliced-development',
    requestedBy: 'maintainer',
    requestedByPermission: 'write',
    sourceIssue: 43,
    commandCommentId: 1003,
    comments: [{ id: 7, body: existingComment }],
    now: '2026-07-06T00:00:00Z',
  });
  const parsed = parseStructuredActivationComments([{ id: 2, body: result.commentBody }])[0];

  assert.equal(result.action, 'duplicate');
  assert.equal(parsed.fields.kind, 'zj-loop.activation-duplicate');
  assert.equal(parsed.fields.existing_request_id, 'rsd-43-existing');
});

test('Roadmap activation dispatcher rejects unauthorized request with audit comment', async () => {
  const result = dispatchRoadmapActivationCommand({
    routeTableText: await routeTableText(),
    commandText: '/zj-loop start roadmap-sliced-development',
    requestedBy: 'reader',
    requestedByPermission: 'read',
    sourceIssue: 44,
    commandCommentId: 1004,
    now: '2026-07-06T00:00:00Z',
  });
  const parsed = parseStructuredActivationComments([{ id: 3, body: result.commentBody }])[0];

  assert.equal(result.action, 'denied');
  assert.equal(result.routeDecision.reason, 'insufficient-permission');
  assert.equal(parsed.fields.kind, 'zj-loop.activation-denied');
});

test('Roadmap activation dispatcher denies disabled route without lifecycle comment', async () => {
  const disabledRouteTableText = (await routeTableText()).replace(
    /route_id: "roadmap-sliced-development"\n    enabled: true/,
    'route_id: "roadmap-sliced-development"\n    enabled: false',
  );
  const result = dispatchRoadmapActivationCommand({
    routeTableText: disabledRouteTableText,
    commandText: '/zj-loop start roadmap-sliced-development',
    requestedBy: 'maintainer',
    requestedByPermission: 'write',
    sourceIssue: 45,
    commandCommentId: 1005,
    now: '2026-07-06T00:00:00Z',
  });

  assert.equal(result.action, 'route-denied');
  assert.equal(result.routeDecision.reason, 'roadmap-activation-route-disabled');
  assert.equal(result.commentBody, null);
});
