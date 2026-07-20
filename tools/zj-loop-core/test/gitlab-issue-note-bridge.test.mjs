import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGitLabIssueNoteBridgeEnvelope } from '../dist/index.js';

const route = {
  routeId: 'roadmap-activation-note',
  marker: '/zj-loop start roadmap-sliced-development',
  targetRoute: 'roadmap-sliced-development',
  targetRef: 'master',
};

const base = {
  headers: { event: 'Issue Hook', eventId: 'event-1', webhookSecret: 'webhook-secret' },
  projectPath: 'mlive-dev/ai-studio',
  expectedProjectPath: 'mlive-dev/ai-studio',
  expectedWebhookSecret: 'webhook-secret',
  route,
  receivedAt: '2026-07-17T00:00:00.000Z',
  payload: {
    object_kind: 'issue',
    project: { path_with_namespace: 'mlive-dev/ai-studio', web_url: 'https://git.example/mlive-dev/ai-studio' },
    issue: { iid: 42, web_url: 'https://git.example/mlive-dev/ai-studio/-/issues/42' },
    object_attributes: {
      id: 99,
      note: '/zj-loop start roadmap-sliced-development',
      noteable_type: 'Issue',
      noteable_iid: 42,
      action: 'create',
      url: 'https://git.example/mlive-dev/ai-studio/-/issues/42#note_99',
    },
  },
};

test('accepts a fixed Issue Note marker and emits only a lightweight envelope', () => {
  const result = buildGitLabIssueNoteBridgeEnvelope(base);
  assert.equal(result.status, 'accepted');
  assert.equal(result.side_effects_executed, false);
  assert.deepEqual(result.envelope, {
    schema: 'zj-loop.gitlab_issue_note_bridge.v1',
    event_id: 'event-1',
    event_type: 'Issue Hook',
    project_path: 'mlive-dev/ai-studio',
    issue_iid: 42,
    note_id: 99,
    mr_iid: null,
    source_url: 'https://git.example/mlive-dev/ai-studio/-/issues/42#note_99',
    target_route: 'roadmap-sliced-development',
    target_ref: 'master',
    received_at: '2026-07-17T00:00:00.000Z',
    dedupe_key: 'gln_757de08c509451e7',
    auth_source: 'GITLAB_WEBHOOK_SECRET',
    trigger_pipeline_id: null,
  });
  assert.equal(JSON.stringify(result).includes('webhook-secret'), false);
  assert.equal(JSON.stringify(result).includes('roadmap-sliced-development'), true);
});

test('ignores ordinary Issue Notes without provider side effects', () => {
  const result = buildGitLabIssueNoteBridgeEnvelope({
    ...base,
    payload: {
      ...base.payload,
      object_attributes: { ...base.payload.object_attributes, note: 'ordinary discussion' },
    },
  });
  assert.equal(result.status, 'ignored');
  assert.equal(result.envelope, null);
  assert.equal(result.side_effects_executed, false);
});

test('fails closed for authentication, project, event, event id, and payload mismatches', () => {
  const cases = [
    [{ headers: { ...base.headers, webhookSecret: 'wrong' } }, 'unauthorized'],
    [{ projectPath: 'other/project' }, 'project-mismatch'],
    [{ payload: { ...base.payload, project: { path_with_namespace: 'other/project' } } }, 'project-mismatch'],
    [{ headers: { ...base.headers, event: 'Merge Request Hook' } }, 'event-not-allowed'],
    [{ headers: { ...base.headers, eventId: '' } }, 'event-id-required'],
    [{ payload: { ...base.payload, object_attributes: { ...base.payload.object_attributes, action: 'update' } } }, 'issue-note-invalid'],
  ];
  for (const [override, reason] of cases) {
    const result = buildGitLabIssueNoteBridgeEnvelope({ ...base, ...override });
    assert.equal(result.status, 'blocked');
    assert.equal(result.reason, reason);
    assert.equal(result.side_effects_executed, false);
    assert.equal(result.envelope, null);
  }
});
