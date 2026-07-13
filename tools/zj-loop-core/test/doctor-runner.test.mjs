import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  buildLoopDoctorReport,
} from '../dist/index.js';

const DOCTOR_CLI = fileURLToPath(new URL('../dist/doctor-cli.js', import.meta.url));

async function setupRuns() {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-doctor-'));
  await mkdir(path.join(dir, 'zj-loop', 'runs'), { recursive: true });
  await mkdir(path.join(dir, 'zj-loop', 'orchestrations', 'orch-roadmap'), { recursive: true });
  await writeFile(path.join(dir, 'zj-loop', 'runs', 'run-1.json'), JSON.stringify({
    schema: 'zj-loop.run_state.v1',
    schema_version: 1,
    run_id: 'run-1',
    created_at: '2026-07-12T13:00:00.000Z',
    updated_at: '2026-07-12T13:00:00.000Z',
    goal: 'triage open issues and create an implementation plan',
    route_id: 'roadmap-sliced-development',
    status: 'stopped',
    machine_envelope: {
      repairs_applied: ['run_id', 'created_at'],
      stop_signal: {
        reason: 'ambiguous-route',
        candidate_routes: ['roadmap-sliced-development', 'issue-backlog-triage'],
      },
    },
    stop_signal: { reason: 'ambiguous-route' },
    review_artifacts: [],
    evidence: [],
  }, null, 2));
  await writeFile(path.join(dir, 'zj-loop', 'orchestrations', 'orch-roadmap.json'), JSON.stringify({
    schema: 'zj-loop.orchestration.v1',
    orchestration_id: 'orch-roadmap',
    duplicate_key: 'github:issue:77:activate_roadmap:roadmap-sliced-development',
    status: 'hard_stopped',
    mode: 'execute',
    created_at: '2026-07-12T13:05:00.000Z',
    updated_at: '2026-07-12T13:06:00.000Z',
    signal: {
      schema: 'zj-loop.signal.v1',
      signal_id: 'act-77',
      source: 'github_issue',
      provider: 'github',
      subject: {
        kind: 'issue',
        id: '77',
        url: 'https://github.com/jununfly/ZAgenticLoop/issues/77',
      },
      intent: 'activate_roadmap',
      payload: {},
    },
    route_decision: {},
    carrier_plan: {},
    consumer_run_plan: {
      route_id: 'roadmap-sliced-development',
      consumer: 'roadmap-activation',
    },
    preflight_result: {
      schema: 'zj-loop.preflight_result.v1',
      status: 'hard_stop',
      route_id: 'roadmap-sliced-development',
      consumer: 'roadmap-activation',
      execution_layer: 'live-side-effect',
      checks: [],
      repairs_applied: [],
      warnings: [],
      limits: { max_work_units: 30 },
      loop_key: 'github:issue:77:activate_roadmap:roadmap-sliced-development:act-77',
      stop_signal: {
        stop_code: 'credential-missing',
        layer: 'preflight',
        reason: 'Missing required credential: GITHUB_TOKEN.',
        next_steps: ['Provide required credential: GITHUB_TOKEN.'],
      },
    },
    review_artifact: {
      kind: 'hard-stop',
      description: 'Missing required credential: GITHUB_TOKEN.',
    },
    closeout_hint: {
      required: false,
      reason: 'no closeout required before live side effects pass preflight',
    },
    stop_signal: {
      reason: 'Missing required credential: GITHUB_TOKEN.',
      next_steps: ['Provide required credential: GITHUB_TOKEN.'],
    },
    storage: {
      path: 'zj-loop/orchestrations/orch-roadmap.json',
    },
  }, null, 2));
  await writeFile(path.join(dir, 'zj-loop', 'orchestrations', 'orch-roadmap', 'contract-plan.json'), JSON.stringify({
    schema: 'zj-loop.roadmap_activation_contract_plan.v1',
    route_id: 'roadmap-sliced-development',
  }, null, 2));
  return dir;
}

