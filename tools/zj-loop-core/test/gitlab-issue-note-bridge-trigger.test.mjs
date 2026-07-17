import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGitLabIssueNoteBridgeEnvelope, triggerGitLabIssueNoteBridgePipeline } from '../dist/index.js';

const envelope = buildGitLabIssueNoteBridgeEnvelope({
  headers: { event: 'Issue Hook', eventId: 'event-trigger-1', triggerToken: 'secret' },
  projectPath: 'group/project', expectedProjectPath: 'group/project', expectedTriggerToken: 'secret',
  route: { routeId: 'bridge-roadmap-activation', marker: '/zj-loop start roadmap-sliced-development', targetRoute: 'roadmap-sliced-development', targetRef: 'master' },
  payload: { object_kind: 'issue', project: { path_with_namespace: 'group/project' }, issue: { iid: 7 }, object_attributes: { id: 8, note: '/zj-loop start roadmap-sliced-development', noteable_type: 'Issue', noteable_iid: 7, action: 'create' } },
}).envelope;

const config = { projectPath: 'group/project', routeId: 'bridge-roadmap-activation', pipelineRef: 'master', targetRoute: 'roadmap-sliced-development', allowedEventType: 'Issue Hook', enabled: true, maturity: 'install-ready' };

test('triggers only the fixed pipeline ref with the seven allowlisted variables', async () => {
  const calls = [];
  const result = await triggerGitLabIssueNoteBridgePipeline({ config, envelope, envelopeRef: 'zj-loop/evidence/envelope.json', token: 'secret', apiBaseUrl: 'https://git.example/api/v4', fetchImpl: async (url, init) => { calls.push({ url: String(url), init }); return { status: 201, async json() { return { id: 123, ref: 'master', web_url: 'https://git.example/group/project/-/pipelines/123' }; } }; } });
  assert.equal(result.status, 'triggered');
  assert.deepEqual(result.variable_keys, ['ZJ_LOOP_BRIDGE_EVENT_ID', 'ZJ_LOOP_BRIDGE_DEDUPE_KEY', 'ZJ_LOOP_BRIDGE_PROJECT_PATH', 'ZJ_LOOP_BRIDGE_ISSUE_IID', 'ZJ_LOOP_BRIDGE_NOTE_ID', 'ZJ_LOOP_BRIDGE_TARGET_ROUTE', 'ZJ_LOOP_BRIDGE_ENVELOPE_REF']);
  assert.equal(result.pipeline.id, 123);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /projects\/group%2Fproject\/pipeline$/);
  assert.equal(calls[0].init.redirect, 'manual');
  assert.deepEqual(JSON.parse(calls[0].init.body).ref, 'master');
  assert.equal(JSON.parse(calls[0].init.body).variables.length, 7);
  assert.equal(JSON.stringify(result).includes('secret'), false);
});

test('fails before API call for missing token, disabled route, mismatch, or extra-risk response', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; throw new Error('must not call'); };
  const missing = await triggerGitLabIssueNoteBridgePipeline({ config, envelope, envelopeRef: 'ref', fetchImpl });
  assert.equal(missing.reason, 'trigger-token-required');
  const disabled = await triggerGitLabIssueNoteBridgePipeline({ config: { ...config, enabled: false }, envelope, envelopeRef: 'ref', token: 'secret', fetchImpl });
  assert.equal(disabled.reason, 'route-not-triggerable');
  const mismatch = await triggerGitLabIssueNoteBridgePipeline({ config: { ...config, pipelineRef: 'other-ref' }, envelope, envelopeRef: 'ref', token: 'secret', fetchImpl });
  assert.equal(mismatch.reason, 'route-mismatch');
  assert.equal(calls, 0);
});

test('classifies provider failure, uncertain response, and response binding mismatch without response dumps', async () => {
  const make = (response) => triggerGitLabIssueNoteBridgePipeline({ config, envelope, envelopeRef: 'ref', token: 'secret', fetchImpl: async () => response });
  assert.equal((await make({ status: 403, async json() { return { token: 'must-not-persist' }; } })).reason, 'trigger-failed');
  assert.equal((await make({ status: 201, async json() { throw new Error('bad json'); } })).reason, 'trigger-uncertain');
  const mismatch = await make({ status: 201, async json() { return { id: 123, ref: 'other', web_url: 'https://git.example/group/project/-/pipelines/123' }; } });
  assert.equal(mismatch.reason, 'trigger-response-mismatch');
  assert.equal(JSON.stringify(mismatch).includes('must-not-persist'), false);
});
