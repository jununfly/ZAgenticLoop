import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { cleanupGitLabOwnedSchedule, createGitLabOwnedSchedule, findGitLabOwnedSchedulePipeline, planGitLabScheduleProbe, readGitLabScheduleProbeState, runGitLabScheduleProbe, SCHEDULE_PROBE_CONFIRMATION, writeGitLabScheduleProbeState } from '../dist/schedule-probe-runner.js';

test('owned GitLab schedule probe refuses without its fixed confirmation before any side effect', () => {
  const result = planGitLabScheduleProbe({
    project: 'group/project',
    dueInMinutes: 3,
    now: '2026-07-15T07:11:00Z',
  });

  assert.equal(SCHEDULE_PROBE_CONFIRMATION, 'RUN_TEMPORARY_GITLAB_SCHEDULE_PROBE');
  assert.equal(result.status, 'refused');
  assert.equal(result.reason, 'confirmation-required');
  assert.deepEqual(result.operations, []);
});

test('owned GitLab schedule probe persists thin replay state under zj-loop', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'zj-loop-schedule-probe-'));
  try {
    const plan = planGitLabScheduleProbe({ project: 'group/project', dueInMinutes: 3, confirmation: SCHEDULE_PROBE_CONFIRMATION, now: '2026-07-15T07:11:00Z' });
    const written = await writeGitLabScheduleProbeState({ root, plan });
    const restored = await readGitLabScheduleProbeState({ root, probeId: plan.probe_id });

    assert.equal(written.path, plan.state_path);
    assert.equal(restored.probe_id, plan.probe_id);
    assert.equal(restored.status, 'armed');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('owned GitLab schedule probe creates only its marked temporary schedule', async () => {
  const plan = planGitLabScheduleProbe({ project: 'group/project', dueInMinutes: 3, confirmation: SCHEDULE_PROBE_CONFIRMATION, now: '2026-07-15T07:11:00Z', ref: 'main' });
  const calls = [];
  const result = await createGitLabOwnedSchedule({
    plan,
    token: 'token',
    apiUrl: 'https://gitlab.example/api/v4',
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return { ok: true, async json() { return { id: 99, ...plan.temporary_schedule }; } };
    },
  });

  assert.equal(result.owned_schedule_id, 99);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /projects\/group%2Fproject\/pipeline_schedules$/);
  assert.equal(calls[0].init.method, 'POST');
  assert.match(calls[0].init.body, /zj-loop\.schedule_probe\.v1/);
});

test('owned GitLab schedule probe deletes only a schedule whose identity still matches its state', async () => {
  const plan = planGitLabScheduleProbe({ project: 'group/project', dueInMinutes: 3, confirmation: SCHEDULE_PROBE_CONFIRMATION, now: '2026-07-15T07:11:00Z', ref: 'main' });
  const calls = [];
  const result = await cleanupGitLabOwnedSchedule({
    plan: { ...plan, owned_schedule_id: 99 }, token: 'token', apiUrl: 'https://gitlab.example/api/v4',
    fetchImpl: async (url, init = {}) => {
      calls.push({ url: String(url), init });
      return init.method === 'DELETE'
        ? { ok: true, async json() { return {}; } }
        : { ok: true, async json() { return { id: 99, ...plan.temporary_schedule }; } };
    },
  });

  assert.equal(result.status, 'cleaned');
  assert.equal(calls[1].init.method, 'DELETE');
});

test('owned GitLab schedule probe refuses cleanup when its schedule marker drifts', async () => {
  const plan = planGitLabScheduleProbe({ project: 'group/project', dueInMinutes: 3, confirmation: SCHEDULE_PROBE_CONFIRMATION, now: '2026-07-15T07:11:00Z', ref: 'main' });
  const calls = [];
  const result = await cleanupGitLabOwnedSchedule({
    plan: { ...plan, owned_schedule_id: 99 }, token: 'token', apiUrl: 'https://gitlab.example/api/v4',
    fetchImpl: async (url, init = {}) => {
      calls.push({ url: String(url), init });
      return { ok: true, async json() { return { id: 99, ...plan.temporary_schedule, description: 'human-owned' }; } };
    },
  });

  assert.equal(result.status, 'escalated');
  assert.equal(result.reason, 'owned-schedule-identity-mismatch');
  assert.equal(calls.length, 1);
});

test('owned GitLab schedule probe observes only a scheduled pipeline created after it armed', async () => {
  const result = await findGitLabOwnedSchedulePipeline({
    project: 'group/project', token: 'token', apiUrl: 'https://gitlab.example/api/v4', armedAt: '2026-07-15T07:11:00Z',
    fetchImpl: async () => ({ ok: true, async json() { return [
      { id: 1, source: 'schedule', created_at: '2026-07-15T07:10:00Z' },
      { id: 2, source: 'schedule', created_at: '2026-07-15T07:14:00Z' },
    ]; } }),
  });

  assert.equal(result?.id, 2);
});

test('owned GitLab schedule probe runs start through scheduled evidence and guarded cleanup', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'zj-loop-schedule-probe-run-'));
  try {
    let pipelineQueries = 0;
    const result = await runGitLabScheduleProbe({
      root, project: 'group/project', ref: 'main', timezone: 'Asia/Shanghai', dueInMinutes: 3,
      confirmation: SCHEDULE_PROBE_CONFIRMATION, token: 'token', apiUrl: 'https://gitlab.example/api/v4', now: '2026-07-15T07:11:00Z',
      nowFn: () => new Date('2026-07-15T07:12:00Z'),
      fetchImpl: async (url, init = {}) => {
        const text = String(url);
        if (init.method === 'POST') return { ok: true, async json() { return { id: 99 }; } };
        if (init.method === 'DELETE') return { ok: true, async json() { return {}; } };
        if (text.includes('/pipelines?')) return { ok: true, async json() { pipelineQueries += 1; return [{ id: 2, source: 'schedule', created_at: '2026-07-15T07:14:00Z' }]; } };
        return { ok: true, async json() { return { id: 99, description: `zj-loop.schedule_probe.v1:probe-20260715T071100000Z`, ref: 'main', cron: '14 15 * * *', cron_timezone: 'Asia/Shanghai' }; } };
      },
    });
    assert.equal(result.status, 'completed', JSON.stringify(result));
    assert.equal(result.pipeline.id, 2);
    assert.equal(pipelineQueries, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('owned GitLab schedule probe plans a single owned schedule and replay state', () => {
  const result = planGitLabScheduleProbe({
    project: 'group/project',
    dueInMinutes: 3,
    confirmation: SCHEDULE_PROBE_CONFIRMATION,
    now: '2026-07-15T07:11:00Z',
    timezone: 'Asia/Shanghai',
    ref: 'main',
  });

  assert.equal(result.status, 'armed');
  assert.equal(result.temporary_schedule.cron, '14 15 * * *');
  assert.equal(result.temporary_schedule.cron_timezone, 'Asia/Shanghai');
  assert.match(result.temporary_schedule.description, /^zj-loop\.schedule_probe\.v1:/);
  assert.match(result.state_path, /^zj-loop\/schedule-probes\/probe-.+\.json$/);
  assert.deepEqual(result.operations, ['create-owned-schedule', 'poll-scheduled-pipeline', 'guarded-delete-owned-schedule']);
});
