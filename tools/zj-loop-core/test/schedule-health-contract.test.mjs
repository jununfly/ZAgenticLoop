import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateScheduleHealth, inspectGitLabScheduleHealth } from '../dist/schedule-health-contract.js';

const target = { provider: 'gitlab', project: 'group/project', route_id: 'issue-backlog-triage', schedule_id: '957', job: 'zj_loop_issue_triage', artifact: 'issue-recommendations.json', artifact_schema: 'zj-loop.issue_recommendations.v1' };

test('schedule health is not_due before the expected window', () => {
  const result = evaluateScheduleHealth({ target, now: '2026-07-15T00:05:00Z', schedule: { active: true, updated_at: '2026-07-15T00:00:00Z', next_run_at: '2026-07-15T01:00:00Z' } });
  assert.equal(result.status, 'not_due');
  assert.deepEqual(result.next_steps, []);
});

test('schedule health derives the first expected window from cron after schedule update', () => {
  const result = evaluateScheduleHealth({
    target,
    now: '2026-07-16T00:05:00Z',
    schedule: {
      active: true,
      updated_at: '2026-07-15T05:49:55.667Z',
      cron: '0 9 * * *',
      cron_timezone: 'Asia/Shanghai',
    },
  });

  assert.equal(result.status, 'not_due');
  assert.deepEqual(result.expected_window, {
    start: '2026-07-16T01:00:00.000Z',
    grace_minutes: 10,
  });
});

test('schedule health accepts an explicit first-window override for controlled checks', () => {
  const result = evaluateScheduleHealth({
    target,
    now: '2026-07-15T00:02:00Z',
    expectedWithinMinutes: 3,
    schedule: {
      active: true,
      updated_at: '2026-07-15T00:00:00Z',
      cron: '0 9 * * *',
      cron_timezone: 'Asia/Shanghai',
    },
  });

  assert.equal(result.status, 'not_due');
  assert.equal(result.expected_window.start, '2026-07-15T00:03:00.000Z');
});

test('schedule health replay command preserves its explicit window override', () => {
  const result = evaluateScheduleHealth({
    target,
    now: '2026-07-15T00:20:00Z',
    expectedWithinMinutes: 3,
    audit: { api_url: 'https://gitlab.example/api/v4' },
    schedule: {
      active: true,
      updated_at: '2026-07-15T00:00:00Z',
      cron: '0 9 * * *',
      cron_timezone: 'Asia/Shanghai',
    },
  });

  assert.equal(result.status, 'execution_missing');
  assert.deepEqual(result.next_steps[0].command.slice(-4), [
    '--api-url', 'https://gitlab.example/api/v4',
    '--expected-within-minutes', '3',
  ]);
});

test('schedule health remains healthy between cron windows when current scheduled evidence exists', () => {
  const result = evaluateScheduleHealth({
    target,
    now: '2026-07-16T02:00:00Z',
    schedule: {
      active: true,
      updated_at: '2026-07-15T05:49:55.667Z',
      cron: '0 9 * * *',
      cron_timezone: 'Asia/Shanghai',
    },
    pipeline: {
      source: 'schedule',
      created_at: '2026-07-16T01:03:00Z',
      job: 'zj_loop_issue_triage',
      artifact: 'issue-recommendations.json',
      artifact_schema: 'zj-loop.issue_recommendations.v1',
    },
  });

  assert.equal(result.status, 'healthy');
  assert.deepEqual(result.expected_window, {
    start: '2026-07-16T01:00:00.000Z',
    next_start: '2026-07-17T01:00:00.000Z',
    grace_minutes: 10,
  });
});

test('schedule health rejects scheduled evidence from an earlier cron window', () => {
  const result = evaluateScheduleHealth({
    target,
    now: '2026-07-17T02:00:00Z',
    schedule: {
      active: true,
      updated_at: '2026-07-15T05:49:55.667Z',
      cron: '0 9 * * *',
      cron_timezone: 'Asia/Shanghai',
    },
    pipeline: {
      source: 'schedule',
      created_at: '2026-07-16T01:03:00Z',
      job: 'zj_loop_issue_triage',
      artifact: 'issue-recommendations.json',
      artifact_schema: 'zj-loop.issue_recommendations.v1',
    },
  });

  assert.equal(result.status, 'execution_missing');
  assert.equal(result.escalation.reason, 'scheduled-pipeline-missing');
});

