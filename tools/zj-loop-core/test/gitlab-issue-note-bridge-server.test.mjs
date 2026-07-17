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
    const result = await withServer({ projectPath: 'group/project', route, triggerConfig, token: 'bridge-token', root, now: () => '2026-07-17T00:00:00.000Z', fetchImpl: async () => { pipelineCalls += 1; return { status: 201, async json() { return { id: 321, ref: 'master', web_url: 'https://git.example/group/project/-/pipelines/321' }; } }; } }, async (port) => {
      const response = await fetch(`http://127.0.0.1:${port}/gitlab/webhook/issue-note`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-gitlab-event': 'Issue Hook', 'x-gitlab-event-uuid': 'http-event-1', 'x-gitlab-token': 'bridge-token' }, body: JSON.stringify(payload) });
      return { status: response.status, body: await response.json() };
    });
    assert.equal(result.status, 202);
    assert.equal(result.body.status, 'triggered');
    assert.equal(result.body.trigger.pipeline.id, 321);
    assert.equal(pipelineCalls, 1);
    assert.equal(JSON.stringify(result.body).includes('bridge-token'), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('HTTP runtime exposes a side-effect-free health probe', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'zj-loop-http-'));
  try {
    const result = await withServer({ projectPath: 'group/project', route, triggerConfig, token: 'bridge-token', root, fetchImpl: async () => { throw new Error('must not trigger'); } }, async (port) => {
      const response = await fetch(`http://127.0.0.1:${port}/healthz`);
      return { status: response.status, body: await response.json() };
    });
    assert.equal(result.status, 200);
    assert.equal(result.body.status, 'ok');
    assert.equal(result.body.side_effects_executed, false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('HTTP runtime ignores ordinary Notes and blocks bad secrets without triggering', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'zj-loop-http-'));
  try {
    let pipelineCalls = 0;
    const baseConfig = { projectPath: 'group/project', route, triggerConfig, token: 'bridge-token', root, fetchImpl: async () => { pipelineCalls += 1; throw new Error('must not trigger'); } };
    const ordinary = await withServer(baseConfig, async (port) => fetch(`http://127.0.0.1:${port}/gitlab/webhook/issue-note`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-gitlab-event': 'Issue Hook', 'x-gitlab-event-uuid': 'http-event-2', 'x-gitlab-token': 'bridge-token' }, body: JSON.stringify({ ...payload, object_attributes: { ...payload.object_attributes, note: 'ordinary discussion' } }) }));
    assert.equal(ordinary.status, 200);
    const badSecret = await withServer(baseConfig, async (port) => fetch(`http://127.0.0.1:${port}/gitlab/webhook/issue-note`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-gitlab-event': 'Issue Hook', 'x-gitlab-event-uuid': 'http-event-3', 'x-gitlab-token': 'wrong' }, body: JSON.stringify(payload) }));
    assert.equal(badSecret.status, 400);
    assert.equal(pipelineCalls, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});
