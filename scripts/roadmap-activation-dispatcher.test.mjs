import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { dispatchRoadmapActivationCommand } from './roadmap-activation-dispatcher.mjs';
import {
  ACTIVATION_KINDS,
  buildActivationConsumedComment,
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

test('Roadmap activation dispatcher returns resume-existing audit comment for consumed request', async () => {
  const request = buildActivationRequestComment({
    requestId: 'rsd-46-existing',
    sourceIssue: 46,
    pattern: 'roadmap-sliced-development',
    requestedBy: 'maintainer',
    requestedByPermission: 'write',
    requestedAt: '2026-07-06T00:00:00Z',
    commandCommentId: 1006,
    commandText: '/zj-loop start roadmap-sliced-development',
  });
  const consumed = buildActivationConsumedComment({
    requestId: 'rsd-46-existing',
    sourceIssue: 46,
    pattern: 'roadmap-sliced-development',
    consumedAt: '2026-07-06T00:02:00Z',
    roadmapBranch: 'zjal/activation-recovery',
    roadmapFile: 'docs/designs/tmp-activation-recovery-roadmap.md',
    roadmapView: 'docs/designs/tmp-activation-recovery-roadmap.md',
    nextAction: 'resume leaf 1',
  });
  const result = dispatchRoadmapActivationCommand({
    routeTableText: await routeTableText(),
    commandText: '/zj-loop start roadmap-sliced-development',
    requestedBy: 'maintainer',
    requestedByPermission: 'write',
    sourceIssue: 46,
    commandCommentId: 1007,
    comments: [{ id: 7, body: request }, { id: 8, body: consumed }],
    now: '2026-07-06T00:03:00Z',
  });
  const parsed = parseStructuredActivationComments([{ id: 9, body: result.commentBody }])[0];

  assert.equal(result.action, 'resume-existing');
  assert.equal(parsed.fields.kind, ACTIVATION_KINDS.resumeExisting);
  assert.equal(parsed.fields.request_id, 'rsd-46-existing');
  assert.equal(parsed.fields.consumed_comment_id, '8');
  assert.equal(parsed.fields.resume_policy, 'resume-without-new-activation');
});

test('Roadmap activation dispatcher returns resume-blocked audit comment for missing anchors', async () => {
  const request = buildActivationRequestComment({
    requestId: 'rsd-47-existing',
    sourceIssue: 47,
    pattern: 'roadmap-sliced-development',
    requestedBy: 'maintainer',
    requestedByPermission: 'write',
    requestedAt: '2026-07-06T00:00:00Z',
    commandCommentId: 1008,
    commandText: '/zj-loop start roadmap-sliced-development',
  });
  const consumed = `<!-- zj-loop
kind: ${ACTIVATION_KINDS.consumed}
version: 1
request_id: rsd-47-existing
source_issue: 47
pattern: roadmap-sliced-development
consumed_at: 2026-07-06T00:02:00Z
roadmap_branch: zjal/activation-recovery
-->`;
  const result = dispatchRoadmapActivationCommand({
    routeTableText: await routeTableText(),
    commandText: '/zj-loop start roadmap-sliced-development',
    requestedBy: 'maintainer',
    requestedByPermission: 'write',
    sourceIssue: 47,
    commandCommentId: 1009,
    comments: [{ id: 10, body: request }, { id: 11, body: consumed }],
    now: '2026-07-06T00:03:00Z',
  });
  const parsed = parseStructuredActivationComments([{ id: 12, body: result.commentBody }])[0];

  assert.equal(result.action, 'blocked');
  assert.equal(result.reason, 'missing-resume-anchors');
  assert.equal(parsed.fields.kind, ACTIVATION_KINDS.resumeBlocked);
  assert.equal(parsed.fields.reason, 'missing-resume-anchors');
  assert.equal(parsed.fields.missing_resume_anchors, 'roadmap_file,roadmap_view,next_action');
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
