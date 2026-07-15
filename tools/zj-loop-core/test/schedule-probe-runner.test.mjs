import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { cleanupGitLabOwnedSchedule, createGitLabOwnedSchedule, readGitLabOwnedSchedulePipeline, readGitLabScheduleProbeReceipt, planGitLabScheduleProbe, readGitLabScheduleProbeState, runGitLabScheduleProbe, SCHEDULE_PROBE_CONFIRMATION, writeGitLabScheduleProbeState } from '../dist/schedule-probe-runner.js';

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
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /projects\/group%2Fproject\/pipeline_schedules$/);
  assert.equal(calls[0].init.method, 'POST');
  assert.match(calls[0].init.body, /zj-loop\.schedule_probe\.v1/);
  assert.match(calls[0].init.body, /ZJ_LOOP_SCHEDULE_PROBE_ID/);
  assert.equal(calls[1].init.method, undefined);
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

test('owned GitLab schedule probe refuses cleanup when its probe variable drifts', async () => {
  const plan = planGitLabScheduleProbe({ project: 'group/project', dueInMinutes: 3, confirmation: SCHEDULE_PROBE_CONFIRMATION, now: '2026-07-15T07:11:00Z', ref: 'main' });
  const calls = [];
  const result = await cleanupGitLabOwnedSchedule({
    plan: { ...plan, owned_schedule_id: 99 }, token: 'token', apiUrl: 'https://gitlab.example/api/v4',
    fetchImpl: async (url, init = {}) => {
      calls.push({ url: String(url), init });
      return { ok: true, async json() { return { id: 99, ...plan.temporary_schedule, variables: [{ key: 'ZJ_LOOP_SCHEDULE_PROBE_ID', value: 'other-probe', variable_type: 'env_var' }] }; } };
    },
  });

  assert.equal(result.status, 'escalated');
  assert.equal(result.reason, 'owned-schedule-identity-mismatch');
  assert.equal(calls.length, 1);
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

test('owned GitLab schedule probe follows only its schedule last_pipeline and verifies the pipeline identity', async () => {
  const plan = planGitLabScheduleProbe({ project: 'group/project', ref: 'probe-branch', dueInMinutes: 3, confirmation: SCHEDULE_PROBE_CONFIRMATION, now: '2026-07-15T07:11:00Z' });
  const calls = [];
  const result = await readGitLabOwnedSchedulePipeline({
    plan: { ...plan, owned_schedule_id: 99, armed_at: '2026-07-15T07:11:00Z' }, token: 'token', apiUrl: 'https://gitlab.example/api/v4',
    fetchImpl: async (url) => {
      calls.push(String(url));
      return String(url).endsWith('/pipeline_schedules/99')
        ? { ok: true, async json() { return { last_pipeline: { id: 2 } }; } }
        : { ok: true, async json() { return { id: 2, source: 'schedule', ref: 'probe-branch', created_at: '2026-07-15T07:14:00Z' }; } };
    },
  });

  assert.equal(result.status, 'found');
  assert.equal(result.pipeline.id, 2);
  assert.match(calls[0], /pipeline_schedules\/99$/);
  assert.match(calls[1], /pipelines\/2$/);
});

test('owned GitLab schedule probe rejects a last_pipeline whose ref does not match the owned schedule', async () => {
  const plan = planGitLabScheduleProbe({ project: 'group/project', ref: 'probe-branch', dueInMinutes: 3, confirmation: SCHEDULE_PROBE_CONFIRMATION, now: '2026-07-15T07:11:00Z' });
  const result = await readGitLabOwnedSchedulePipeline({
    plan: { ...plan, owned_schedule_id: 99, armed_at: '2026-07-15T07:11:00Z' }, token: 'token', apiUrl: 'https://gitlab.example/api/v4',
    fetchImpl: async (url) => String(url).endsWith('/pipeline_schedules/99')
      ? { ok: true, async json() { return { last_pipeline: { id: 2 } }; } }
      : { ok: true, async json() { return { id: 2, source: 'schedule', ref: 'main', created_at: '2026-07-15T07:14:00Z' }; } },
  });

  assert.equal(result.status, 'invalid');
  assert.equal(result.reason, 'owned-schedule-pipeline-ref-mismatch');
});

test('owned GitLab schedule probe validates the fixed receipt artifact from its exact pipeline job', async () => {
  const plan = planGitLabScheduleProbe({ project: 'group/project', ref: 'probe-branch', dueInMinutes: 3, confirmation: SCHEDULE_PROBE_CONFIRMATION, now: '2026-07-15T07:11:00Z' });
  const result = await readGitLabScheduleProbeReceipt({
    plan, pipeline: { id: 2 }, token: 'token', apiUrl: 'https://gitlab.example/api/v4',
    fetchImpl: async (url) => String(url).endsWith('/pipelines/2/jobs?per_page=100')
      ? { ok: true, async json() { return [{ id: 3, name: 'zj_loop_schedule_probe_receipt', status: 'success' }]; } }
      : { ok: true, async text() { return JSON.stringify({ schema: 'zj-loop.gitlab_schedule_probe_receipt.v1', probe_id: plan.probe_id, pipeline_id: '2', project: 'group/project', ref: 'probe-branch', source: 'schedule' }); } },
  });

  assert.equal(result.status, 'found');
  assert.equal(result.receipt.pipeline_id, '2');
});

test('owned GitLab schedule probe rejects a receipt whose probe id does not match', async () => {
  const plan = planGitLabScheduleProbe({ project: 'group/project', ref: 'probe-branch', dueInMinutes: 3, confirmation: SCHEDULE_PROBE_CONFIRMATION, now: '2026-07-15T07:11:00Z' });
  const result = await readGitLabScheduleProbeReceipt({
    plan, pipeline: { id: 2 }, token: 'token', apiUrl: 'https://gitlab.example/api/v4',
    fetchImpl: async (url) => String(url).endsWith('/pipelines/2/jobs?per_page=100')
      ? { ok: true, async json() { return [{ id: 3, name: 'zj_loop_schedule_probe_receipt', status: 'success' }]; } }
      : { ok: true, async text() { return JSON.stringify({ schema: 'zj-loop.gitlab_schedule_probe_receipt.v1', probe_id: 'other', pipeline_id: '2', project: 'group/project', ref: 'probe-branch', source: 'schedule' }); } },
  });

  assert.equal(result.status, 'invalid');
  assert.equal(result.reason, 'schedule-probe-receipt-probe-id-mismatch');
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
        if (text.includes('/pipelines/2/jobs?')) return { ok: true, async json() { return [{ id: 3, name: 'zj_loop_schedule_probe_receipt', status: 'success' }]; } };
        if (text.includes('/jobs/3/artifacts/')) return { ok: true, async text() { return JSON.stringify({ schema: 'zj-loop.gitlab_schedule_probe_receipt.v1', probe_id: 'probe-20260715T071100000Z', pipeline_id: '2', project: 'group/project', ref: 'main', source: 'schedule' }); } };
        if (text.endsWith('/pipelines/2')) return { ok: true, async json() { pipelineQueries += 1; return { id: 2, source: 'schedule', ref: 'main', created_at: '2026-07-15T07:14:00Z' }; } };
        return { ok: true, async json() { return { id: 99, description: `zj-loop.schedule_probe.v1:probe-20260715T071100000Z`, ref: 'main', cron: '14 15 * * *', cron_timezone: 'Asia/Shanghai', variables: [{ key: 'ZJ_LOOP_SCHEDULE_PROBE_ID', value: 'probe-20260715T071100000Z', variable_type: 'env_var' }], last_pipeline: { id: 2 } }; } };
      },
    });
    assert.equal(result.status, 'completed', JSON.stringify(result));
    assert.equal(result.pipeline.id, 2);
    assert.equal(pipelineQueries, 1);
    const state = await readGitLabScheduleProbeState({ root, probeId: result.probe_id });
    assert.equal(state.status, 'cleaned');
    assert.equal(state.cleanup_outcome, 'cleaned');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('owned GitLab schedule probe exposes persisted arm state for signal-safe cleanup', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'zj-loop-schedule-probe-signal-'));
  try {
    let armedState;
    await runGitLabScheduleProbe({
      root, project: 'group/project', ref: 'main', dueInMinutes: 3, confirmation: SCHEDULE_PROBE_CONFIRMATION,
      token: 'token', apiUrl: 'https://gitlab.example/api/v4', now: '2026-07-15T07:11:00Z', nowFn: () => new Date('2026-07-15T07:12:00Z'),
      onArmed: (state) => { armedState = state; },
      fetchImpl: async (url, init = {}) => {
        if (init.method === 'POST') return { ok: true, async json() { return { id: 99 }; } };
        if (init.method === 'DELETE') return { ok: true, async json() { return {}; } };
        if (String(url).includes('/pipelines/2/jobs?')) return { ok: true, async json() { return [{ id: 3, name: 'zj_loop_schedule_probe_receipt', status: 'success' }]; } };
        if (String(url).includes('/jobs/3/artifacts/')) return { ok: true, async text() { return JSON.stringify({ schema: 'zj-loop.gitlab_schedule_probe_receipt.v1', probe_id: 'probe-20260715T071100000Z', pipeline_id: '2', project: 'group/project', ref: 'main', source: 'schedule' }); } };
        if (String(url).endsWith('/pipelines/2')) return { ok: true, async json() { return { id: 2, source: 'schedule', ref: 'main', created_at: '2026-07-15T07:14:00Z' }; } };
        return { ok: true, async json() { return { id: 99, description: 'zj-loop.schedule_probe.v1:probe-20260715T071100000Z', ref: 'main', cron: '14 07 * * *', cron_timezone: 'UTC', variables: [{ key: 'ZJ_LOOP_SCHEDULE_PROBE_ID', value: 'probe-20260715T071100000Z', variable_type: 'env_var' }], last_pipeline: { id: 2 } }; } };
      },
    });
    assert.equal(armedState?.owned_schedule_id, 99);
    assert.equal(armedState?.status, 'armed');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('owned GitLab schedule probe stops polling on cancellation without competing cleanup', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'zj-loop-schedule-probe-cancel-'));
  try {
    const controller = new AbortController();
    const calls = [];
    const result = await runGitLabScheduleProbe({
      root, project: 'group/project', ref: 'main', dueInMinutes: 3, confirmation: SCHEDULE_PROBE_CONFIRMATION,
      token: 'token', apiUrl: 'https://gitlab.example/api/v4', now: '2026-07-15T07:11:00Z', signal: controller.signal,
      onArmed: () => controller.abort(),
      fetchImpl: async (url, init = {}) => {
        calls.push({ url: String(url), init });
        if (init.method === 'POST') return { ok: true, async json() { return { id: 99 }; } };
        return { ok: true, async json() { return { id: 99, description: 'zj-loop.schedule_probe.v1:probe-20260715T071100000Z', ref: 'main', cron: '14 07 * * *', cron_timezone: 'UTC', variables: [{ key: 'ZJ_LOOP_SCHEDULE_PROBE_ID', value: 'probe-20260715T071100000Z', variable_type: 'env_var' }] }; } };
      },
    });

    assert.equal(result.status, 'interrupted');
    assert.equal(result.reason, 'signal-received');
    assert.equal(calls.filter((call) => call.init.method === 'DELETE').length, 0);
    const state = await readGitLabScheduleProbeState({ root, probeId: result.probe_id });
    assert.equal(state.status, 'armed');
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
  assert.deepEqual(result.temporary_schedule.variables, [{ key: 'ZJ_LOOP_SCHEDULE_PROBE_ID', value: result.probe_id, variable_type: 'env_var' }]);
  assert.match(result.temporary_schedule.description, /^zj-loop\.schedule_probe\.v1:/);
  assert.match(result.state_path, /^zj-loop\/schedule-probes\/probe-.+\.json$/);
  assert.deepEqual(result.operations, ['create-owned-schedule', 'poll-scheduled-pipeline', 'guarded-delete-owned-schedule']);
});
