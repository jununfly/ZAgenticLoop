import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  buildRouteDecision,
  canClaimRequest,
  expectedConfirmationPhrase,
  isRouteLiveReady,
  listRoutes,
  parseRouteTable,
  setRouteEnabled,
  validateRouteExecutionContract,
} from '../dist/index.js';

const CLI = fileURLToPath(new URL('../dist/route-cli.js', import.meta.url));

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
    maturity:
      protocol: "dogfooded"
      runner: "missing"
    capabilities:
      scopes: ["manual-smoke"]
      verifiers: ["workflow-summary"]
      max_side_effect_level: "evidence"
    evidence_store: "workflow summary"
  - route_id: "post-merge-roadmap-closeout"
    enabled: false
    request_kind: "report-only"
    consumer: "post-merge-cleanup"
    consumer_kind: "cleanup-consumer"
    execution:
      mode: "dry-run"
      side_effect_level: "issue-comment"
    maturity:
      protocol: "replayed"
      runner: "replayed"
    capabilities:
      scopes: ["roadmap-closeout"]
      verifiers: ["post-merge-contract"]
      max_side_effect_level: "cleanup"
    mode: "roadmap-closeout"
    guards:
      destructive_actions_enabled: false
disabled_dispatch_routes:
  - route_id: "ci-sweeper"
    enabled: false
    request_kind: "workflow-dispatch"
    consumer: "ci-sweeper"
    consumer_kind: "fix-runner"
    execution:
      mode: "live"
      side_effect_level: "pr"
      recent_success_evidence:
        - "https://example.test/run/1"
    maturity:
      protocol: "dogfooded"
      runner: "dogfooded"
    capabilities:
      scopes: ["ci"]
      verifiers: ["ci-validate-gates", "diff-check"]
      max_side_effect_level: "pr"
    evidence_store: "zj-loop/ci-sweeper-state.md"
`;

async function setupRouteTable() {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-route-'));
  await mkdir(path.join(dir, 'zj-loop'), { recursive: true });
  await writeFile(path.join(dir, 'zj-loop', 'zj-loop-route-table.yaml'), ROUTE_TABLE);
  return dir;
}

test('listRoutes normalizes enabled, disabled, side-effecting, and destructive routes', () => {
  const routes = listRoutes(parseRouteTable(ROUTE_TABLE));
  assert.equal(routes.find((route) => route.route_id === 'manual-smoke-report')?.enabled, true);
  assert.equal(routes.find((route) => route.route_id === 'ci-sweeper')?.side_effecting, true);
  assert.equal(routes.find((route) => route.route_id === 'post-merge-roadmap-closeout')?.destructive, true);
});

test('buildRouteDecision denies disabled route and allows enabled report route', () => {
  const table = parseRouteTable(ROUTE_TABLE);
  assert.equal(buildRouteDecision({ table, selector: 'ci-sweeper' }).allowed, false);
  assert.equal(buildRouteDecision({ table, selector: 'manual-smoke' }).requested_action, 'report');
});

test('enable requires predictable confirmation phrase for side-effecting routes', async () => {
  const dir = await setupRouteTable();
  try {
    await assert.rejects(
      () => setRouteEnabled({ root: dir, selector: 'ci-sweeper', enabled: true }),
      /Confirmation required: --confirm "enable ci-sweeper side effects"/,
    );

    const result = await setRouteEnabled({
      root: dir,
      selector: 'ci-sweeper',
      enabled: true,
      confirm: 'enable ci-sweeper side effects',
      reason: 'dogfood smoke',
    });
    assert.equal(result.enabled, true);
    assert.equal(result.changed, true);

    const updated = await readFile(path.join(dir, 'zj-loop', 'zj-loop-route-table.yaml'), 'utf8');
    assert.match(updated, /enabled: true/);
    assert.match(updated, /enabled_reason: dogfood smoke/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('disable is low-friction and removes enabled_reason', async () => {
  const dir = await setupRouteTable();
  try {
    await setRouteEnabled({
      root: dir,
      selector: 'ci-sweeper',
      enabled: true,
      confirm: 'enable ci-sweeper side effects',
      reason: 'temporary',
    });
    const result = await setRouteEnabled({ root: dir, selector: 'ci-sweeper', enabled: false });
    assert.equal(result.enabled, false);

    const updated = await readFile(path.join(dir, 'zj-loop', 'zj-loop-route-table.yaml'), 'utf8');
    assert.doesNotMatch(updated, /enabled_reason/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('destructive route uses destructive confirmation phrase', () => {
  const route = listRoutes(parseRouteTable(ROUTE_TABLE)).find((item) => item.route_id === 'post-merge-roadmap-closeout');
  assert.ok(route);
  assert.equal(expectedConfirmationPhrase(route), 'enable post-merge-cleanup destructive side effects');
});

test('route execution contract validates kind, mode, maturity, and live evidence', () => {
  const routes = listRoutes(parseRouteTable(ROUTE_TABLE));
  const ciSweeper = routes.find((item) => item.route_id === 'ci-sweeper');
  assert.ok(ciSweeper);
  assert.equal(isRouteLiveReady(ciSweeper), true);
  assert.equal(validateRouteExecutionContract(ciSweeper).valid, true);

  const invalid = {
    ...ciSweeper,
    consumer_kind: 'report-consumer',
    execution_mode: 'live',
    side_effect_level: 'pr',
  };
  const validation = validateRouteExecutionContract(invalid);
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join('\n'), /report-consumer cannot use execution.mode=live/);
});

test('canClaimRequest requires enabled route, fix-runner kind, active request, scopes, and verifiers', () => {
  const route = {
    ...listRoutes(parseRouteTable(ROUTE_TABLE)).find((item) => item.route_id === 'ci-sweeper'),
    enabled: true,
    execution_mode: 'claim-only',
  };
  assert.ok(route);

  assert.deepEqual(
    canClaimRequest({
      route,
      request: {
        status: 'requested',
        requested_consumer: 'ci-sweeper',
        fix_scope: { scopes: ['ci'] },
        verifier_requirements: ['diff-check'],
      },
    }),
    { allowed: true, reason: 'claim allowed', missing: [] },
  );

  const denied = canClaimRequest({
    route,
    request: {
      status: 'requested',
      requested_consumer: 'ci-sweeper',
      fix_scope: { scopes: ['dependencies'] },
      verifier_requirements: ['npm-test'],
    },
  });
  assert.equal(denied.allowed, false);
  assert.deepEqual(denied.missing, ['missing scope capability: dependencies', 'missing verifier capability: npm-test']);
});

test('zj-loop-route cli prints status and dispatch json', async () => {
  const dir = await setupRouteTable();
  try {
    const status = spawnSync(process.execPath, [CLI, 'status', '--root', dir], { encoding: 'utf8' });
    assert.equal(status.status, 0);
    assert.match(status.stdout, /manual-smoke-report/);
    assert.match(status.stdout, /ci-sweeper/);

    const dispatch = spawnSync(process.execPath, [CLI, 'dispatch', 'ci-sweeper', '--root', dir], { encoding: 'utf8' });
    assert.equal(dispatch.status, 2);
    const parsed = JSON.parse(dispatch.stdout);
    assert.equal(parsed.allowed, false);
    assert.equal(parsed.route, 'ci-sweeper');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
