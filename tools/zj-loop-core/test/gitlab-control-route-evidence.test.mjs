import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildGitLabControlRouteEvidence } from '../dist/index.js';

const CLI = fileURLToPath(new URL('../dist/route-cli.js', import.meta.url));

const base = {
  projectPath: 'example-group/product-project',
  orchestrationId: 'orch_gitlab_control_1',
  signal: {
    source: 'gitlab-protocol',
    signal_id: 'sig-control-1',
    project: 'example-group/product-project',
  },
};

test('GitLab human control route emits unified evidence with human handoff artifact', () => {
  const result = buildGitLabControlRouteEvidence({
    ...base,
    routeId: 'human',
    reason: 'high-risk-review-required',
  });

  assert.equal(result.schema, 'zj-loop.gitlab_control_route_evidence.v1');
  assert.equal(result.status, 'completed');
  assert.equal(result.route_id, 'human');
  assert.equal(result.provider, 'gitlab');
  assert.equal(result.project, 'example-group/product-project');
  assert.equal(result.outcome, 'human-handoff');
  assert.equal(result.side_effects_executed, false);
  assert.equal(result.artifact.schema, 'zj-loop.human_handoff.v1');
  assert.equal(result.artifact.confirmation_location, 'not-required');
  assert.equal(result.recovery.status, 'resumable');
  assert.equal(result.verification.passed, true);
  assert.match(result.compatibility_fingerprint, /^[a-f0-9]{64}$/);
  assert.deepEqual(result.next_steps, [
    ['zj-loop-dispatch', '--orchestration', 'orch_gitlab_control_1', '--mode', 'resume'],
  ]);
});

test('GitLab ignore control route emits a suppression route-decision artifact', () => {
  const result = buildGitLabControlRouteEvidence({
    ...base,
    routeId: 'ignore',
    reason: 'noise-suppressed',
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.outcome, 'suppressed');
  assert.equal(result.artifact.schema, 'zj-loop.route_decision.v1');
  assert.equal(result.artifact.requested_action, 'ignore');
  assert.equal(result.artifact.allowed, false);
  assert.equal(result.artifact.reason, 'noise-suppressed');
  assert.equal(result.side_effects_executed, false);
  assert.equal(result.recovery.status, 'resumable');
});

test('GitLab control evidence fails closed for malformed source, unknown route, and side effects', () => {
  const malformed = buildGitLabControlRouteEvidence({
    ...base,
    routeId: 'human',
    signal: { ...base.signal, source: 'workflow-dispatch' },
    reason: 'invalid-source',
  });
  assert.equal(malformed.status, 'blocked');
  assert.equal(malformed.reason, 'gitlab-source-required');
  assert.equal(malformed.side_effects_executed, false);

  const unknown = buildGitLabControlRouteEvidence({
    ...base,
    routeId: 'manual-smoke-report',
    reason: 'not-a-control-route',
  });
  assert.equal(unknown.status, 'blocked');
  assert.equal(unknown.reason, 'unsupported-control-route');
  assert.equal(unknown.side_effects_executed, false);

  const sideEffect = buildGitLabControlRouteEvidence({
    ...base,
    routeId: 'ignore',
    reason: 'must-not-write',
    requestedSideEffect: 'issue-comment',
  });
  assert.equal(sideEffect.status, 'blocked');
  assert.equal(sideEffect.reason, 'control-route-side-effect-forbidden');
  assert.equal(sideEffect.side_effects_executed, false);
});

test('zj-loop-route control-evidence CLI emits the unified artifact', () => {
  const result = spawnSync(process.execPath, [
    CLI,
    'control-evidence',
    'ignore',
    '--project',
    'example-group/product-project',
    '--orchestration',
    'orch_cli_control_1',
    '--signal-id',
    'sig-cli-control-1',
    '--source',
    'gitlab-protocol',
    '--reason',
    'cli-suppressed',
    '--json',
  ], { encoding: 'utf8' });

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.schema, 'zj-loop.gitlab_control_route_evidence.v1');
  assert.equal(output.outcome, 'suppressed');
  assert.equal(output.side_effects_executed, false);
});
