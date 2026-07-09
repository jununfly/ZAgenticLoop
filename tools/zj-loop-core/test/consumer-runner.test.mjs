import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  buildConsumerRunPlan,
  buildConsumerRunPlanFromRoute,
  buildRouteDecision,
  listRoutes,
  parseRouteTable,
} from '../dist/index.js';

const CLI = fileURLToPath(new URL('../dist/consumer-cli.js', import.meta.url));
const PR_STEWARD_CLI = fileURLToPath(new URL('../dist/pr-steward-cli.js', import.meta.url));
const ISSUE_TRIAGE_ACTION_CLI = fileURLToPath(new URL('../dist/issue-triage-action-cli.js', import.meta.url));

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
      protocol: "designed"
      runner: "missing"
    capabilities:
      scopes: ["manual-smoke"]
      verifiers: ["workflow-summary"]
      max_side_effect_level: "evidence"
  - route_id: "ci-sweeper"
    enabled: true
    request_kind: "issue-fix-request"
    consumer: "ci-sweeper"
    consumer_kind: "fix-runner"
    execution:
      mode: "live"
      side_effect_level: "pr"
      completion_forms: ["repair-pr", "escalation-issue"]
      recent_success_evidence:
        - "https://example.test/run/1"
    maturity:
      protocol: "dogfooded"
      runner: "dogfooded"
    capabilities:
      scopes: ["ci"]
      verifiers: ["ci-validate-gates", "diff-check"]
      max_side_effect_level: "pr"
disabled_dispatch_routes:
  - route_id: "dependency-sweeper"
    enabled: false
    request_kind: "issue-fix-request"
    consumer: "dependency-sweeper"
    consumer_kind: "fix-runner"
    execution:
      mode: "live"
      side_effect_level: "pr"
      completion_forms: ["repair-pr", "escalation-issue"]
      recent_success_evidence:
        - "https://example.test/run/2"
    maturity:
      protocol: "user-project-ready"
      runner: "user-project-ready"
    capabilities:
      scopes: ["dependency"]
      verifiers: ["verification-gate"]
      max_side_effect_level: "pr"
  - route_id: "pr-steward-fix-request"
    enabled: true
    request_kind: "issue-fix-request"
    consumer: "pr-steward"
    consumer_kind: "fix-runner"
    execution:
      mode: "live"
      side_effect_level: "pr"
      completion_forms: ["repair-pr", "escalation-issue"]
      recent_success_evidence:
        - "https://example.test/run/3"
    maturity:
      protocol: "user-project-ready"
      runner: "user-project-ready"
    capabilities:
      scopes: ["pull-request"]
      verifiers: ["status-check-rollup"]
      max_side_effect_level: "pr"
  - route_id: "issue-triage-action"
    enabled: true
    request_kind: "triage-action-request"
    consumer: "issue-triage-action"
    consumer_kind: "triage-action-consumer"
    execution:
      mode: "dry-run"
      side_effect_level: "label"
      completion_forms: ["triage-label-applied", "triage-comment-posted", "triage-action-skipped", "escalation-issue"]
      recent_success_evidence:
        - "https://example.test/run/4"
    maturity:
      protocol: "user-project-ready"
      runner: "user-project-ready"
    capabilities:
      scopes: ["issue-backlog", "triage-label"]
      verifiers: ["allowlisted-triage-action"]
      max_side_effect_level: "label"
`;

async function setupRouteTable() {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-consumer-'));
  await mkdir(path.join(dir, 'zj-loop'), { recursive: true });
  await writeFile(path.join(dir, 'zj-loop', 'zj-loop-route-table.yaml'), ROUTE_TABLE);
  return dir;
}

test('buildConsumerRunPlan blocks disabled routes before runner execution', async () => {
  const dir = await setupRouteTable();
  try {
    const plan = await buildConsumerRunPlan({ root: dir, selector: 'dependency-sweeper' });
    assert.equal(plan.status, 'blocked');
    assert.equal(plan.allowed, false);
    assert.equal(plan.reason, 'route disabled by Route Table');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('buildConsumerRunPlan allows report-only routes as evidence plans', async () => {
  const dir = await setupRouteTable();
  try {
    const plan = await buildConsumerRunPlan({ root: dir, selector: 'manual-smoke-report' });
    assert.equal(plan.status, 'report-only');
    assert.equal(plan.allowed, true);
    assert.match(plan.reason, /report-only route/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('buildConsumerRunPlan blocks dogfooded live routes until user-project-ready', async () => {
  const dir = await setupRouteTable();
  try {
    const plan = await buildConsumerRunPlan({ root: dir, selector: 'ci-sweeper' });
    assert.equal(plan.status, 'blocked');
    assert.equal(plan.allowed, false);
    assert.equal(plan.readiness, 'dogfooded-live');
    assert.match(plan.reason, /not user-project-ready/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('buildConsumerRunPlan allows enabled user-project-ready action routes', async () => {
  const table = parseRouteTable(ROUTE_TABLE);
  const route = listRoutes(table).find((item) => item.route_id === 'pr-steward-fix-request');
  assert.ok(route);
  const plan = buildConsumerRunPlanFromRoute({
    route,
    routeDecision: buildRouteDecision({ table, selector: route.route_id }),
  });
  assert.equal(plan.status, 'ready');
  assert.equal(plan.allowed, true);
  assert.equal(plan.user_project_ready, true);
});

test('zj-loop-consumer CLI prints JSON plan and exits nonzero for blocked work', async () => {
  const dir = await setupRouteTable();
  try {
    const blocked = spawnSync(process.execPath, [CLI, 'plan', 'ci-sweeper', '--root', dir, '--json'], { encoding: 'utf8' });
    assert.equal(blocked.status, 2);
    assert.equal(JSON.parse(blocked.stdout).status, 'blocked');

    const report = spawnSync(process.execPath, [CLI, 'plan', 'manual-smoke-report', '--root', dir], { encoding: 'utf8' });
    assert.equal(report.status, 0);
    assert.match(report.stdout, /report-only manual-smoke-report/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('route-specific consumer CLIs pin the route identity', async () => {
  const dir = await setupRouteTable();
  try {
    const prSteward = spawnSync(process.execPath, [PR_STEWARD_CLI, 'plan', '--root', dir, '--json'], { encoding: 'utf8' });
    assert.equal(prSteward.status, 0);
    assert.equal(JSON.parse(prSteward.stdout).route_id, 'pr-steward-fix-request');

    const issueTriageAction = spawnSync(process.execPath, [ISSUE_TRIAGE_ACTION_CLI, 'plan', '--root', dir, '--json'], { encoding: 'utf8' });
    assert.equal(issueTriageAction.status, 0);
    const parsed = JSON.parse(issueTriageAction.stdout);
    assert.equal(parsed.route_id, 'issue-triage-action');
    assert.equal(parsed.consumer_kind, 'triage-action-consumer');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