test('buildLoopDoctorReport summarizes run-state replay issues without emitting a signal by default', async () => {
  const dir = await setupRuns();
  try {
    const report = await buildLoopDoctorReport({ root: dir });

    assert.equal(report.schema, 'zj-loop.diagnostic_report.v1');
    assert.equal(report.emit_signal, false);
    assert.equal(report.total_runs, 1);
    assert.equal(report.summary.total_runs, 1);
    assert.equal(report.summary.total_orchestrations, 1);
    assert.equal(report.summary.latest_status, 'hard_stopped');
    assert.equal(report.summary.open_stop_signals_count, 2);
    assert.equal(report.run_summaries[0].run_id, 'run-1');
    assert.equal(report.orchestration_summaries[0].orchestration_id, 'orch-roadmap');
    assert.ok(report.artifact_index.some((artifact) => artifact.kind === 'orchestration-child-artifact'
      && artifact.path === 'zj-loop/orchestrations/orch-roadmap/contract-plan.json'));
    assert.ok(report.linked_items.some((item) => item.provider === 'github'
      && item.subject_kind === 'issue'
      && item.subject_id === '77'
      && item.orchestration_id === 'orch-roadmap'));
    assert.deepEqual(report.classified_stop_signals.map((signal) => signal.stop_code), [
      'ambiguous-route',
      'credential-missing',
    ]);
    assert.deepEqual(report.findings, [
      {
        kind: 'route-ambiguity',
        count: 1,
        severity: 'warning',
        recommendation: 'Prefer explicit --route or improve deterministic resolver rules for repeated ambiguous goals.',
      },
      {
        kind: 'hard-stop',
        count: 1,
        severity: 'info',
        recommendation: 'Inspect classified_stop_signals and decide whether route contracts, permissions, budgets, or verifier requirements need adjustment.',
      },
    ]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('zj-loop-doctor CLI emits diagnostic JSON and only includes signal when requested', async () => {
  const dir = await setupRuns();
  try {
    const plain = spawnSync(process.execPath, [DOCTOR_CLI, '--root', dir], { encoding: 'utf8' });
    assert.equal(plain.status, 0);
    const plainReport = JSON.parse(plain.stdout);
    assert.equal(plainReport.emit_signal, false);
    assert.equal(plainReport.signal, undefined);

    const signal = spawnSync(process.execPath, [DOCTOR_CLI, '--root', dir, '--emit-signal'], { encoding: 'utf8' });
    assert.equal(signal.status, 0);
    const signalReport = JSON.parse(signal.stdout);
    assert.equal(signalReport.emit_signal, true);
    assert.equal(signalReport.signal.schema, 'zj-loop.signal.v1');

    const targeted = spawnSync(process.execPath, [
      DOCTOR_CLI,
      '--root',
      dir,
      '--orchestration',
      'orch-roadmap',
    ], { encoding: 'utf8' });
    assert.equal(targeted.status, 0);
    const targetedReport = JSON.parse(targeted.stdout);
    assert.equal(targetedReport.total_runs, 0);
    assert.equal(targetedReport.summary.total_orchestrations, 1);

    const providerSubject = spawnSync(process.execPath, [
      DOCTOR_CLI,
      '--root',
      dir,
      '--provider',
      'github',
      '--subject',
      'issue:77',
    ], { encoding: 'utf8' });
    assert.equal(providerSubject.status, 0);
    const providerSubjectReport = JSON.parse(providerSubject.stdout);
    assert.equal(providerSubjectReport.orchestration_summaries[0].orchestration_id, 'orch-roadmap');

    const text = spawnSync(process.execPath, [
      DOCTOR_CLI,
      '--root',
      dir,
      '--format',
      'text',
    ], { encoding: 'utf8' });
    assert.equal(text.status, 0);
    assert.match(text.stdout, /latest_status: hard_stopped/);
    assert.match(text.stdout, /blocked: credential-missing \(authorization\/preflight\)/);

    const indexPath = path.join(dir, 'zj-loop', 'evidence-index.json');
    const written = spawnSync(process.execPath, [
      DOCTOR_CLI,
      '--root',
      dir,
      '--write-index',
      indexPath,
    ], { encoding: 'utf8' });
    assert.equal(written.status, 0);
    const writtenIndex = JSON.parse(await readFile(indexPath, 'utf8'));
    assert.equal(writtenIndex.schema, 'zj-loop.diagnostic_report.v1');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
