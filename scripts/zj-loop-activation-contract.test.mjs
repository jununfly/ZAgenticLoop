import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ACTIVATION_KINDS,
  buildActivationConsumedComment,
  buildActivationDeniedComment,
  buildActivationDuplicateComment,
  buildActivationFailedComment,
  buildActivationRequestComment,
  buildUnsupportedPatternComment,
  deriveActivationState,
  evaluateActivationCommand,
  parseStartCommand,
  parseStructuredActivationComments,
} from './zj-loop-activation-contract.mjs';

const BASE_COMMAND = '/zj-loop start roadmap-sliced-development';

function comment(id, body) {
  return {
    id,
    author: `user-${id}`,
    createdAt: `2026-07-05T00:00:0${id}Z`,
    body,
  };
}

function requestComment({ requestId = 'rsd-123-001', commentId = 10 } = {}) {
  return buildActivationRequestComment({
    requestId,
    sourceIssue: 123,
    pattern: 'roadmap-sliced-development',
    requestedBy: 'maintainer',
    requestedByPermission: 'write',
    requestedAt: '2026-07-05T00:00:00Z',
    commandCommentId: commentId,
    commandText: BASE_COMMAND,
  });
}

test('parseStartCommand accepts only the first-version parameterless roadmap command', () => {
  assert.deepEqual(parseStartCommand(BASE_COMMAND), {
    ok: true,
    commandText: BASE_COMMAND,
    pattern: 'roadmap-sliced-development',
  });

  assert.equal(parseStartCommand('/zj-loop start roadmap-sliced-development --id foo').ok, false);
  assert.equal(parseStartCommand('/zj-loop start daily-triage').reason, 'unsupported-pattern');
  assert.equal(parseStartCommand('/zj-loop run roadmap-sliced-development').reason, 'invalid-command-shape');
});

test('evaluateActivationCommand denies insufficient GitHub permissions', () => {
  assert.deepEqual(
    evaluateActivationCommand({
      commandText: BASE_COMMAND,
      requestedByPermission: 'triage',
      sourceIssue: 123,
      comments: [],
    }),
    {
      action: 'denied',
      pattern: 'roadmap-sliced-development',
      reason: 'insufficient-permission',
    },
  );
});

test('evaluateActivationCommand creates a request when no pending request exists', () => {
  assert.deepEqual(
    evaluateActivationCommand({
      commandText: BASE_COMMAND,
      requestedByPermission: 'maintain',
      sourceIssue: 123,
      comments: [],
    }),
    {
      action: 'create-request',
      pattern: 'roadmap-sliced-development',
    },
  );
});

test('evaluateActivationCommand returns duplicate while a pending request exists', () => {
  const existing = comment(1, requestComment());

  assert.deepEqual(
    evaluateActivationCommand({
      commandText: BASE_COMMAND,
      requestedByPermission: 'write',
      sourceIssue: 123,
      comments: [existing],
    }),
    {
      action: 'duplicate',
      pattern: 'roadmap-sliced-development',
      existingRequestId: 'rsd-123-001',
    },
  );
});

test('failed terminal requests allow a new activation request', () => {
  const existing = comment(1, requestComment());
  const failed = comment(
    2,
    `<!-- zj-loop
kind: ${ACTIVATION_KINDS.failed}
version: 1
request_id: rsd-123-001
source_issue: 123
pattern: roadmap-sliced-development
failed_at: 2026-07-05T00:01:00Z
reason: malformed-request
-->`,
  );

  const state = deriveActivationState([existing, failed], {
    sourceIssue: 123,
    pattern: 'roadmap-sliced-development',
  });

  assert.equal(state.requests[0].currentState, 'failed');
  assert.deepEqual(
    evaluateActivationCommand({
      commandText: BASE_COMMAND,
      requestedByPermission: 'write',
      sourceIssue: 123,
      comments: [existing, failed],
    }),
    {
      action: 'create-request',
      pattern: 'roadmap-sliced-development',
    },
  );
});

