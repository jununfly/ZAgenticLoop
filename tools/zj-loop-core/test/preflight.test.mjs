import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  buildConsumerRunPlan,
  evaluateRuntimePreflight,
  findRoute,
  loadRouteTable,
} from '../dist/index.js';

const PREFLIGHT_CLI = fileURLToPath(new URL('../dist/preflight-cli.js', import.meta.url));

const ROUTE_TABLE = `schemaVersion: 1
kind: zj-loop-route-table
routes:
  - route_id: "issue-backlog-triage"
    enabled: true
    request_kind: "report-only"
    consumer: "issue-triage"
    consumer_kind: "report-consumer"
    execution:
      mode: "report-only"
      side_effect_level: "evidence"
      completion_forms: ["report-evidence"]
    maturity:
      protocol: "replayed"
      runner: "missing"
    capabilities:
      scopes: ["issue-backlog", "triage-observation"]
      verifiers: ["route-replay"]
      max_side_effect_level: "evidence"
  - route_id: "roadmap-sliced-development"
    enabled: true
    request_kind: "activation-comment"
    consumer: "roadmap-activation"
    consumer_kind: "activation-consumer"
    execution:
      mode: "request-only"
      side_effect_level: "branch"
      completion_forms: ["roadmap-branch-pr"]
      recent_success_evidence:
        - "https://example.test/run/roadmap"
    maturity:
      protocol: "execution-ready"
      runner: "execution-ready"
    capabilities:
      scopes: ["roadmap-activation", "branch-pr"]
      verifiers: ["activation-contract"]
      max_side_effect_level: "branch"
    guards:
      required_credentials: ["GITHUB_TOKEN"]
      required_actor_roles: ["maintainer", "collaborator"]
      max_work_units: 12
`;

async function setupProject() {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-preflight-'));
  await mkdir(path.join(dir, 'zj-loop'), { recursive: true });
  await writeFile(path.join(dir, 'zj-loop', 'zj-loop-route-table.yaml'), ROUTE_TABLE);
  return dir;
}

