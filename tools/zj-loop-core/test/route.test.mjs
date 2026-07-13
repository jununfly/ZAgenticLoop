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
  classifyRouteReadiness,
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
      completion_forms: ["report-evidence"]
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
      completion_forms: ["cleanup-done", "cleanup-skipped", "escalation-issue"]
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
    evidence_store: "zj-loop/ci-sweeper-state.md"
  - route_id: "roadmap-sliced-development"
    enabled: false
    request_kind: "activation-comment"
    consumer: "roadmap-sliced-development"
    consumer_kind: "activation-consumer"
    execution:
      mode: "live"
      side_effect_level: "branch"
      completion_forms: ["roadmap-branch-pr", "activation-failed", "activation-resumable"]
      recent_success_evidence:
        - "zj-loop/roadmap-activation-state.md"
    maturity:
      protocol: "execution-ready"
      runner: "dogfooded"
    capabilities:
      scopes: ["roadmap-activation"]
      verifiers: ["roadmap-sliced-gates"]
      max_side_effect_level: "branch"
    evidence_store: "zj-loop/roadmap-activation-state.md"
`;

async function setupRouteTable() {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-route-'));
  await mkdir(path.join(dir, 'zj-loop'), { recursive: true });
  await writeFile(path.join(dir, 'zj-loop', 'zj-loop-route-table.yaml'), ROUTE_TABLE);
  return dir;
}

async function writeRoadmapActivationSuccessEvidence(dir, orchestrationId) {
  const base = path.join(dir, 'zj-loop', 'orchestrations');
  const artifactDir = path.join(base, orchestrationId);
  await mkdir(artifactDir, { recursive: true });
  await writeFile(path.join(artifactDir, 'contract-plan.json'), JSON.stringify({
    schema: 'zj-loop.roadmap_activation_contract_plan.v1',
    provider: 'github',
  }, null, 2));
  await writeFile(path.join(artifactDir, 'post-merge-closeout-handoff.json'), JSON.stringify({
    schema: 'zj-loop.post_merge_closeout_handoff.v1',
    route_id: 'post-merge-roadmap-closeout',
    provider: 'github',
    review: {
      kind: 'pull-request',
      number: 123,
      url: 'https://github.com/jununfly/ZAgenticLoop/pull/123',
    },
    dry_run_command: {
      available: true,
      args: ['zj-loop-post-merge-closeout', 'closeout-plan'],
    },
    live_closeout_command: {
      available: true,
      args: ['zj-loop-post-merge-closeout', 'live-closeout'],
    },
  }, null, 2));
  await writeFile(path.join(base, `${orchestrationId}.json`), JSON.stringify({
    schema: 'zj-loop.orchestration.v1',
    orchestration_id: orchestrationId,
    route_decision: {
      route: 'roadmap-sliced-development',
    },
    storage: {
      path: `zj-loop/orchestrations/${orchestrationId}.json`,
    },
    consumer_adapter_result: {
      schema: 'zj-loop.consumer_adapter_result.v1',
      route_id: 'roadmap-sliced-development',
      review_artifacts: [
        {
          path: `zj-loop/orchestrations/${orchestrationId}/contract-plan.json`,
          kind: 'contract-plan',
          schema: 'zj-loop.consumer_adapter_result.v1',
        },
        {
          path: `zj-loop/orchestrations/${orchestrationId}/post-merge-closeout-handoff.json`,
          kind: 'post-merge-closeout-handoff',
          schema: 'zj-loop.post_merge_closeout_handoff.v1',
        },
      ],
      live_side_effects: {
        attempted: true,
        status: 'completed',
        external_tool: 'github',
        idempotency_key: 'roadmap-sliced-development:zjal-test',
        review: {
          kind: 'pull-request',
          number: 123,
          url: 'https://github.com/jununfly/ZAgenticLoop/pull/123',
        },
        branch: {
          name: 'zjal-test',
          target: 'main',
        },
      },
    },
  }, null, 2));
}

async function writeRoadmapActivationLifecycleEvidence(dir, orchestrationId) {
  const base = path.join(dir, 'zj-loop', 'orchestrations');
  const artifactDir = path.join(base, orchestrationId);
  await mkdir(artifactDir, { recursive: true });
  await writeFile(path.join(artifactDir, 'activation-lifecycle-evidence.json'), JSON.stringify({
    schema: 'zj-loop.activation_lifecycle_evidence.v1',
    activation_state: 'resumable',
    failure_class: 'recoverable',
    resume_allowed: true,
  }, null, 2));
  await writeFile(path.join(base, `${orchestrationId}.json`), JSON.stringify({
    schema: 'zj-loop.orchestration.v1',
    orchestration_id: orchestrationId,
    route_decision: {
      route: 'roadmap-sliced-development',
    },
    storage: {
      path: `zj-loop/orchestrations/${orchestrationId}.json`,
    },
    consumer_adapter_result: {
      schema: 'zj-loop.consumer_adapter_result.v1',
      route_id: 'roadmap-sliced-development',
      review_artifacts: [
        {
          path: `zj-loop/orchestrations/${orchestrationId}/activation-lifecycle-evidence.json`,
          kind: 'activation-lifecycle',
          schema: 'zj-loop.activation_lifecycle_evidence.v1',
        },
      ],
      live_side_effects: {
        attempted: false,
        status: 'refused',
      },
    },
  }, null, 2));
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

test('enable preserves Route Table formatting outside the target route', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-route-preserve-'));
  const routeTable = `schemaVersion: 1
