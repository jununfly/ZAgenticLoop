import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { GitLabInfraError, GitLabReadClient } from '../dist/index.js';

const responses = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, async json() { return body; } });

async function withServer(handler, callback) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  try {
    return await callback(`http://127.0.0.1:${address.port}/api/v4`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function sendJson(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}

test('real HTTP boundary encodes project paths, sends auth, and reads all resources', async () => {
  const requests = [];
  await withServer((request, response) => {
    requests.push({ method: request.method, url: request.url, token: request.headers['private-token'], accept: request.headers.accept });
    if (request.url === '/api/v4/version') return sendJson(response, 200, { version: '16.11.8', revision: 'abc' });
    if (request.url === '/api/v4/projects/group%2Fproject/pipeline_schedules/961') return sendJson(response, 200, { id: 961, active: true, updated_at: '2026-07-21T00:00:00Z', next_run_at: '2026-07-21T01:00:00Z', cron: '0 9 * * *', cron_timezone: 'Asia/Shanghai' });
    if (request.url === '/api/v4/projects/group%2Fproject/pipelines?source=schedule&per_page=20') return sendJson(response, 200, [{ id: 42, source: 'schedule', ref: 'master', sha: 'deadbeef', status: 'success', created_at: '2026-07-21T01:00:00Z', web_url: 'https://gitlab.example/pipelines/42' }]);
    if (request.url === '/api/v4/projects/group%2Fproject/pipelines/42/jobs') return sendJson(response, 200, [{ id: 7, name: 'zj_loop_changelog_drafter', status: 'success', ref: 'master', pipeline: { id: 42 }, web_url: 'https://gitlab.example/jobs/7' }]);
    if (request.url === '/api/v4/projects/group%2Fproject/jobs/7/artifacts/evidence.json') return sendJson(response, 200, { schema: 'example.v1', status: 'completed' });
    if (request.url === '/api/v4/projects/group%2Fproject/issues?state=opened&per_page=100') return sendJson(response, 200, [{ iid: 11, state: 'opened', title: 'carrier', description: '<!-- zj-loop:issue-fix-request -->', web_url: 'https://gitlab.example/issues/11' }]);
    if (request.url === '/api/v4/projects/group%2Fproject/merge_requests?state=opened&per_page=100') return sendJson(response, 200, [{ iid: 12, state: 'opened', title: 'repair', description: '<!-- zj-loop:repair-dedupe -->', source_branch: 'automated/repair', target_branch: 'main', web_url: 'https://gitlab.example/mrs/12' }]);
    if (request.url === '/api/v4/projects/group%2Fproject/repository/branches?per_page=100') return sendJson(response, 200, [{ name: 'automated/repair', web_url: 'https://gitlab.example/branches/repair', commit: { id: 'deadbeef' } }]);
    if (request.url === '/api/v4/projects/group%2Fproject/issues/11/notes?per_page=100') return sendJson(response, 200, [{ id: 21, body: '<!-- zj-loop:claim -->', created_at: '2026-07-21T00:00:00Z', noteable_url: 'https://gitlab.example/issues/11' }]);
    sendJson(response, 404, { message: 'unexpected path' });
  }, async (apiUrl) => {
    const client = new GitLabReadClient({ apiUrl, projectPath: 'group/project', token: 'secret-token' });
    const capability = await client.preflight();
    assert.equal(capability.status, 'ready');
    assert.deepEqual(await client.readSchedule(961), { id: 961, active: true, updated_at: '2026-07-21T00:00:00Z', next_run_at: '2026-07-21T01:00:00Z', cron: '0 9 * * *', cron_timezone: 'Asia/Shanghai' });
    assert.equal((await client.listScheduledPipelines())[0].id, 42);
    assert.equal((await client.listPipelineJobs(42))[0].pipeline_id, 42);
    assert.equal((await client.readJobArtifact(7, 'evidence.json')).schema, 'example.v1');
    assert.equal((await client.listIssues())[0].iid, 11);
    assert.equal((await client.listMergeRequests())[0].iid, 12);
    assert.equal((await client.listBranches())[0].commit_sha, 'deadbeef');
    assert.equal((await client.listIssueNotes(11))[0].id, 21);
  });
  assert.equal(requests.length, 9);
  for (const request of requests) {
    assert.equal(request.method, 'GET');
    assert.equal(request.token, 'secret-token');
    assert.equal(request.accept, 'application/json');
  }
  assert.ok(requests.some((request) => request.url === '/api/v4/projects/group%2Fproject/pipeline_schedules/961'));
});

test('real HTTP boundary classifies rate limits and permission failures', async () => {
  await withServer((request, response) => {
    if (request.url === '/api/v4/version') return sendJson(response, 429, { message: 'too many requests' });
    if (request.url === '/api/v4/projects/group%2Fproject/pipeline_schedules/961') return sendJson(response, 403, { message: 'denied' });
    sendJson(response, 404, { message: 'unexpected path' });
  }, async (apiUrl) => {
    const rateLimited = new GitLabReadClient({ apiUrl, projectPath: 'group/project' });
    await assert.rejects(() => rateLimited.readVersion(), (error) => error instanceof GitLabInfraError && error.code === 'rate-limited' && error.status === 429);

    const permissionDenied = new GitLabReadClient({ apiUrl, projectPath: 'group/project' });
    await assert.rejects(() => permissionDenied.readSchedule(961), (error) => error instanceof GitLabInfraError && error.code === 'permission-denied' && error.status === 403);
  });
});

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