test('evaluateRuntimePreflight warns but allows report-only routes without full safety declarations', async () => {
  const dir = await setupProject();
  try {
    const table = await loadRouteTable(dir);
    const route = findRoute(table, 'issue-backlog-triage');

    const result = evaluateRuntimePreflight({
      route,
      executionLayer: 'report-only',
      signal: {
        provider: 'github',
        subject: { kind: 'issue', id: '42' },
        intent: 'triage',
        signal_id: 'sig-42',
      },
      runtime: {
        workUnitsRequested: 1,
      },
    });

    assert.equal(result.schema, 'zj-loop.preflight_result.v1');
    assert.equal(result.status, 'warn');
    assert.equal(result.route_id, 'issue-backlog-triage');
    assert.equal(result.limits.max_work_units, 30);
    assert.equal(result.loop_key, 'github:issue:42:triage:issue-backlog-triage:sig-42');
    assert.deepEqual(result.repairs_applied, [{
      field: 'max_work_units',
      value: '30',
      reason: 'route guard missing; defaulted low-risk max_work_units for preflight',
    }]);
    assert.ok(result.warnings.includes('route-preflight-fields-incomplete'));
    assert.equal(result.stop_signal, undefined);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('evaluateRuntimePreflight hard-stops live side effects when required credentials are missing', async () => {
  const dir = await setupProject();
  try {
    const table = await loadRouteTable(dir);
    const route = findRoute(table, 'roadmap-sliced-development');

    const result = evaluateRuntimePreflight({
      route,
      executionLayer: 'live-side-effect',
      signal: {
        provider: 'github',
        subject: { kind: 'issue', id: '77' },
        intent: 'activate_roadmap',
        signal_id: 'act-77',
      },
      runtime: {
        actorRole: 'maintainer',
        credentials: {},
        workUnitsRequested: 1,
      },
    });

    assert.equal(result.status, 'hard_stop');
    assert.equal(result.stop_signal?.stop_code, 'credential-missing');
    assert.deepEqual(result.stop_signal?.next_steps, ['Provide required credential: GITHUB_TOKEN.']);
    assert.equal(result.checks.find((check) => check.id === 'credentials')?.status, 'hard_stop');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('evaluateRuntimePreflight hard-stops dirty workspace overlap for live side effects', async () => {
  const dir = await setupProject();
  try {
    const table = await loadRouteTable(dir);
    const route = findRoute(table, 'roadmap-sliced-development');

    const result = evaluateRuntimePreflight({
      route,
      executionLayer: 'live-side-effect',
      signal: {
        provider: 'github',
        subject: { kind: 'issue', id: '88' },
        intent: 'activate_roadmap',
        signal_id: 'act-88',
      },
      runtime: {
        actorRole: 'maintainer',
        credentials: { GITHUB_TOKEN: 'token' },
        dirtyFiles: ['docs/plans/current-roadmap.md'],
        targetPaths: ['docs/plans/current-roadmap.md'],
        workUnitsRequested: 1,
      },
    });

    assert.equal(result.status, 'hard_stop');
    assert.equal(result.stop_signal?.stop_code, 'dirty-workspace-conflict');
    assert.ok(String(result.stop_signal?.reason ?? '').includes('docs/plans/current-roadmap.md'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('evaluateRuntimePreflight returns resume for existing resumable loop keys', async () => {
  const dir = await setupProject();
  try {
    const table = await loadRouteTable(dir);
    const route = findRoute(table, 'roadmap-sliced-development');

    const result = evaluateRuntimePreflight({
      route,
      executionLayer: 'review-artifact',
      signal: {
        provider: 'github',
        subject: { kind: 'issue', id: '99' },
        intent: 'activate_roadmap',
        signal_id: 'act-99',
      },
      runtime: {
        workUnitsRequested: 1,
        existingLoop: {
          status: 'resumable',
          orchestration_id: 'orch-existing',
        },
      },
    });

    assert.equal(result.status, 'hard_stop');
    assert.equal(result.stop_signal?.stop_code, 'resume-existing-loop');
    assert.deepEqual(result.stop_signal?.next_steps, ['Resume existing orchestration: orch-existing.']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('dispatch orchestration persists preflight evidence before consumer execution', async () => {
  const dir = await setupProject();
  try {
    const signalPath = path.join(dir, 'signal.json');
    await writeFile(signalPath, JSON.stringify({
      schema: 'zj-loop.signal.v1',
      signal_id: 'sig-issue-42',
      source: 'github_issue',
      provider: 'github',
      subject: {
        kind: 'issue',
        id: '42',
        url: 'https://github.com/jununfly/ZAgenticLoop/issues/42',
      },
      intent: 'triage',
      payload: {},
    }, null, 2));

    const plan = await buildConsumerRunPlan({
      root: dir,
      selector: 'issue-backlog-triage',
      source: 'github_issue',
      signalId: 'sig-issue-42',
    });
    assert.equal(plan.status, 'report-only');

    const { dispatchSignal, readSignalEnvelope } = await import('../dist/index.js');
    const output = await dispatchSignal({
      root: dir,
      signal: await readSignalEnvelope({ path: signalPath }),
      mode: 'auto',
      now: '2026-07-14T00:00:00.000Z',
    });

    assert.equal(output.preflight_result.schema, 'zj-loop.preflight_result.v1');
    assert.equal(output.preflight_result.status, 'warn');
    assert.equal(output.preflight_result.execution_layer, 'report-only');
    assert.ok(output.preflight_result.warnings.includes('route-preflight-fields-incomplete'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('zj-loop-preflight CLI replays a route preflight as JSON', async () => {
  const dir = await setupProject();
  try {
    const signalPath = path.join(dir, 'activation-signal.json');
    await writeFile(signalPath, JSON.stringify({
      schema: 'zj-loop.signal.v1',
      signal_id: 'act-101',
      source: 'github_issue',
      provider: 'github',
      subject: {
        kind: 'issue',
        id: '101',
      },
      intent: 'activate_roadmap',
      payload: {},
    }, null, 2));

    const result = spawnSync(process.execPath, [
      PREFLIGHT_CLI,
      '--root',
      dir,
      '--route',
      'roadmap-sliced-development',
      '--execution-layer',
      'live-side-effect',
      '--signal',
      signalPath,
      '--actor-role',
      'maintainer',
      '--work-units',
      '2',
      '--json',
    ], {
      encoding: 'utf8',
      env: {
        ...process.env,
        GITHUB_TOKEN: 'token',
      },
    });

    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.schema, 'zj-loop.preflight_result.v1');
    assert.equal(output.status, 'pass');
    assert.equal(output.route_id, 'roadmap-sliced-development');
    assert.equal(output.limits.max_work_units, 12);
    assert.equal(output.loop_key, 'github:issue:101:activate_roadmap:roadmap-sliced-development:act-101');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
