import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGitLabIssueNoteBridgeServer } from '../dist/index.js';

const route = { routeId: 'bridge-roadmap-activation', marker: '/zj-loop start roadmap-sliced-development', targetRoute: 'roadmap-sliced-development', targetRef: 'master' };
const triggerConfig = { projectPath: 'group/project', routeId: 'bridge-roadmap-activation', pipelineRef: 'master', targetRoute: 'roadmap-sliced-development', allowedEventType: 'Issue Hook', enabled: true, maturity: 'install-ready' };
const payload = { object_kind: 'issue', project: { path_with_namespace: 'group/project' }, issue: { iid: 7 }, object_attributes: { id: 8, note: '/zj-loop start roadmap-sliced-development', noteable_type: 'Issue', noteable_iid: 7, action: 'create', url: 'https://git.example/group/project/-/issues/7#note_8' } };

async function withServer(config, callback) {
  const server = createGitLabIssueNoteBridgeServer(config);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try { return await callback(server.address().port); } finally { await new Promise((resolve) => server.close(resolve)); }
}

test('HTTP runtime validates the real webhook envelope, persists receipt, and triggers one fixed pipeline', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'zj-loop-http-'));
  try {
    let pipelineCalls = 0;
      const result = await withServer({ projectPath: 'group/project', route, triggerConfig, webhookSecret: 'webhook-secret', triggerToken: 'api-token', root, now: () => '2026-07-17T00:00:00.000Z', fetchImpl: async (_url, init) => { pipelineCalls += 1; assert.equal(init.headers['PRIVATE-TOKEN'], 'api-token'); return { status: 201, async json() { return { id: 321, ref: 'master', web_url: 'https://git.example/group/project/-/pipelines/321' }; } }; } }, async (port) => {
      const response = await fetch(`http://127.0.0.1:${port}/gitlab/webhook/issue-note`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-gitlab-event': 'Issue Hook', 'x-gitlab-event-uuid': 'http-event-1', 'x-gitlab-token': 'webhook-secret' }, body: JSON.stringify(payload) });
      return { status: response.status, body: await response.json() };
    });
    assert.equal(result.status, 202, JSON.stringify(result.body));
    assert.equal(result.body.status, 'triggered');
    assert.equal(result.body.trigger.pipeline.id, 321);
    assert.equal(pipelineCalls, 1);
    assert.equal(JSON.stringify(result.body).includes('bridge-token'), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('HTTP runtime exposes a side-effect-free health probe', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'zj-loop-http-'));
  try {
    const result = await withServer({ projectPath: 'group/project', route, triggerConfig, webhookSecret: 'webhook-secret', triggerToken: 'api-token', root, fetchImpl: async () => { throw new Error('must not trigger'); } }, async (port) => {
      const response = await fetch(`http://127.0.0.1:${port}/healthz`);
      return { status: response.status, body: await response.json() };
    });
    assert.equal(result.status, 200);
    assert.equal(result.body.status, 'ok');
    assert.equal(result.body.side_effects_executed, false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('HTTP runtime supports a configured webhook path while preserving path isolation', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'zj-loop-http-custom-path-'));
  try {
    let pipelineCalls = 0;
    const customPath = '/gitlab/webhook/ci-sweeper';
    const baseConfig = { projectPath: 'group/project', route, triggerConfig, webhookSecret: 'webhook-secret', triggerToken: 'api-token', webhookPath: customPath, root, fetchImpl: async () => { pipelineCalls += 1; return { status: 201, async json() { return { id: 322, ref: 'master', web_url: 'https://git.example/group/project/-/pipelines/322' }; } }; } };
    const custom = await withServer(baseConfig, async (port) => fetch(`http://127.0.0.1:${port}${customPath}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-gitlab-event': 'Issue Hook', 'x-gitlab-event-uuid': 'http-custom-path-1', 'x-gitlab-token': 'webhook-secret' }, body: JSON.stringify(payload) }));
    assert.equal(custom.status, 202);
    const legacy = await withServer(baseConfig, async (port) => fetch(`http://127.0.0.1:${port}/gitlab/webhook/issue-note`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-gitlab-event': 'Issue Hook', 'x-gitlab-event-uuid': 'http-custom-path-2', 'x-gitlab-token': 'webhook-secret' }, body: JSON.stringify(payload) }));
    assert.equal(legacy.status, 404);
    assert.equal(pipelineCalls, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('HTTP runtime ignores ordinary Notes and blocks bad secrets without triggering', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'zj-loop-http-'));
  try {
    let pipelineCalls = 0;
    const baseConfig = { projectPath: 'group/project', route, triggerConfig, webhookSecret: 'webhook-secret', triggerToken: 'api-token', root, fetchImpl: async () => { pipelineCalls += 1; throw new Error('must not trigger'); } };
    const ordinary = await withServer(baseConfig, async (port) => fetch(`http://127.0.0.1:${port}/gitlab/webhook/issue-note`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-gitlab-event': 'Issue Hook', 'x-gitlab-event-uuid': 'http-event-2', 'x-gitlab-token': 'webhook-secret' }, body: JSON.stringify({ ...payload, object_attributes: { ...payload.object_attributes, note: 'ordinary discussion' } }) }));
    assert.equal(ordinary.status, 200);
    const badSecret = await withServer(baseConfig, async (port) => fetch(`http://127.0.0.1:${port}/gitlab/webhook/issue-note`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-gitlab-event': 'Issue Hook', 'x-gitlab-event-uuid': 'http-event-3', 'x-gitlab-token': 'wrong' }, body: JSON.stringify(payload) }));
    assert.equal(badSecret.status, 400);
    assert.equal(pipelineCalls, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('HTTP runtime creates an explicit agent-local handoff without triggering a pipeline', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'zj-loop-http-agent-local-'));
  try {
    let pipelineCalls = 0;
    const files = new Map();
    let head = 'state-head-1';
    const stateClient = {
      getHead: async () => head,
      readJson: async (filePath) => files.get(filePath) ?? null,
      list: async () => [],
      commit: async ({ last_commit_id, actions }) => {
        assert.equal(last_commit_id, head);
        head = 'state-head-2';
        for (const action of actions) files.set(action.file_path, JSON.parse(action.content));
        return { id: head };
      },
    };
    const ref = 'a'.repeat(40);
    const registrationText = `schema: zj-loop.project-registration.v1\nproject_path: group/project\ndefault_branch: master\nroutes:\n  - route_id: roadmap-sliced-development\n    marker: /zj-loop start roadmap-sliced-development\n    allowed_executors:\n      - kind: agent-local\n        profile: human-codex-mac\n        capabilities: [read-repository, modify-worktree]\n`;
    const { createHash } = await import('node:crypto');
    const request = { schema: 'zj-loop.agent_execution_request.v1', registration: { ref, path: 'zj-loop/registrations/project.yaml', sha256: createHash('sha256').update(registrationText).digest('hex') } };
    const agentNote = `/zj-loop start roadmap-sliced-development\n<!-- zj-loop.agent_execution_request.v1\n${JSON.stringify(request)}\n-->`;
    const result = await withServer({ projectPath: 'group/project', route, triggerConfig, webhookSecret: 'webhook-secret', triggerToken: 'api-token', root, agentLocal: { stateClient, resolveRegistration: async () => ({ text: registrationText, commit: ref, baseCommit: 'b'.repeat(40) }) }, fetchImpl: async () => { pipelineCalls += 1; throw new Error('pipeline must not trigger'); } }, async (port) => {
      const response = await fetch(`http://127.0.0.1:${port}/gitlab/webhook/issue-note`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-gitlab-event': 'Issue Hook', 'x-gitlab-event-uuid': 'http-agent-local-1', 'x-gitlab-token': 'webhook-secret' }, body: JSON.stringify({ ...payload, object_attributes: { ...payload.object_attributes, note: agentNote } }) });
      return { status: response.status, body: await response.json() };
    });
    assert.equal(result.status, 202, JSON.stringify(result.body));
    assert.equal(result.body.status, 'handoff-created');
    assert.equal(result.body.handoff.status, 'pending');
    assert.equal(pipelineCalls, 0);
    assert.equal(files.size, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});