test('consumed lifecycle comments require resume anchors and derive consumed state', () => {
  const existing = comment(1, requestComment());
  const consumedBody = buildActivationConsumedComment({
    requestId: 'rsd-123-001',
    sourceIssue: 123,
    pattern: 'roadmap-sliced-development',
    consumedAt: '2026-07-05T00:02:00Z',
    roadmapBranch: 'zjal/issue-123',
    roadmapFile: 'docs/plans/issue-123-roadmap.json',
    roadmapView: 'docs/plans/issue-123-roadmap.md',
    nextAction: 'resume roadmap slice 1-1',
  });
  const consumed = comment(2, consumedBody);

  const parsed = parseStructuredActivationComments([consumed]);
  assert.equal(parsed[0].fields.roadmap_branch, 'zjal/issue-123');
  assert.equal(parsed[0].fields.roadmap_file, 'docs/plans/issue-123-roadmap.json');
  assert.equal(parsed[0].fields.roadmap_view, 'docs/plans/issue-123-roadmap.md');
  assert.equal(parsed[0].fields.next_action, 'resume roadmap slice 1-1');

  const state = deriveActivationState([existing, consumed], {
    sourceIssue: 123,
    pattern: 'roadmap-sliced-development',
  });
  assert.equal(state.requests[0].currentState, 'consumed');
});

test('ambiguous lifecycle state blocks new activation', () => {
  const existing = comment(1, requestComment());
  const consumed = comment(
    2,
    `<!-- zj-loop
kind: ${ACTIVATION_KINDS.consumed}
version: 1
request_id: rsd-123-001
source_issue: 123
pattern: roadmap-sliced-development
consumed_at: 2026-07-05T00:02:00Z
-->`,
  );
  const failed = comment(
    3,
    `<!-- zj-loop
kind: ${ACTIVATION_KINDS.failed}
version: 1
request_id: rsd-123-001
source_issue: 123
pattern: roadmap-sliced-development
failed_at: 2026-07-05T00:03:00Z
reason: later-failure
-->`,
  );

  assert.deepEqual(
    evaluateActivationCommand({
      commandText: BASE_COMMAND,
      requestedByPermission: 'write',
      sourceIssue: 123,
      comments: [existing, consumed, failed],
    }),
    {
      action: 'blocked',
      pattern: 'roadmap-sliced-development',
      reason: 'ambiguous-activation-state',
      inconsistentRequestIds: ['rsd-123-001'],
    },
  );
});

test('fixed lifecycle outcome comments are parseable and carry audit fields', () => {
  const failed = parseStructuredActivationComments([
    comment(1, buildActivationFailedComment({
      requestId: 'rsd-123-001',
      sourceIssue: 123,
      pattern: 'roadmap-sliced-development',
      failedAt: '2026-07-05T00:04:00Z',
      reason: 'malformed-request',
      nextAction: 'create a new activation request',
    })),
  ]);
  assert.equal(failed[0].fields.kind, ACTIVATION_KINDS.failed);
  assert.equal(failed[0].fields.next_action, 'create a new activation request');

  const denied = parseStructuredActivationComments([
    comment(2, buildActivationDeniedComment({
      sourceIssue: 123,
      pattern: 'roadmap-sliced-development',
      deniedAt: '2026-07-05T00:05:00Z',
      commandCommentId: 22,
      commandText: BASE_COMMAND,
      requestedBy: 'reader',
      requestedByPermission: 'read',
    })),
  ]);
  assert.equal(denied[0].fields.kind, ACTIVATION_KINDS.denied);
  assert.equal(denied[0].fields.requested_by_permission, 'read');

  const duplicate = parseStructuredActivationComments([
    comment(3, buildActivationDuplicateComment({
      sourceIssue: 123,
      pattern: 'roadmap-sliced-development',
      duplicateAt: '2026-07-05T00:06:00Z',
      commandCommentId: 23,
      commandText: BASE_COMMAND,
      existingRequestId: 'rsd-123-001',
    })),
  ]);
  assert.equal(duplicate[0].fields.kind, ACTIVATION_KINDS.duplicate);
  assert.equal(duplicate[0].fields.existing_request_id, 'rsd-123-001');

  const unsupported = parseStructuredActivationComments([
    comment(4, buildUnsupportedPatternComment({
      sourceIssue: 123,
      unsupportedPattern: 'daily-triage',
      rejectedAt: '2026-07-05T00:07:00Z',
      commandCommentId: 24,
      commandText: '/zj-loop start daily-triage',
    })),
  ]);
  assert.equal(unsupported[0].fields.kind, ACTIVATION_KINDS.unsupportedPattern);
  assert.equal(unsupported[0].fields.unsupported_pattern, 'daily-triage');
});
