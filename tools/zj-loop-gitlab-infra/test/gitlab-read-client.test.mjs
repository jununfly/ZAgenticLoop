import assert from 'node:assert/strict';
import test from 'node:test';

import { GitLabInfraError, GitLabReadClient } from '../dist/index.js';

const responses = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, async json() { return body; } });

test('preflight and read resources normalize GitLab responses with provenance', async () => {
  const calls = [];
  const client = new GitLabReadClient({ apiUrl: 'https://gitlab.example/api/v4', projectPath: 'group/project', token: 'secret', fetchImpl: async (url) => {
    calls.push(String(url));
    if (String(url).endsWith('/version')) return responses({ version: '16.11.8', revision: 'abc' });
    if (String(url).includes('pipeline_schedules/961')) return responses({ id: 961, active: true, updated_at: '2026-07-21T00:00:00Z', next_run_at: '2026-07-21T01:00:00Z', cron: '0 9 * * *', cron_timezone: 'Asia/Shanghai' });
    if (String(url).includes('pipelines?')) return responses([{ id: 42, source: 'schedule', ref: 'master', sha: 'deadbeef', status: 'success', created_at: '2026-07-21T01:00:00Z', web_url: 'https://gitlab.example/pipelines/42' }]);
    if (String(url).endsWith('/pipelines/42/jobs')) return responses([{ id: 7, name: 'zj_loop_changelog_drafter', status: 'success', ref: 'master', pipeline: { id: 42 }, web_url: 'https://gitlab.example/jobs/7' }]);
    return responses({ schema: 'example.v1', status: 'completed' });
  } });
  const capability = await client.preflight();
  assert.equal(capability.status, 'ready');
  assert.equal(capability.provenance.gitlab_version, '16.11.8');
  assert.deepEqual(await client.readSchedule(961), { id: 961, active: true, updated_at: '2026-07-21T00:00:00Z', next_run_at: '2026-07-21T01:00:00Z', cron: '0 9 * * *', cron_timezone: 'Asia/Shanghai' });
  assert.equal((await client.listScheduledPipelines())[0].id, 42);
  assert.equal((await client.listPipelineJobs(42))[0].pipeline_id, 42);
  assert.equal((await client.readJobArtifact(7, 'evidence.json')).schema, 'example.v1');
  assert.equal(calls.filter((url) => url.endsWith('/version')).length, 1);
});

test('provider errors are classified without exposing tokens', async () => {
  const client = new GitLabReadClient({ apiUrl: 'https://gitlab.example/api/v4', projectPath: 'group/project', token: 'secret-token', fetchImpl: async () => responses({ message: 'denied' }, 403) });
  await assert.rejects(() => client.readVersion(), (error) => {
    assert.ok(error instanceof GitLabInfraError);
    assert.equal(error.code, 'permission-denied');
    assert.doesNotMatch(JSON.stringify(error), /secret-token/);
    return true;
  });
});

test('invalid resource shapes fail closed', async () => {
  const client = new GitLabReadClient({ apiUrl: 'https://gitlab.example/api/v4', projectPath: 'group/project', fetchImpl: async (url) => String(url).includes('/pipelines?') ? responses([{ id: 'bad' }]) : responses({ version: '16.11.8' }) });
  await assert.rejects(() => client.listScheduledPipelines(), (error) => error.code === 'response-shape-invalid');
});
