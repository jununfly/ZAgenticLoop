import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildFirstRunPlan } from '../dist/index.js';

const CLI = fileURLToPath(new URL('../dist/first-run-cli.js', import.meta.url));

const ROUTE_TABLE = `schemaVersion: 1
kind: zj-loop-route-table
routes:
  - route_id: "manual-smoke-report"
    enabled: true
    request_kind: "report-only"
    consumer: "manual-smoke"
    consumer_kind: "report-consumer"
    execution:
      mode: "report-only"
      side_effect_level: "evidence"
      completion_forms: ["report-evidence"]
    maturity:
      protocol: "dogfooded"
      runner: "missing"
    capabilities:
      scopes: ["manual-smoke"]
      verifiers: ["workflow-summary"]
      max_side_effect_level: "evidence"
  - route_id: "roadmap-sliced-development"
    enabled: true
    request_kind: "activation-comment"
    consumer: "roadmap-sliced-development"
    consumer_kind: "activation-consumer"
    execution:
      mode: "live"
      side_effect_level: "branch"
      completion_forms: ["roadmap-branch-pr", "activation-failed", "activation-resumable"]
      recent_success_evidence:
        - "https://example.test/run/roadmap"
    maturity:
      protocol: "execution-ready"
      runner: "execution-ready"
    capabilities:
      scopes: ["roadmap-activation"]
      verifiers: ["activation-comment", "roadmap-gates"]
      max_side_effect_level: "branch"
disabled_dispatch_routes:
  - route_id: "ci-sweeper"
    enabled: false
    request_kind: "issue-fix-request"
    consumer: "ci-sweeper"
    consumer_kind: "fix-runner"
    execution:
      mode: "live"
      side_effect_level: "pr"
      completion_forms: ["repair-pr", "escalation-issue"]
      recent_success_evidence:
        - "https://example.test/run/ci"
    maturity:
      protocol: "execution-ready"
      runner: "execution-ready"
    capabilities:
      scopes: ["ci"]
      verifiers: ["ci-validate-gates"]
      max_side_effect_level: "pr"
`;

async function setupRouteTable() {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-first-run-'));
  await mkdir(path.join(dir, 'zj-loop'), { recursive: true });
  await writeFile(path.join(dir, 'zj-loop', 'zj-loop-route-table.yaml'), ROUTE_TABLE);
  return dir;
}

test('buildFirstRunPlan recommends manual smoke for automatic first run', async () => {
  const dir = await setupRouteTable();
  try {
    const plan = await buildFirstRunPlan({ root: dir });
    assert.equal(plan.schema, 'zj-loop.first_run_plan.v1');
    assert.equal(plan.recommended_route, 'manual-smoke-report');
    assert.equal(plan.automation_allowed, true);
    assert.equal(plan.consumer_plan.status, 'report-only');
    assert.deepEqual(plan.stop_signals, []);
    assert.equal(plan.preconditions.find((item) => item.id === 'route-enabled')?.status, 'pass');
    assert.equal(plan.preconditions.find((item) => item.id === 'credentials-and-authority')?.status, 'pass');
    assert.equal(plan.preconditions.find((item) => item.id === 'cost-budget')?.status, 'warning');
    assert.equal(plan.preconditions.find((item) => item.id === 'workspace-safety')?.status, 'warning');
    assert.ok(plan.route_menu.find((route) => route.recommended_for_first_run && route.route_id === 'manual-smoke-report'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('buildFirstRunPlan can target execution-ready roadmap automation', async () => {
  const dir = await setupRouteTable();
  try {
    const plan = await buildFirstRunPlan({ root: dir, goal: 'roadmap' });
    assert.equal(plan.recommended_route, 'roadmap-sliced-development');
    assert.equal(plan.consumer_plan.status, 'ready');
    assert.equal(plan.consumer_plan.execution_allowed, true);
    assert.match(plan.automation_intent, /bounded review artifact/);
    assert.match(plan.automatic_next_steps.join('\n'), /Run packaged roadmap-sliced-development consumer/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('buildFirstRunPlan turns blocked automation into structured stop signal', async () => {
  const dir = await setupRouteTable();
  try {
    const plan = await buildFirstRunPlan({ root: dir, goal: 'ci' });
    assert.equal(plan.recommended_route, 'ci-sweeper');
    assert.equal(plan.automation_allowed, false);
    assert.equal(plan.consumer_plan.status, 'blocked');
    assert.equal(plan.preconditions.find((item) => item.id === 'route-enabled')?.status, 'fail');
    assert.equal(plan.stop_signals[0].stop_code, 'precondition-failed');
    assert.equal(plan.stop_signals[0].severity, 'blocked');
    assert.equal(plan.stop_signals[0].stop_reason, 'Route ci-sweeper is disabled');
    assert.equal(plan.stop_signals[0].responsible_layer, 'first-run-precondition');
    assert.ok(plan.stop_signals.some((item) => item.stop_code === 'route-disabled'));
    assert.equal(plan.stop_signals[0].retry_policy, 'after-configuration-change');
    assert.equal(plan.stop_signals[0].human_required, true);
    assert.ok(plan.stop_signals[0].confirmation_location.includes('terminal command'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('zj-loop-first-run CLI prints JSON and exits nonzero when automation is blocked', async () => {
  const dir = await setupRouteTable();
  try {
    const smoke = spawnSync(process.execPath, [CLI, 'plan', '--root', dir], { encoding: 'utf8' });
    assert.equal(smoke.status, 0);
    assert.match(smoke.stdout, /recommended route: manual-smoke-report/);

    const ci = spawnSync(process.execPath, [CLI, 'plan', '--root', dir, '--goal', 'ci', '--json'], { encoding: 'utf8' });
    assert.equal(ci.status, 2);
    const parsed = JSON.parse(ci.stdout);
    assert.equal(parsed.stop_signals[0].responsible_layer, 'first-run-precondition');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