test('schedule health evaluates weekday cron in the configured timezone', () => {
  const result = evaluateScheduleHealth({
    target,
    now: '2026-07-12T16:05:00Z',
    schedule: {
      active: true,
      updated_at: '2026-07-12T16:00:00Z',
      cron: '0 9 * * 1-5',
      cron_timezone: 'Asia/Shanghai',
    },
  });

  assert.equal(result.status, 'not_due');
  assert.equal(result.expected_window.start, '2026-07-13T01:00:00.000Z');
});

test('schedule health escalates when the expected window passes without a current scheduled pipeline', () => {
  const result = evaluateScheduleHealth({ target, now: '2026-07-15T02:00:00Z', schedule: { active: true, updated_at: '2026-07-15T00:00:00Z', next_run_at: '2026-07-15T01:00:00Z' } });
  assert.equal(result.status, 'execution_missing');
  assert.equal(result.escalation.reason, 'scheduled-pipeline-missing');
  assert.deepEqual(result.next_steps[0].command, [
    'zj-loop-doctor',
    '--provider', 'gitlab',
    '--schedule-health',
    '--project', 'group/project',
    '--route', 'issue-backlog-triage',
    '--schedule-id', '957',
    '--job', 'zj_loop_issue_triage',
    '--artifact', 'issue-recommendations.json',
    '--artifact-schema', 'zj-loop.issue_recommendations.v1',
  ]);
});

test('schedule health accepts only a current scheduled pipeline with the expected artifact schema', () => {
  const result = evaluateScheduleHealth({ target, now: '2026-07-15T02:00:00Z', schedule: { active: true, updated_at: '2026-07-15T00:00:00Z', next_run_at: '2026-07-15T01:00:00Z' }, pipeline: { source: 'schedule', created_at: '2026-07-15T01:01:00Z', job: 'zj_loop_issue_triage', artifact: 'issue-recommendations.json', artifact_schema: 'zj-loop.issue_recommendations.v1' } });
  assert.equal(result.status, 'healthy');
});

test('GitLab adapter reads schedule and latest scheduled pipeline without mutations', async () => {
  const calls = [];
  const result = await inspectGitLabScheduleHealth({ target, apiUrl: 'https://gitlab.example/api/v4', token: 'token', now: '2026-07-15T02:00:00Z', fetchImpl: async (url) => {
    calls.push(String(url));
    const body = String(url).includes('pipeline_schedules/957') ? { active: true, updated_at: '2026-07-15T00:00:00Z', next_run_at: '2026-07-15T01:00:00Z' } : [];
    return { ok: true, async json() { return body; } };
  } });
  assert.equal(result.status, 'execution_missing');
  assert.equal(result.audit.auth_source, 'injected');
  assert.deepEqual(result.next_steps[0].command.slice(-2), ['--api-url', 'https://gitlab.example/api/v4']);
  assert.equal(calls.length, 2);
});

test('GitLab adapter records the selected injected credential source without exposing its value', async () => {
  const result = await inspectGitLabScheduleHealth({
    target,
    apiUrl: 'https://gitlab.example/api/v4',
    token: 'secret-token',
    tokenSource: 'GITLAB_PRIVATE_TOKEN',
    now: '2026-07-15T02:00:00Z',
    fetchImpl: async () => ({ ok: false, async json() { return {}; } }),
  });

  assert.equal(result.status, 'configuration_missing');
  assert.equal(result.audit.auth_source, 'GITLAB_PRIVATE_TOKEN');
  assert.doesNotMatch(JSON.stringify(result), /secret-token/);
});

test('GitLab adapter validates the explicit job artifact schema', async () => {
  const result = await inspectGitLabScheduleHealth({ target, apiUrl: 'https://gitlab.example/api/v4', token: 'token', now: '2026-07-15T02:00:00Z', fetchImpl: async (url) => {
    const text = String(url);
    const body = text.includes('pipeline_schedules/957') ? { active: true, updated_at: '2026-07-15T00:00:00Z', next_run_at: '2026-07-15T01:00:00Z' } : text.includes('/pipelines?') ? [{ id: 42, source: 'schedule', created_at: '2026-07-15T01:01:00Z' }] : text.includes('/pipelines/42/jobs') ? [{ id: 7, name: 'zj_loop_issue_triage' }] : { schema: 'zj-loop.issue_recommendations.v1' };
    return { ok: true, async json() { return body; } };
  } });
  assert.equal(result.status, 'healthy');
});
