import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  buildCiSweeperIssueFixRequestBody,
  buildCiSweeperRepairCommands,
  buildCiSweeperRepairPlan,
  formatCommandStep,
  getCiSweeperPackageBuildPlan,
  parseIssueFixRequestComments,
} from '../dist/index.js';

const CI_SWEEPER_CLI = fileURLToPath(new URL('../dist/ci-sweeper-cli.js', import.meta.url));

async function setupPackage() {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-ci-sweeper-'));
  await mkdir(path.join(dir, 'tools', 'example'), { recursive: true });
  await writeFile(path.join(dir, 'tools', 'example', 'package.json'), JSON.stringify({
    name: 'example',
    scripts: { build: 'tsc' },
  }));
  return dir;
}

test('CI Sweeper repair plan is package-list driven', () => {
  assert.deepEqual(getCiSweeperPackageBuildPlan([{ directory: 'tools/example' }]), ['tools/example']);
});

test('buildCiSweeperRepairCommands exposes deterministic command order', async () => {
  const dir = await setupPackage();
  try {
    const commands = await buildCiSweeperRepairCommands({
      root: dir,
      packageDirectories: ['tools/example'],
      rootCommands: [['node', ['scripts/check-zj-loop-init-sync.mjs']]],
    });

    assert.deepEqual(commands, [
      { command: 'npm', args: ['ci'], cwd: 'tools/example' },
      { command: 'npm', args: ['run', 'build'], cwd: 'tools/example' },
      { command: 'npm', args: ['ci', '--ignore-scripts'] },
      { command: 'node', args: ['scripts/check-zj-loop-init-sync.mjs'] },
    ]);
    assert.equal(formatCommandStep(commands[0]), '(cd tools/example && npm ci)');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('buildCiSweeperRepairPlan returns versioned packaged plan', async () => {
  const dir = await setupPackage();
  try {
    const plan = await buildCiSweeperRepairPlan({
      root: dir,
      packageDirectories: ['tools/example'],
      rootInstallCommand: null,
      rootCommands: [],
    });
    assert.equal(plan.schema, 'zj-loop.ci_sweeper_repair_plan.v1');
    assert.deepEqual(plan.package_directories, ['tools/example']);
    assert.deepEqual(plan.commands.map((step) => step.command), ['npm', 'npm']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('zj-loop-ci-sweeper repair-plan CLI prints JSON plan', async () => {
  const dir = await setupPackage();
  try {
    const result = spawnSync(process.execPath, [
      CI_SWEEPER_CLI,
      'repair-plan',
      '--root',
      dir,
      '--packages',
      'tools/example',
      '--json',
    ], { encoding: 'utf8' });
    assert.equal(result.status, 0);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.schema, 'zj-loop.ci_sweeper_repair_plan.v1');
    assert.equal(parsed.commands[0].cwd, 'tools/example');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('CI Sweeper request body carries a parseable Issue Fix Request', () => {
  const body = buildCiSweeperIssueFixRequestBody({
    repo: 'example/repo',
    workflowName: 'validate',
    runId: '123',
    sourceUrl: 'https://github.com/example/repo/actions/runs/123',
    routeDecision: {
      schema: 'zj-loop.route_decision.v1',
      decision_id: 'rd_ci_123',
      signal_id: 'ci:123',
      source: 'ci',
      route: 'ci-sweeper',
      request_kind: 'issue-fix-request',
      requested_action: 'dispatch',
      target_consumer: 'ci-sweeper',
      allowed: true,
      status: 'pending',
      reason: 'route matched',
      evidence: ['workflow_run:123'],
      dedupe_key: 'example/repo:ci-sweeper:ci:123:generated-workflow',
      created_at: '2026-07-09T00:00:00Z',
    },
  });
  const parsed = parseIssueFixRequestComments([{ id: 1, body }])[0];

  assert.equal(parsed.validation.ok, true);
  assert.equal(parsed.request.requested_consumer.consumer_id, 'ci-sweeper');
  assert.equal(parsed.request.subject.type, 'ci');
  assert.equal(parsed.request.failure_policy.retry, 'new_request_only');
});

test('CI Sweeper request body preserves GitLab pipeline provider evidence', () => {
  const body = buildCiSweeperIssueFixRequestBody({
    repo: 'group/subgroup/project',
    workflowName: 'zj_loop_ci_sweeper',
    runId: '789',
    sourceUrl: 'https://gitlab.com/group/subgroup/project/-/pipelines/789',
    routeDecision: {
      schema: 'zj-loop.route_decision.v1',
      decision_id: 'rd_gitlab_pipeline_789',
      signal_id: 'gitlab-pipeline:789',
      source: 'gitlab-pipeline',
      route: 'ci-sweeper',
      request_kind: 'issue-fix-request',
      requested_action: 'dispatch',
      target_consumer: 'ci-sweeper',
      allowed: true,
      status: 'pending',
      reason: 'route matched',
      evidence: ['gitlab_pipeline:789'],
      dedupe_key: 'group/subgroup/project:ci-sweeper:gitlab-pipeline:789:generated-workflow',
      created_at: '2026-07-09T00:00:00Z',
    },
  });
  const parsed = parseIssueFixRequestComments([{ id: 1, body }])[0];

  assert.equal(parsed.validation.ok, true);
  assert.equal(parsed.request.source_signal.provider, 'gitlab');
  assert.equal(parsed.request.subject.provider, 'gitlab');
  assert.equal(parsed.request.subject.source_url, 'https://gitlab.com/group/subgroup/project/-/pipelines/789');
});

test('zj-loop-ci-sweeper request-body CLI writes issue body', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-ci-sweeper-request-body-'));
  const routeDecisionPath = path.join(dir, 'route-decision.json');
  const outPath = path.join(dir, 'issue-body.md');
  await writeFile(routeDecisionPath, JSON.stringify({
    schema: 'zj-loop.route_decision.v1',
    decision_id: 'rd_ci_456',
    signal_id: 'ci:456',
    source: 'ci',
    route: 'ci-sweeper',
    request_kind: 'issue-fix-request',
    requested_action: 'dispatch',
    target_consumer: 'ci-sweeper',
    allowed: true,
    status: 'pending',
    reason: 'route matched',
    evidence: ['workflow_run:456'],
    dedupe_key: 'example/repo:ci-sweeper:ci:456:generated-workflow',
  }));
  try {
    const result = spawnSync(process.execPath, [
      CI_SWEEPER_CLI,
      'request-body',
      '--route-decision',
      routeDecisionPath,
      '--repo',
      'example/repo',
      '--workflow',
      'validate',
      '--run-id',
      '456',
      '--out',
      outPath,
      '--json',
    ], { encoding: 'utf8' });
    assert.equal(result.status, 0);
    assert.equal(JSON.parse(result.stdout).written, true);
    const body = await readFile(outPath, 'utf8');
    assert.equal(parseIssueFixRequestComments([{ id: 1, body }])[0].validation.ok, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('zj-loop-ci-sweeper request-body CLI accepts explicit GitLab provider', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-ci-sweeper-gitlab-request-body-'));
  const routeDecisionPath = path.join(dir, 'route-decision.json');
  const outPath = path.join(dir, 'issue-body.md');
  await writeFile(routeDecisionPath, JSON.stringify({
    schema: 'zj-loop.route_decision.v1',
    decision_id: 'rd_gitlab_456',
    signal_id: 'gitlab-pipeline:456',
    source: 'pipeline',
    route: 'ci-sweeper',
    request_kind: 'issue-fix-request',
    requested_action: 'dispatch',
    target_consumer: 'ci-sweeper',
    allowed: true,
    status: 'pending',
    reason: 'route matched',
    evidence: ['pipeline:456'],
    dedupe_key: 'group/project:ci-sweeper:gitlab-pipeline:456:generated-workflow',
  }));
  try {
    const result = spawnSync(process.execPath, [
      CI_SWEEPER_CLI,
      'request-body',
      '--route-decision',
      routeDecisionPath,
      '--repo',
      'group/project',
      '--provider',
      'gitlab',
      '--workflow',
      'validate',
      '--run-id',
      '456',
      '--out',
      outPath,
      '--json',
    ], { encoding: 'utf8' });
    assert.equal(result.status, 0);
    const body = await readFile(outPath, 'utf8');
    const parsed = parseIssueFixRequestComments([{ id: 1, body }])[0];
    assert.equal(parsed.validation.ok, true);
    assert.equal(parsed.request.subject.provider, 'gitlab');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
