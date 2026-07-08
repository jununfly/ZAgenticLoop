import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  buildActivationConsumedComment,
  buildActivationRequestComment,
  dispatchRoadmapActivationCommand,
  parseStructuredActivationComments,
} from '../dist/index.js';

const ROADMAP_ACTIVATION_CLI = fileURLToPath(new URL('../dist/roadmap-activation-cli.js', import.meta.url));

const ROUTE = {
  route_id: 'roadmap-sliced-development',
  consumer: 'roadmap-sliced-development',
  consumer_kind: 'activation-consumer',
  enabled: true,
  request_kind: 'activation-comment',
  execution_mode: 'request-only',
  side_effect_level: 'request',
  completion_forms: ['roadmap-branch-pr', 'activation-failed', 'activation-resumable'],
  maturity_protocol: 'user-project-ready',
  maturity_runner: 'user-project-ready',
  max_side_effect_level: 'branch',
  capability_scopes: [],
  capability_verifiers: [],
  recent_success_evidence: ['test'],
  readiness: 'user-project-ready',
  readiness_reasons: [],
  user_project_ready: true,
  section: 'routes',
  destructive: false,
  side_effecting: true,
};

function dispatch(overrides = {}) {
  return dispatchRoadmapActivationCommand({
    route: ROUTE,
    commandText: '/zj-loop start roadmap-sliced-development',
    requestedBy: 'maintainer',
    requestedByPermission: 'write',
    sourceIssue: 321,
    commandCommentId: 11,
    now: '2026-07-06T00:00:00Z',
    ...overrides,
  });
}

test('Roadmap Activation creates activation request comments for allowed commands', () => {
  const result = dispatch();
  const parsed = parseStructuredActivationComments([{ id: 99, body: result.commentBody }])[0];

  assert.equal(result.action, 'create-request');
  assert.equal(result.routeDecision.request_kind, 'activation-comment');
  assert.equal(result.routeDecision.allowed, true);
  assert.equal(parsed.fields.kind, 'zj-loop.activation-request');
  assert.equal(parsed.fields.pattern, 'roadmap-sliced-development');
});

test('Roadmap Activation returns duplicate and resume comments instead of new requests', () => {
  const pendingComment = buildActivationRequestComment({
    requestId: 'rsd-321-001',
    sourceIssue: 321,
    pattern: 'roadmap-sliced-development',
    requestedBy: 'maintainer',
    requestedByPermission: 'write',
    requestedAt: '2026-07-06T00:00:00Z',
    commandCommentId: 10,
    commandText: '/zj-loop start roadmap-sliced-development',
  });
  const duplicate = dispatch({ comments: [{ id: 1, body: pendingComment }] });
  const consumedComment = buildActivationConsumedComment({
    requestId: 'rsd-322-001',
    sourceIssue: 322,
    pattern: 'roadmap-sliced-development',
    consumedAt: '2026-07-06T00:02:00Z',
    roadmapBranch: 'zjal/issue-322',
    roadmapFile: 'docs/designs/tmp-issue-322-roadmap.md',
    roadmapView: 'docs/designs/tmp-issue-322-roadmap.md',
    nextAction: 'resume roadmap slice 1-1',
  });
  const resume = dispatch({
    sourceIssue: 322,
    comments: [{ id: 1, body: buildActivationRequestComment({
      requestId: 'rsd-322-001',
      sourceIssue: 322,
      pattern: 'roadmap-sliced-development',
      requestedBy: 'maintainer',
      requestedByPermission: 'write',
      requestedAt: '2026-07-06T00:00:00Z',
      commandCommentId: 10,
      commandText: '/zj-loop start roadmap-sliced-development',
    }) }, { id: 2, body: consumedComment }],
  });

  assert.equal(duplicate.action, 'duplicate');
  assert.match(duplicate.commentBody, /kind: zj-loop.activation-duplicate/);
  assert.equal(resume.action, 'resume-existing');
  assert.match(resume.commentBody, /resume_policy: resume-without-new-activation/);
});

test('Roadmap Activation denies non-maintainer permissions with audit comment', () => {
  const result = dispatch({ requestedByPermission: 'read' });

  assert.equal(result.action, 'denied');
  assert.equal(result.routeDecision.allowed, false);
  assert.match(result.commentBody, /kind: zj-loop.activation-denied/);
});

test('Roadmap Activation activation-plan CLI reads route table and writes comment', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-roadmap-activation-'));
  const root = path.join(dir, 'project');
  const commentPath = path.join(dir, 'activation-comment.md');
  await mkdir(path.join(root, 'zj-loop'), { recursive: true });
  await writeFile(path.join(root, 'zj-loop', 'zj-loop-route-table.yaml'), [
    'kind: zj-loop-route-table',
    'schemaVersion: 1',
    'routes:',
    '  - route_id: roadmap-sliced-development',
    '    enabled: true',
    '    request_kind: activation-comment',
    '    consumer: roadmap-sliced-development',
    '    consumer_kind: activation-consumer',
    '    execution:',
    '      mode: request-only',
    '      side_effect_level: request',
    '      completion_forms: [roadmap-branch-pr, activation-failed, activation-resumable]',
    '      recent_success_evidence: [test]',
    '    maturity:',
    '      protocol: user-project-ready',
    '      runner: user-project-ready',
    '    capabilities:',
    '      max_side_effect_level: branch',
  ].join('\n'));
  try {
    const result = spawnSync(process.execPath, [
      ROADMAP_ACTIVATION_CLI,
      'activation-plan',
      '--root',
      root,
      '--command-text',
      '/zj-loop start roadmap-sliced-development',
      '--requested-by',
      'maintainer',
      '--permission',
      'write',
      '--source-issue',
      '321',
      '--command-comment-id',
      '11',
      '--comment-out',
      commentPath,
      '--json',
    ], { encoding: 'utf8' });
    assert.equal(result.status, 0);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.action, 'create-request');
    assert.equal(parsed.commentCreated, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
