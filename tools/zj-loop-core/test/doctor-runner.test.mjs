import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
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
  return dir;
}

test('buildLoopDoctorReport summarizes run-state replay issues without emitting a signal by default', async () => {
  const dir = await setupRuns();
  try {
    const report = await buildLoopDoctorReport({ root: dir });

    assert.equal(report.schema, 'zj-loop.diagnostic_report.v1');
    assert.equal(report.emit_signal, false);
    assert.equal(report.total_runs, 1);
    assert.deepEqual(report.findings, [
      {
        kind: 'route-ambiguity',
        count: 1,
        severity: 'warning',
        recommendation: 'Prefer explicit --route or improve deterministic resolver rules for repeated ambiguous goals.',
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
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
