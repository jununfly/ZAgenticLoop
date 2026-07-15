import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  buildDependencySweeperExecutionPlan,
  DEPENDENCY_SWEEPER_CONFIRMATION_PHRASE,
  executeDependencySweeperLiveRunner,
  validateDependencySweeperLiveRequest,
} from '../dist/index.js';

const DEPENDENCY_SWEEPER_CLI = fileURLToPath(new URL('../dist/dependency-sweeper-cli.js', import.meta.url));

function consumedDependencyRequest(overrides = {}) {
  const request = {
    schema: 'zj-loop.issue_fix_request.v1',
    request_id: 'ifr-dependency-yaml-1',
    status: 'consumed',
    created_at: '2026-07-07T00:00:00Z',
    source_signal: {
      kind: 'dependency-alert',
      id: 'dependency:npm:yaml:patch',
    },
    route_decision: {
      schema: 'zj-loop.route_decision.v1',
      route_id: 'dependency-sweeper',
      request_kind: 'issue-fix-request',
      target_consumer: 'dependency-sweeper',
      dedupe_key: 'dependency:npm:yaml:patch',
      risk: 'low',
    },
    dedupe_key: 'dependency:npm:yaml:patch',
    requested_consumer: {
      consumer_id: 'dependency-sweeper',
      capability: 'patch-dependency-fix',
    },
    fix_scope: {
      files_or_areas: ['package.json', 'package-lock.json'],
      non_goals: ['major upgrades', 'auto-merge'],
    },
    acceptance_criteria: ['Open a repair PR for the dependency patch.'],
    verification_gate: {
      commands: ['npm ci', 'npm test'],
    },
    failure_policy: {
      retry: 'new_request_only',
    },
    lifecycle: {
      consumed_by: 'dependency-sweeper',
    },
    subject: {
      type: 'dependency',
      repo: 'jununfly/ZAgenticLoop',
      ecosystem: 'npm',
      package_name: 'yaml',
      current_version: '2.7.0',
      target_version: '2.7.1',
      update_type: 'patch',
      dependency_section: 'dependencies',
      manifest_files: ['package.json', 'package-lock.json'],
    },
  };
  return {
    ...request,
    ...overrides,
    route_decision: { ...request.route_decision, ...(overrides.route_decision ?? {}) },
    requested_consumer: { ...request.requested_consumer, ...(overrides.requested_consumer ?? {}) },
    verification_gate: { ...request.verification_gate, ...(overrides.verification_gate ?? {}) },
    lifecycle: { ...request.lifecycle, ...(overrides.lifecycle ?? {}) },
    subject: { ...request.subject, ...(overrides.subject ?? {}) },
  };
}

test('dependency sweeper validates consumed issue fix requests', () => {
  const validation = validateDependencySweeperLiveRequest(consumedDependencyRequest());
  const wrongStatus = validateDependencySweeperLiveRequest(consumedDependencyRequest({ status: 'requested' }));

  assert.equal(validation.ok, true);
  assert.equal(wrongStatus.ok, false);
  assert.match(wrongStatus.errors.join('\n'), /status must be consumed/);
});

test('dependency sweeper builds deterministic dry-run and live repair plans', () => {
  const dryRun = buildDependencySweeperExecutionPlan({ request: consumedDependencyRequest() });
  const live = buildDependencySweeperExecutionPlan({
    request: consumedDependencyRequest(),
    live: true,
    confirmationPhrase: DEPENDENCY_SWEEPER_CONFIRMATION_PHRASE,
  });

  assert.equal(dryRun.status, 'dry-run');
  assert.equal(live.status, 'ready-for-live-execution');
  assert.deepEqual(live.actions.map((action) => action.name), [
    'create-branch',
    'update-dependency',
    'verify-1',
    'verify-2',
    'require-dependency-diff',
    'stage-files',
    'commit-repair',
    'push-branch',
    'create-repair-pr',
  ]);
  assert.deepEqual(live.actions[1].args, ['install', 'yaml@2.7.1', '--save-exact', '--save-prod']);
  assert.deepEqual(live.actions.at(-2).args, ['push', '-u', 'origin', live.branch, '--force-with-lease']);
});

