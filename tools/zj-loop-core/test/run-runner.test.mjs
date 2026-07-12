import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  runLoopGoal,
  writeLoopRunState,
  validateLoopProtocolOutput,
} from '../dist/index.js';

const RUN_CLI = fileURLToPath(new URL('../dist/run-cli.js', import.meta.url));

const ROUTE_TABLE = `schemaVersion: 1
kind: zj-loop-route-table
routes:
  - route_id: "roadmap-sliced-development"
    enabled: true
    request_kind: "activation-request"
    consumer: "roadmap-sliced-development"
    consumer_kind: "activation-consumer"
    execution:
      mode: "live"
      side_effect_level: "branch"
      completion_forms: ["roadmap-branch-pr"]
      recent_success_evidence:
        - "https://example.test/pull/1"
    maturity:
      protocol: "execution-ready"
      runner: "execution-ready"
    capabilities:
      scopes: ["roadmap", "plan", "prd"]
      verifiers: ["roadmap-sliced-contract"]
      max_side_effect_level: "branch"
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
`;

async function setupRouteTable() {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-run-'));
  await mkdir(path.join(dir, 'zj-loop'), { recursive: true });
  await writeFile(path.join(dir, 'zj-loop', 'zj-loop-route-table.yaml'), ROUTE_TABLE);
  return dir;
}

test('runLoopGoal resolves plan-like goals into a structured roadmap run output', async () => {
  const dir = await setupRouteTable();
  try {
    const output = await runLoopGoal({
      root: dir,
      goal: 'Implement this PRD with roadmap sliced development',
      now: '2026-07-12T13:00:00.000Z',
      runId: 'run-test-1',
    });

    assert.equal(output.machine_envelope.status, 'in_progress');
    assert.equal(output.machine_envelope.run_id, 'run-test-1');
    assert.equal(output.machine_envelope.route_id, 'roadmap-sliced-development');
    assert.equal(output.machine_envelope.consumer, 'roadmap-sliced-development');
    assert.deepEqual(output.machine_envelope.repairs_applied.sort(), [
      'authority',
      'closeout_strategy',
      'created_at',
      'evidence_target',
      'max_slices',
      'review_artifact_target',
      'run_id',
      'tool',
    ].sort());
    assert.equal(validateLoopProtocolOutput(output).ok, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('runLoopGoal returns protocol repair for empty goals', async () => {
  const dir = await setupRouteTable();
  try {
    const output = await runLoopGoal({
      root: dir,
      goal: '',
      now: '2026-07-12T13:00:00.000Z',
      runId: 'run-empty-goal',
    });

    assert.equal(output.machine_envelope.status, 'needs_protocol_repair');
    assert.equal(output.machine_envelope.protocol_repair_request.missing_fields[0], 'goal');
    assert.match(output.machine_envelope.protocol_repair_request.next_command_hint, /zj-loop-run/);
    assert.equal(validateLoopProtocolOutput(output).ok, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('runLoopGoal stops with candidate routes when goal text is ambiguous', async () => {
  const dir = await setupRouteTable();
  try {
    const output = await runLoopGoal({
      root: dir,
      goal: 'triage open issues and create an implementation plan',
      now: '2026-07-12T13:00:00.000Z',
      runId: 'run-ambiguous',
    });

    assert.equal(output.machine_envelope.status, 'stopped');
    assert.equal(output.machine_envelope.stop_signal.reason, 'ambiguous-route');
    assert.deepEqual(output.machine_envelope.stop_signal.candidate_routes.sort(), [
      'issue-backlog-triage',
      'roadmap-sliced-development',
    ].sort());
    assert.equal(output.machine_envelope.resume.command, 'zj-loop-run --resume run-ambiguous');
    assert.equal(validateLoopProtocolOutput(output).ok, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('writeLoopRunState stores thin replay state under zj-loop/runs', async () => {
  const dir = await setupRouteTable();
  try {
    const output = await runLoopGoal({
      root: dir,
      goal: 'Implement this PRD with roadmap sliced development',
      now: '2026-07-12T13:00:00.000Z',
      runId: 'Run With Spaces',
    });

    const written = await writeLoopRunState({
      root: dir,
      goal: 'Implement this PRD with roadmap sliced development',
      output,
      now: '2026-07-12T13:00:00.000Z',
    });

    assert.equal(written.path, 'zj-loop/runs/run-with-spaces.json');
    const record = JSON.parse(await readFile(path.join(dir, written.path), 'utf8'));
    assert.equal(record.schema, 'zj-loop.run_state.v1');
    assert.equal(record.run_id, 'Run With Spaces');
    assert.equal(record.route_id, 'roadmap-sliced-development');
    assert.equal(record.goal, 'Implement this PRD with roadmap sliced development');
    assert.ok(record.machine_envelope);
    assert.deepEqual(record.review_artifacts, output.machine_envelope.artifacts);
    assert.deepEqual(record.evidence, output.machine_envelope.evidence);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('zj-loop-run CLI prints JSON envelope and writes run state by default', async () => {
  const dir = await setupRouteTable();
  try {
    const result = spawnSync(process.execPath, [
      RUN_CLI,
      'Implement this PRD with roadmap sliced development',
      '--root',
      dir,
      '--run-id',
      'cli-run-1',
      '--now',
      '2026-07-12T13:00:00.000Z',
    ], { encoding: 'utf8' });

    assert.equal(result.status, 0);
    const output = JSON.parse(result.stdout);
    assert.equal(output.schema, 'zj-loop.harness_output.v1');
    assert.equal(output.machine_envelope.route_id, 'roadmap-sliced-development');
    const record = JSON.parse(await readFile(path.join(dir, 'zj-loop/runs/cli-run-1.json'), 'utf8'));
    assert.equal(record.run_id, 'cli-run-1');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('zj-loop-run CLI resumes by reading the exact run state file', async () => {
  const dir = await setupRouteTable();
  try {
    const first = spawnSync(process.execPath, [
      RUN_CLI,
      'Implement this PRD with roadmap sliced development',
      '--root',
      dir,
      '--run-id',
      'resume-run-1',
      '--now',
      '2026-07-12T13:00:00.000Z',
    ], { encoding: 'utf8' });
    assert.equal(first.status, 0);

    const resumed = spawnSync(process.execPath, [
      RUN_CLI,
      '--root',
      dir,
      '--resume',
      'resume-run-1',
    ], { encoding: 'utf8' });

    assert.equal(resumed.status, 0);
    const output = JSON.parse(resumed.stdout);
    assert.equal(output.machine_envelope.run_id, 'resume-run-1');
    assert.equal(output.machine_envelope.route_id, 'roadmap-sliced-development');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
