import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PREFLIGHT_SCHEMA, runPreflight } from './gitlab-issue-note-bridge-preflight.mjs';

const config = {
  schema: PREFLIGHT_SCHEMA,
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

test('preflight returns ready for matching read-only surfaces', async () => {
  const fake = fakeFetch();
  const result = await runPreflight({ config, token: 'redacted-token', fetchImpl: fake.fetchImpl });
  assert.equal(result.status, 'ready');
  assert.equal(result.side_effects_executed, false);
  assert.equal(fake.calls.length, 3);
  assert.equal(fake.calls.filter(({ options }) => options.method).length, 0);
});

test('preflight blocks before provider calls when token is missing', async () => {
  const fake = fakeFetch();
  const result = await runPreflight({ config, token: '', fetchImpl: fake.fetchImpl });
  assert.equal(result.reason, 'gitlab-token-required');
  assert.equal(fake.calls.length, 0);
});

test('preflight blocks project identity mismatch without continuing', async () => {
  const fake = fakeFetch({ project: { id: 99999 } });
  const result = await runPreflight({ config, token: 'redacted-token', fetchImpl: fake.fetchImpl });
  assert.equal(result.reason, 'project-mismatch');
  assert.equal(fake.calls.length, 1);
});

test('preflight blocks Hook mismatch before health check', async () => {
  const fake = fakeFetch({ hook: { note_events: false } });
  const result = await runPreflight({ config, token: 'redacted-token', fetchImpl: fake.fetchImpl });
  assert.equal(result.reason, 'hook-mismatch');
  assert.equal(fake.calls.length, 2);
});

test('preflight blocks unavailable bridge health', async () => {
  const fake = fakeFetch({ healthStatus: 503 });
  const result = await runPreflight({ config, token: 'redacted-token', fetchImpl: fake.fetchImpl });
  assert.equal(result.reason, 'bridge-unavailable');
  assert.equal(fake.calls.length, 3);
});
