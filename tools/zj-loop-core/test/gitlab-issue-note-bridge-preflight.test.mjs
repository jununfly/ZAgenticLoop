import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runGitLabIssueNoteBridgePreflight } from '../dist/index.js';

const CLI = fileURLToPath(new URL('../dist/gitlab-issue-note-bridge-preflight-cli.js', import.meta.url));

const config = {
  schema: 'zj-loop.gitlab_issue_note_bridge_verification.v1',
  gitlab_api_url: 'https://git.example/api/v4',
  project_path: 'group/project',
  project_id: '52131',
  hook_id: '15326',
  hook_url: 'https://bridge.example/gitlab/webhook/ci-sweeper',
  bridge_http_url: 'http://127.0.0.1:8080',
  pipeline_ref: 'master',
  target_route: 'ci-sweeper',
  marker: '/zj-loop start ci-sweeper',
};

function fakeFetch({ project = {}, hook = {}, healthStatus = 200 } = {}) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.includes('/hooks/')) return response(200, { project_id: 52131, url: config.hook_url, note_events: true, enable_ssl_verification: true, ...hook });
    if (url.endsWith('/healthz')) return response(healthStatus, {});
    return response(200, { id: 52131, path_with_namespace: config.project_path, ...project });
  };
  return { fetchImpl, calls };
}

function response(status, body) {
  return { status, async json() { return body; } };
}

test('core preflight returns ready for matching read-only surfaces', async () => {
  const fake = fakeFetch();
  const result = await runGitLabIssueNoteBridgePreflight({ config, token: 'redacted-token', fetchImpl: fake.fetchImpl });
  assert.equal(result.status, 'ready');
  assert.equal(result.side_effects_executed, false);
  assert.equal(fake.calls.length, 3);
  assert.equal(fake.calls.filter(({ options }) => options.method).length, 0);
});

test('core preflight blocks before provider calls when token is missing', async () => {
  const fake = fakeFetch();
  const result = await runGitLabIssueNoteBridgePreflight({ config, token: '', fetchImpl: fake.fetchImpl });
  assert.equal(result.reason, 'gitlab-token-required');
  assert.equal(fake.calls.length, 0);
});

test('core preflight blocks project identity mismatch', async () => {
  const fake = fakeFetch({ project: { id: 99999 } });
  const result = await runGitLabIssueNoteBridgePreflight({ config, token: 'redacted-token', fetchImpl: fake.fetchImpl });
  assert.equal(result.reason, 'project-mismatch');
  assert.equal(fake.calls.length, 1);
});

test('core preflight blocks Hook mismatch before health check', async () => {
  const fake = fakeFetch({ hook: { note_events: false } });
  const result = await runGitLabIssueNoteBridgePreflight({ config, token: 'redacted-token', fetchImpl: fake.fetchImpl });
  assert.equal(result.reason, 'hook-mismatch');
  assert.equal(fake.calls.length, 2);
});

test('core preflight blocks unavailable bridge health', async () => {
  const fake = fakeFetch({ healthStatus: 503 });
  const result = await runGitLabIssueNoteBridgePreflight({ config, token: 'redacted-token', fetchImpl: fake.fetchImpl });
  assert.equal(result.reason, 'bridge-unavailable');
  assert.equal(fake.calls.length, 3);
});

test('core preflight CLI requires an explicit manifest path', () => {
  const result = spawnSync(process.execPath, [CLI], { encoding: 'utf8', env: { ...process.env, GITLAB_TOKEN: '' } });
  assert.equal(result.status, 10);
  assert.equal(JSON.parse(result.stdout).reason, 'config-required');
});