kind: zj-loop-route-table

# keep this top comment
routes:
  - route_id: manual-smoke-report # inline comment survives
    enabled: true
    request_kind: report-only
    consumer: manual-smoke
    consumer_kind: report-consumer
    execution:
      mode: report-only
      side_effect_level: evidence
      completion_forms:
        - report-evidence
    maturity:
      protocol: designed
      runner: missing
    capabilities:
      scopes: [manual-smoke]
      verifiers: [workflow-summary]
      max_side_effect_level: evidence

disabled_dispatch_routes:
  - route_id: ci-sweeper
    enabled: false
    request_kind: workflow-dispatch
    consumer: ci-sweeper
    consumer_kind: fix-runner
    execution:
      mode: live
      side_effect_level: pr
      completion_forms: [repair-pr, escalation-issue]
      recent_success_evidence: ["https://example.test/run/1"]
    maturity:
      protocol: dogfooded
      runner: dogfooded
    capabilities:
      scopes: [ci]
      verifiers: [ci-validate-gates, diff-check]
      max_side_effect_level: pr
`;
  try {
    await mkdir(path.join(dir, 'zj-loop'), { recursive: true });
    await writeFile(path.join(dir, 'zj-loop', 'zj-loop-route-table.yaml'), routeTable);
    await setRouteEnabled({
      root: dir,
      selector: 'ci-sweeper',
      enabled: true,
      confirm: 'enable ci-sweeper side effects',
      reason: 'dogfood smoke',
    });

    const updated = await readFile(path.join(dir, 'zj-loop', 'zj-loop-route-table.yaml'), 'utf8');
    assert.match(updated, /# keep this top comment/);
    assert.match(updated, /route_id: manual-smoke-report # inline comment survives/);
    assert.match(updated, /completion_forms: \[repair-pr, escalation-issue\]/);
    assert.match(updated, /enabled: true\n    enabled_reason: dogfood smoke\n    request_kind: workflow-dispatch/);
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

test('promote runner maturity requires confirmation for execution-ready and does not enable route', async () => {
  const dir = await setupRouteTable();
  try {
    const denied = spawnSync(process.execPath, [
      CLI,
      'promote',
      'ci-sweeper',
      '--root',
      dir,
      '--runner',
      'execution-ready',
    ], { encoding: 'utf8' });
    assert.equal(denied.status, 1);
    assert.match(denied.stderr, /Confirmation required: --confirm "promote ci-sweeper runner to execution-ready"/);

    const promoted = spawnSync(process.execPath, [
      CLI,
      'promote',
      'ci-sweeper',
      '--root',
      dir,
      '--runner',
      'execution-ready',
      '--confirm',
      'promote ci-sweeper runner to execution-ready',
      '--json',
    ], { encoding: 'utf8' });
    assert.equal(promoted.status, 0);
    const result = JSON.parse(promoted.stdout);
    assert.equal(result.route_id, 'ci-sweeper');
    assert.equal(result.runner, 'execution-ready');
    assert.equal(result.enabled, false);

    const updated = await readFile(path.join(dir, 'zj-loop', 'zj-loop-route-table.yaml'), 'utf8');
    assert.match(updated, /runner: execution-ready/);
    assert.match(updated, /enabled: false/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('promote runner maturity to install-ready is low friction but not execution authorization', async () => {
  const dir = await setupRouteTable();
  try {
    const promoted = spawnSync(process.execPath, [
      CLI,
      'promote',
      'ci-sweeper',
      '--root',
      dir,
      '--runner',
      'install-ready',
      '--json',
    ], { encoding: 'utf8' });
    assert.equal(promoted.status, 0);
    const result = JSON.parse(promoted.stdout);
    assert.equal(result.runner, 'install-ready');
    assert.equal(result.confirmation_required, false);
    assert.equal(result.enabled, false);

    const status = spawnSync(process.execPath, [CLI, 'status', 'ci-sweeper', '--root', dir, '--json'], { encoding: 'utf8' });
    assert.equal(status.status, 0);
    const route = JSON.parse(status.stdout).routes[0];
    assert.equal(route.automation_model.readiness.level, 'install-ready');
    assert.equal(route.automation_model.authorization.execution_allowed, false);
    assert.deepEqual(route.automation_model.authorization.blocked_reasons, [
      'route disabled',
      'route is not execution-ready',
    ]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('promotion-gate reports missing roadmap activation evidence without mutating maturity', async () => {
  const dir = await setupRouteTable();
  try {
    const checked = spawnSync(process.execPath, [
      CLI,
      'promotion-gate',
      'roadmap-sliced-development',
      '--root',
      dir,
      '--target',
      'execution-ready',
      '--json',
    ], { encoding: 'utf8' });
    assert.equal(checked.status, 2);
    const result = JSON.parse(checked.stdout);
    assert.equal(result.promotable, false);
    assert.equal(result.applied, false);
    assert.deepEqual(result.missing_evidence, [
      'contract-plan',
      'provider-live-side-effect',
      'activation-lifecycle',
      'post-merge-closeout-handoff',
    ]);

    const updated = await readFile(path.join(dir, 'zj-loop', 'zj-loop-route-table.yaml'), 'utf8');
    assert.match(updated, /runner: "dogfooded"/);
    assert.doesNotMatch(updated, /runner: execution-ready/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('promotion-gate accepts replayable roadmap activation evidence across orchestrations', async () => {
  const dir = await setupRouteTable();
  try {
    await writeRoadmapActivationSuccessEvidence(dir, 'success-1');
    await writeRoadmapActivationLifecycleEvidence(dir, 'resumable-1');

    const checked = spawnSync(process.execPath, [
      CLI,
      'promotion-gate',
      'roadmap-sliced-development',
      '--root',
      dir,
      '--target',
      'execution-ready',
      '--json',
    ], { encoding: 'utf8' });
    assert.equal(checked.status, 0);
    const result = JSON.parse(checked.stdout);
    assert.equal(result.promotable, true);
    assert.equal(result.applied, false);
    assert.deepEqual(result.missing_evidence, []);
    assert.deepEqual(result.promotion_command, [
      'zj-loop-route',
      'promotion-gate',
      'roadmap-sliced-development',
      '--target',
      'execution-ready',
      '--apply',
      '--confirm',
      'promote roadmap-sliced-development runner to execution-ready',
    ]);
    const keys = result.required_evidence.map((check) => check.key);
    assert.deepEqual(keys, [
      'contract-plan',
      'provider-live-side-effect',
      'activation-lifecycle',
      'post-merge-closeout-handoff',
    ]);
    assert.equal(result.required_evidence.every((check) => check.satisfied), true);

    const updated = await readFile(path.join(dir, 'zj-loop', 'zj-loop-route-table.yaml'), 'utf8');
    assert.match(updated, /runner: "dogfooded"/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('promotion-gate apply requires fixed confirmation and only then promotes runner maturity', async () => {
  const dir = await setupRouteTable();
  try {
    await writeRoadmapActivationSuccessEvidence(dir, 'success-apply');
    await writeRoadmapActivationLifecycleEvidence(dir, 'resumable-apply');

    const denied = spawnSync(process.execPath, [
      CLI,
      'promotion-gate',
      'roadmap-sliced-development',
      '--root',
      dir,
      '--target',
      'execution-ready',
      '--apply',
      '--json',
    ], { encoding: 'utf8' });
    assert.equal(denied.status, 1);
    assert.match(denied.stderr, /Confirmation required: --confirm "promote roadmap-sliced-development runner to execution-ready"/);

    const applied = spawnSync(process.execPath, [
      CLI,
      'promotion-gate',
      'roadmap-sliced-development',
      '--root',
      dir,
      '--target',
      'execution-ready',
      '--apply',
      '--confirm',
      'promote roadmap-sliced-development runner to execution-ready',
      '--json',
    ], { encoding: 'utf8' });
    assert.equal(applied.status, 0);
    const result = JSON.parse(applied.stdout);
    assert.equal(result.promotable, true);
    assert.equal(result.applied, true);
    assert.equal(result.apply_result.runner, 'execution-ready');
    assert.equal(result.apply_result.enabled, false);

    const updated = await readFile(path.join(dir, 'zj-loop', 'zj-loop-route-table.yaml'), 'utf8');
    assert.match(updated, /runner: execution-ready/);
    assert.match(updated, /enabled: false/);
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
  assert.deepEqual(ciSweeper.completion_forms, ['repair-pr', 'escalation-issue']);
  assert.equal(ciSweeper.readiness, 'dogfood-verified');
  assert.equal(ciSweeper.install_ready, false);
  assert.equal(ciSweeper.execution_ready, false);
  assert.equal(ciSweeper.user_project_ready, false);
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

test('classifyRouteReadiness distinguishes install-ready execution-ready dogfood and replay evidence', () => {
  assert.deepEqual(
    classifyRouteReadiness({
      executionMode: 'live',
      sideEffectLevel: 'pr',
      maturityRunner: 'execution-ready',
      recentSuccessEvidence: [],
    }),
    { readiness: 'execution-ready', reasons: ['runner maturity is execution-ready'] },
  );

  assert.deepEqual(
    classifyRouteReadiness({
      executionMode: 'request-only',
      sideEffectLevel: 'request',
      maturityRunner: 'install-ready',
      recentSuccessEvidence: [],
    }),
    { readiness: 'install-ready', reasons: ['runner maturity is install-ready'] },
  );

  assert.deepEqual(
    classifyRouteReadiness({
      executionMode: 'request-only',
      sideEffectLevel: 'request',
      maturityRunner: 'user-project-ready',
      recentSuccessEvidence: [],
    }),
    { readiness: 'install-ready', reasons: ['legacy runner maturity user-project-ready maps to install-ready'] },
  );

  assert.equal(
    classifyRouteReadiness({
      executionMode: 'live',
      sideEffectLevel: 'pr',
      maturityRunner: 'dogfooded',
      recentSuccessEvidence: ['https://example.test/run/1'],
    }).readiness,
    'dogfood-verified',
  );
  assert.equal(
    classifyRouteReadiness({
      executionMode: 'claim-only',
      sideEffectLevel: 'claim',
      maturityRunner: 'replayed',
    }).readiness,
    'replayed',
  );
  assert.equal(
    classifyRouteReadiness({
      executionMode: 'live',
      sideEffectLevel: 'pr',
      maturityRunner: 'missing',
    }).readiness,
    'live-missing-evidence',
  );
});

test('route execution contract rejects invalid completion forms and missing live evidence', () => {
  const routes = listRoutes(parseRouteTable(ROUTE_TABLE));
  const ciSweeper = routes.find((item) => item.route_id === 'ci-sweeper');
  assert.ok(ciSweeper);

  const invalidCompletion = validateRouteExecutionContract({
    ...ciSweeper,
    completion_forms: ['draft-pr'],
  });
  const missingEvidence = validateRouteExecutionContract({
    ...ciSweeper,
    recent_success_evidence: [],
  });

  assert.equal(invalidCompletion.valid, false);
  assert.match(invalidCompletion.errors.join('\n'), /fix-runner cannot use completion_form=draft-pr/);
  assert.equal(missingEvidence.valid, false);
  assert.match(
    missingEvidence.errors.join('\n'),
    /live execution requires runner maturity dogfooded or execution-ready and non-evidence side-effect boundary/,
  );
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
    assert.match(status.stdout, /enabled\s+dispatch\s+execute\s+route\s+consumer\s+kind\s+mode\s+sidefx\s+protocol\s+runner\s+readiness/);
    assert.match(status.stdout, /manual-smoke-report/);
    assert.match(status.stdout, /ci-sweeper/);
    assert.match(status.stdout, /fix-runner/);
    assert.match(status.stdout, /live/);
    assert.match(status.stdout, /dogfood-verified/);
    assert.match(status.stdout, /no\s+no\s+no\s+ci-sweeper/);

    const dispatch = spawnSync(process.execPath, [CLI, 'dispatch', 'ci-sweeper', '--root', dir], { encoding: 'utf8' });
    assert.equal(dispatch.status, 2);
    const parsed = JSON.parse(dispatch.stdout);
    assert.equal(parsed.allowed, false);
    assert.equal(parsed.route, 'ci-sweeper');

    const statusJson = spawnSync(process.execPath, [CLI, 'status', 'ci-sweeper', '--root', dir, '--json'], { encoding: 'utf8' });
    assert.equal(statusJson.status, 0);
    const parsedStatus = JSON.parse(statusJson.stdout);
    assert.equal(parsedStatus.routes[0].consumer_kind, 'fix-runner');
    assert.equal(parsedStatus.routes[0].execution_mode, 'live');
    assert.equal(parsedStatus.routes[0].readiness, 'dogfood-verified');
    assert.equal(parsedStatus.routes[0].install_ready, false);
    assert.equal(parsedStatus.routes[0].execution_ready, false);
    assert.equal(parsedStatus.routes[0].user_project_ready, false);
    assert.deepEqual(parsedStatus.routes[0].capability_verifiers, ['ci-validate-gates', 'diff-check']);
    assert.deepEqual(parsedStatus.routes[0].automation_model, {
      readiness: {
        level: 'dogfood-verified',
        install_ready: false,
        execution_ready: false,
        user_project_ready: false,
        reasons: ['live dogfood evidence exists', 'not yet promoted to execution-ready'],
      },
      authorization: {
        route_enabled: false,
        dispatch_allowed: false,
        execution_allowed: false,
        required_confirmation: 'enable ci-sweeper side effects',
        blocked_reasons: ['route disabled', 'route is not execution-ready'],
      },
    });

    const smokeJson = spawnSync(process.execPath, [CLI, 'status', 'manual-smoke-report', '--root', dir, '--json'], { encoding: 'utf8' });
    assert.equal(smokeJson.status, 0);
    const smokeStatus = JSON.parse(smokeJson.stdout);
    assert.deepEqual(smokeStatus.routes[0].automation_model.authorization, {
      route_enabled: true,
      dispatch_allowed: true,
      execution_allowed: false,
      required_confirmation: null,
      blocked_reasons: ['route is not execution-ready'],
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
