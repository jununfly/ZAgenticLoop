import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runGitLabIssueNoteBridgeConsumer } from '../dist/index.js';

const baseEnv = {
  CI_PIPELINE_SOURCE: 'api',
  CI_COMMIT_REF_NAME: 'master',
  CI_PROJECT_PATH: 'mlive-dev/ai-studio',
  CI_PROJECT_ID: '52131',
  CI_JOB_TOKEN: 'job-token',
  CI_API_V4_URL: 'https://git.bilibili.co/api/v4',
  ZJ_LOOP_BRIDGE_EVENT_ID: 'event-123',
  ZJ_LOOP_BRIDGE_DEDUPE_KEY: 'gln_abc',
  ZJ_LOOP_BRIDGE_PROJECT_PATH: 'mlive-dev/ai-studio',
  ZJ_LOOP_BRIDGE_ISSUE_IID: '11',
  ZJ_LOOP_BRIDGE_NOTE_ID: '22',
  ZJ_LOOP_BRIDGE_TARGET_ROUTE: 'roadmap-sliced-development',
  ZJ_LOOP_BRIDGE_ENVELOPE_REF: 'zj-loop-state/receipts/event-123.json',
};

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'zj-loop-bridge-consumer-'));
  await mkdir(path.join(root, 'zj-loop/registrations'), { recursive: true });
  await writeFile(path.join(root, 'zj-loop/registrations/project.yaml'), `schema: zj-loop.project-registration.v1
project_path: mlive-dev/ai-studio
default_branch: master
routes:
  - route_id: roadmap-sliced-development
    marker: /zj-loop start roadmap-sliced-development
    default_executor:
      kind: gitlab-pipeline
      profile: ai-studio-master-pipeline
    allowed_executors:
      - kind: gitlab-pipeline
        profile: ai-studio-master-pipeline
initiators:
  pipeline_request:
    allowed_gitlab_user_ids: [81]
`);
  await writeFile(path.join(root, 'zj-loop/zj-loop-route-table.yaml'), `schema_version: 1
kind: zj-loop-route-table
routes:
  - route_id: roadmap-sliced-development
    enabled: true
    request_kind: activation-comment
    consumer: roadmap-sliced-development
`);
  return root;
}

function fetchImpl(url) {
  if (url.includes('/issues/')) return Promise.resolve({ status: 200, async json() { return { id: 22, noteable_iid: 11, noteable_type: 'Issue', body: '/zj-loop start roadmap-sliced-development', author: { id: 81 }, system: false }; } });
  return Promise.resolve({ status: 200, async json() { return { path_with_namespace: 'mlive-dev/ai-studio' }; } });
}

test('A consumer validates the fixed API/master/project/registration binding without writes', async () => {
  const root = await fixture();
  const result = await runGitLabIssueNoteBridgeConsumer({ root, env: baseEnv, fetchImpl });
  assert.equal(result.status, 'completed');
  assert.equal(result.side_effects_executed, false);
  assert.equal(result.registration.executor_profile, 'ai-studio-master-pipeline');
  assert.match(result.registration.sha256, /^[a-f0-9]{64}$/);
});

test('A consumer fails closed for non-API pipelines and never calls a provider', async () => {
  const root = await fixture();
  const result = await runGitLabIssueNoteBridgeConsumer({ root, env: { ...baseEnv, CI_PIPELINE_SOURCE: 'web' }, fetchImpl });
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'pipeline-source-api-required');
  assert.equal(result.side_effects_executed, false);
});

test('A consumer fails closed when the project Registration is missing or mismatched', async () => {
  const root = await fixture();
  const missing = await runGitLabIssueNoteBridgeConsumer({ root: await mkdtemp(path.join(tmpdir(), 'zj-loop-bridge-missing-')), env: baseEnv, fetchImpl });
  assert.equal(missing.reason, 'project-registration-required');
  const mismatch = await runGitLabIssueNoteBridgeConsumer({ root, env: { ...baseEnv, ZJ_LOOP_BRIDGE_PROJECT_PATH: 'other/project' }, fetchImpl });
  assert.equal(mismatch.reason, 'bridge-project-mismatch');
});
