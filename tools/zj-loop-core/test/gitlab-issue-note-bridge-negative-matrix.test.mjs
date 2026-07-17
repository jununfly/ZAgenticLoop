import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGitLabIssueNoteBridgeEnvelope, triggerGitLabIssueNoteBridgePipeline } from '../dist/index.js';

const envelope = buildGitLabIssueNoteBridgeEnvelope({
  headers: { event: 'Issue Hook', eventId: 'matrix-event-1', triggerToken: 'webhook-secret' },
  projectPath: 'group/project', expectedProjectPath: 'group/project', expectedTriggerToken: 'webhook-secret',
  route: { routeId: 'bridge-roadmap-activation', marker: '/zj-loop start roadmap-sliced-development', targetRoute: 'roadmap-sliced-development', targetRef: 'master' },
  payload: { object_kind: 'issue', project: { path_with_namespace: 'group/project' }, issue: { iid: 7 }, object_attributes: { id: 8, note: '/zj-loop start roadmap-sliced-development', noteable_type: 'Issue', noteable_iid: 7, action: 'create' } },
}).envelope;

const config = { projectPath: 'group/project', routeId: 'bridge-roadmap-activation', pipelineRef: 'master', targetRoute: 'roadmap-sliced-development', allowedEventType: 'Issue Hook', enabled: true, maturity: 'install-ready' };

function trigger(overrides = {}, response = { status: 201, async json() { return { id: 123, ref: 'master', web_url: 'https://git.example/group/project/-/pipelines/123' }; } }) {
  let calls = 0;
  return triggerGitLabIssueNoteBridgePipeline({ config: { ...config, ...overrides.config }, envelope: { ...envelope, ...overrides.envelope }, envelopeRef: overrides.envelopeRef ?? 'zj-loop/evidence/envelope.json', token: Object.hasOwn(overrides, 'token') ? overrides.token : 'bridge-token', apiBaseUrl: 'https://git.example/api/v4', fetchImpl: async () => { calls += 1; return response; } }).then((result) => ({ result, calls }));
}

test('negative matrix refuses before API call', async () => {
  const cases = [
    [{ token: undefined }, 'trigger-token-required'],
    [{ config: { enabled: false } }, 'route-not-triggerable'],
    [{ config: { projectPath: 'other/project' } }, 'route-mismatch'],
    [{ config: { pipelineRef: 'feature' } }, 'route-mismatch'],
    [{ config: { allowedEventType: 'Merge Request Hook' } }, 'event-type-mismatch'],
    [{ envelope: { target_route: 'other-route' } }, 'route-mismatch'],
    [{ envelope: { issue_iid: 0 } }, 'variable-contract-mismatch'],
    [{ envelopeRef: '' }, 'envelope-ref-required'],
  ];
  for (const [overrides, reason] of cases) {
    const { result, calls } = await trigger(overrides);
    assert.equal(result.status, 'blocked');
    assert.equal(result.reason, reason);
    assert.equal(calls, 0, reason);
    assert.equal(result.side_effects_executed, false);
  }
});

test('provider matrix distinguishes failed, uncertain, and response mismatch', async () => {
  const failed = await trigger({}, { status: 500, async json() { return { response_secret: 'do-not-store' }; } });
  assert.equal(failed.result.status, 'failed');
  assert.equal(failed.result.reason, 'trigger-failed');
  assert.equal(failed.result.provider_http_status, 500);

  const uncertain = await trigger({}, { status: 200, async json() { return {}; } });
  assert.equal(uncertain.result.status, 'uncertain');
  assert.equal(uncertain.result.reason, 'trigger-uncertain');

  const malformed = await trigger({}, { status: 201, async json() { throw new Error('raw response must not escape'); } });
  assert.equal(malformed.result.status, 'uncertain');
  assert.equal(malformed.result.reason, 'trigger-uncertain');

  const mismatch = await trigger({}, { status: 201, async json() { return { id: 123, ref: 'wrong-ref', web_url: 'https://git.example/group/project/-/pipelines/123' }; } });
  assert.equal(mismatch.result.status, 'failed');
  assert.equal(mismatch.result.reason, 'trigger-response-mismatch');
  assert.equal(JSON.stringify(failed.result).includes('do-not-store'), false);
  assert.equal(JSON.stringify(malformed.result).includes('raw response'), false);
});

test('positive matrix produces one triggered artifact with no secret or payload', async () => {
  const { result, calls } = await trigger();
  assert.equal(result.status, 'triggered');
  assert.equal(result.side_effects_executed, true);
  assert.equal(result.pipeline.id, 123);
  assert.equal(result.variable_keys.length, 7);
  assert.equal(calls, 1);
  assert.equal(JSON.stringify(result).includes('bridge-token'), false);
  assert.equal(JSON.stringify(result).includes('webhook-secret'), false);
  assert.equal(JSON.stringify(result).includes('/zj-loop start'), false);
});