test('dependency sweeper reuses an open repair PR without rewriting its branch', async () => {
  const existingRepairPullRequestUrl = 'https://github.com/jununfly/ZAgenticLoop/pull/999';
  const plan = buildDependencySweeperExecutionPlan({
    request: consumedDependencyRequest(),
    live: true,
    confirmationPhrase: DEPENDENCY_SWEEPER_CONFIRMATION_PHRASE,
    existingRepairPullRequestUrl,
  });

  assert.equal(plan.status, 'existing-repair-pr');
  assert.deepEqual(plan.actions, []);

  const result = await executeDependencySweeperLiveRunner(plan, {
    runner: async () => assert.fail('existing repair PR must not execute commands'),
  });
  assert.equal(result.outcome, 'repair-pr');
  assert.equal(result.runner_evidence.status, 'completed');
  assert.equal(result.runner_evidence.side_effects.executed, false);
  assert.equal(result.runner_evidence.repair_pull_request.url, existingRepairPullRequestUrl);
});

test('dependency sweeper carries GitLab provider metadata and refuses live MR side effects', () => {
  const request = consumedDependencyRequest({
    source_signal: {
      kind: 'dependency-alert',
      provider: 'gitlab',
      id: 'gitlab-dependency:npm:yaml:patch',
    },
    subject: {
      provider: 'gitlab',
      repo: 'group/project',
    },
  });
  const dryRun = buildDependencySweeperExecutionPlan({ request });
  const live = buildDependencySweeperExecutionPlan({
    request,
    live: true,
    confirmationPhrase: DEPENDENCY_SWEEPER_CONFIRMATION_PHRASE,
  });

  assert.equal(validateDependencySweeperLiveRequest(request).ok, true);
  assert.equal(dryRun.provider, 'gitlab');
  assert.equal(dryRun.subject.provider, 'gitlab');
  assert.deepEqual(dryRun.source_signal.provider_metadata, {
    dependency_alert_id: 'gitlab-dependency:npm:yaml:patch',
    dependency_alert_url: null,
  });
  assert.equal(live.status, 'refused');
  assert.ok(live.refusals.some((item) => item.reason === 'gitlab-live-repair-mr-side-effects-not-enabled'));
});

test('dependency sweeper live execution returns repair PR evidence after verifier pass', async () => {
  const plan = buildDependencySweeperExecutionPlan({
    request: consumedDependencyRequest(),
    live: true,
    confirmationPhrase: DEPENDENCY_SWEEPER_CONFIRMATION_PHRASE,
  });
  const result = await executeDependencySweeperLiveRunner(plan, {
    runner: async (command, args) => {
      if (command === 'git' && args[0] === 'diff') {
        return { command, args, exitCode: 1, stdout: '', stderr: '' };
      }
      return {
        command,
        args,
        exitCode: 0,
        stdout: command === 'gh' ? 'https://github.com/jununfly/ZAgenticLoop/pull/999\n' : '',
        stderr: '',
      };
    },
  });

  assert.equal(result.outcome, 'repair-pr');
  assert.equal(result.runner_evidence.completion_form, 'repair-pr');
  assert.equal(result.runner_evidence.status, 'completed');
  assert.equal(result.runner_evidence.side_effects.level, 'pr');
  assert.equal(result.runner_evidence.repair_pull_request.url, 'https://github.com/jununfly/ZAgenticLoop/pull/999');
});

test('dependency sweeper repair-plan CLI reads request JSON', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-dependency-sweeper-'));
  const requestPath = path.join(dir, 'request.json');
  await writeFile(requestPath, JSON.stringify(consumedDependencyRequest(), null, 2));
  try {
    const result = spawnSync(process.execPath, [
      DEPENDENCY_SWEEPER_CLI,
      'repair-plan',
      '--request',
      requestPath,
      '--json',
    ], { encoding: 'utf8' });
    assert.equal(result.status, 0);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.kind, 'zj-loop.dependency-sweeper-live-runner-plan');
    assert.equal(parsed.status, 'dry-run');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('dependency sweeper live-repair CLI emits structured escalation when confirmation is missing', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-dependency-sweeper-live-'));
  const requestPath = path.join(dir, 'request.json');
  await writeFile(requestPath, JSON.stringify(consumedDependencyRequest(), null, 2));
  try {
    const result = spawnSync(process.execPath, [
      DEPENDENCY_SWEEPER_CLI,
      'live-repair',
      '--request',
      requestPath,
      '--json',
    ], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.kind, 'zj-loop.dependency-sweeper-live-runner-result');
    assert.equal(parsed.outcome, 'escalation-issue');
    assert.equal(parsed.runner_evidence.completion_form, 'escalation-issue');
    assert.ok(parsed.plan.refusals.some((item) => item.reason === 'fixed confirmation phrase is required for live repair'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
