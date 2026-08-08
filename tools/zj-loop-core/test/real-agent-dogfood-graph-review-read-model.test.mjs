import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRealAgentDogfoodGraphPlan } from '../dist/real-agent-dogfood-graph-orchestrator.js';
import { projectRealAgentDogfoodGraphReviewReadModel } from '../dist/real-agent-dogfood-graph-review-read-model.js';
import { createInMemoryHumanSigner } from '../dist/human-signer.js';
import { createHumanApprovalUiServer } from '../dist/human-approval-ui.js';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';
import { createContentAddressedEvidenceStore } from '../dist/content-addressed-evidence-store.js';
import { createRealAgentDogfoodDraft, createRealAgentDogfoodTransition } from '../dist/real-agent-dogfood-lifecycle.js';
import { createRealAgentDogfoodGraphPhaseRecord, appendRealAgentDogfoodGraphPhaseRecord } from '../dist/real-agent-dogfood-graph-state.js';
import { createRealAgentDogfoodGraphReviewUpstream } from '../dist/real-agent-dogfood-graph-review-upstream.js';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const digest = (letter) => `sha256:${letter.repeat(64)}`;
const plan = createRealAgentDogfoodGraphPlan({
  dogfood_id: 'dogfood-review-model', execution_id: 'execution-review-model', attempt: 1,
  goal: 'Review a real Graph execution', repo_root: '/repo', baseline_commit: 'a'.repeat(40),
  target_worktree: '/tmp/target-review-model', source_worktree: '/tmp/source-review-model', verifier_worktree: '/tmp/verifier-review-model',
  evidence_store: '/tmp/evidence-review-model', allowed_files: ['README.md'], execution_mode: 'write-enabled', network_policy: 'network-allowed',
});

test('real Graph review projection preserves replay phase truth without legacy Graph UI fields', () => {
  const model = projectRealAgentDogfoodGraphReviewReadModel({
    plan,
    replay: {
      schema: 'zj-loop.real_agent_dogfood_graph_replay.v1', status: 'in-progress', integrity_status: 'complete', network_id: 'network-review-model', dogfood_id: plan.dogfood_id, execution_id: plan.execution_id, attempt: 1, plan_digest: plan.plan_digest, plan_definition_digest: plan.plan_definition_digest,
      lifecycle: { status: 'review-pending', reason_code: null, next_action: 'human-approval', lifecycle_digest: digest('b') },
      graph: { current_phase: 'independent_verification', phase_status: 'passed', completed_phases: ['source_execution', 'scope_observation', 'independent_verification'], next_phase: 'human_acceptance', evidence_refs: [digest('c')] }, integrity_failures: [], read_model_digest: digest('d'),
    },
    network_id: 'network-review-model',
  });
  assert.equal(model.schema, 'zj-loop.real_agent_dogfood_graph_review_read_model.v1');
  assert.equal(model.status, 'pending-human-review');
  assert.deepEqual(model.completed_phases, ['source_execution', 'scope_observation', 'independent_verification']);
  assert.equal(model.next_action.kind, 'human-review');
  assert.equal(model.side_effects_executed, false);
  assert.equal('nodes' in model, false);
});

test('real Graph review projection never presents incomplete replay as approved', () => {
  const model = projectRealAgentDogfoodGraphReviewReadModel({
    plan,
    replay: {
      schema: 'zj-loop.real_agent_dogfood_graph_replay.v1', status: 'outcome-uncertain', integrity_status: 'incomplete', network_id: 'network-review-model', dogfood_id: plan.dogfood_id, execution_id: plan.execution_id, attempt: 1, plan_digest: plan.plan_digest, plan_definition_digest: plan.plan_definition_digest,
      lifecycle: { status: 'outcome-uncertain', reason_code: 'unverifiable-evidence', next_action: 'reconcile', lifecycle_digest: digest('e') },
      graph: { current_phase: 'independent_verification', phase_status: 'outcome-uncertain', completed_phases: ['source_execution', 'scope_observation'], next_phase: 'independent_verification', evidence_refs: [] }, integrity_failures: ['evidence-missing'], read_model_digest: digest('f'),
    },
    network_id: 'network-review-model',
  });
  assert.equal(model.status, 'outcome-uncertain');
  assert.equal(model.next_action.kind, 'inspect-blocker');
  assert.ok(model.blocking_reasons.includes('evidence-missing'));
});

test('Human Approval UI lists the real Graph review schema without routing it through legacy acceptance', async () => {
  const model = projectRealAgentDogfoodGraphReviewReadModel({
    plan,
    replay: {
      schema: 'zj-loop.real_agent_dogfood_graph_replay.v1', status: 'in-progress', integrity_status: 'complete', network_id: 'network-review-model', dogfood_id: plan.dogfood_id, execution_id: plan.execution_id, attempt: 1, plan_digest: plan.plan_digest, plan_definition_digest: plan.plan_definition_digest,
      lifecycle: { status: 'review-pending', reason_code: null, next_action: 'human-approval', lifecycle_digest: digest('b') },
      graph: { current_phase: 'independent_verification', phase_status: 'passed', completed_phases: ['source_execution', 'scope_observation', 'independent_verification'], next_phase: 'human_acceptance', evidence_refs: [digest('c')] }, integrity_failures: [], read_model_digest: digest('d'),
    },
    network_id: 'network-review-model',
  });
  const signer = createInMemoryHumanSigner({ human_id: 'human-1' });
  let accepted;
  const server = createHumanApprovalUiServer({ signer, network_id: model.network_id, bootstrap_token: 'real-graph-ui', upstream: { async list() { return { requests: [] }; } }, graph: { async list() { return { events: [model] }; }, async get() { return { event: model }; }, async evidence() { return { evidence: [] }; }, async accept(input) { accepted = input; return { status: 'recorded', side_effects_executed: false }; } } });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    const bootstrap = await new Promise((resolve, reject) => { import('node:http').then(({ request }) => { const req = request({ hostname: '127.0.0.1', port: address.port, path: '/ui/bootstrap?token=real-graph-ui' }, (res) => { const chunks = []; res.on('data', (chunk) => chunks.push(chunk)); res.on('end', () => resolve({ headers: res.headers })); }); req.on('error', reject); req.end(); }); });
    const cookie = bootstrap.headers['set-cookie'][0].split(';', 1)[0];
    const listed = await new Promise((resolve, reject) => { import('node:http').then(({ request }) => { const req = request({ hostname: '127.0.0.1', port: address.port, path: '/ui/events', headers: { cookie } }, (res) => { const chunks = []; res.on('data', (chunk) => chunks.push(chunk)); res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) })); }); req.on('error', reject); req.end(); }); });
    assert.equal(listed.status, 200);
    assert.equal(listed.body.events[0].status, 'pending-human-review');
    assert.equal(listed.body.events[0].event_id, model.event.event_id);
    const body = JSON.stringify({ network_id: model.network_id, plan_id: model.plan.plan_id, plan_revision: model.plan.plan_revision, plan_digest: model.plan.plan_digest });
    const acceptedResponse = await new Promise((resolve, reject) => { import('node:http').then(({ request }) => { const req = request({ hostname: '127.0.0.1', port: address.port, path: `/ui/events/${model.event.event_id}/accept`, method: 'POST', headers: { cookie, origin: `http://127.0.0.1:${address.port}`, 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } }, (res) => { const chunks = []; res.on('data', (chunk) => chunks.push(chunk)); res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) })); }); req.on('error', reject); req.write(body); req.end(); }); });
    assert.equal(acceptedResponse.status, 201);
    assert.equal(accepted.event_id, model.event.event_id);
    assert.equal(accepted.plan_digest, model.plan.plan_digest);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('Coordinator Graph upstream derives Human Review from persisted lifecycle and phase replay facts', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-real-graph-review-upstream-'));
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  const evidenceStore = await createContentAddressedEvidenceStore({ root: path.join(root, 'evidence') });
  try {
    await stateStore.createNetwork({ network_id: 'network-review-model', owner_id: 'human-1' });
    const draft = createRealAgentDogfoodDraft({ network_id: 'network-review-model', dogfood_id: plan.dogfood_id, execution_id: plan.execution_id, attempt: 1, provider_id: 'agent-1', adapter_version: 'fixture.v1', created_at: '2026-08-08T00:00:00.000Z' });
    const transitions = [draft];
    let lifecycle = draft.lifecycle;
    for (const [to, event_id] of [['preflight-ready', 'preflight'], ['awaiting-human-approval', 'awaiting'], ['running', 'running'], ['verification-pending', 'verification'], ['review-pending', 'review']]) {
      const next = createRealAgentDogfoodTransition({ lifecycle, to, event_id, occurred_at: '2026-08-08T00:00:01.000Z', fact_digest: digest('a'), ...(to === 'running' ? { approval_digest: digest('b') } : {}) });
      transitions.push(next); lifecycle = next.lifecycle;
    }
    for (const item of transitions) { const current = await stateStore.getRevision('network-review-model'); await stateStore.appendEvent({ network_id: 'network-review-model', expected_revision: current, event: item.event }); }
    const evidence = [];
    for (const [phase, completed, letter] of [['source_execution', ['source_execution'], 'c'], ['scope_observation', ['source_execution', 'scope_observation'], 'd'], ['independent_verification', ['source_execution', 'scope_observation', 'independent_verification'], 'e']]) {
      const stored = await evidenceStore.put({ kind: `phase-${phase}`, content: JSON.stringify({ network_id: 'network-review-model', dogfood_id: plan.dogfood_id, execution_id: plan.execution_id, attempt: 1, plan_digest: plan.plan_digest }) });
      evidence.push(stored.digest);
      const record = createRealAgentDogfoodGraphPhaseRecord({ plan, network_id: 'network-review-model', phase, status: 'passed', completed_phases: completed, reason: 'passed', evidence_digest: stored.digest, evidence_refs: [stored.digest] });
      await appendRealAgentDogfoodGraphPhaseRecord({ stateStore, plan, network_id: 'network-review-model', record, expected_revision: await stateStore.getRevision('network-review-model'), now: '2026-08-08T00:01:00.000Z' });
    }
    const upstream = createRealAgentDogfoodGraphReviewUpstream({ stateStore, evidenceStore, network_id: 'network-review-model', plans: [plan] });
    const listed = await upstream.list();
    assert.equal(listed.events[0].status, 'pending-human-review');
    assert.deepEqual(listed.events[0].evidence_refs, [...new Set(evidence)].sort());
  } finally { await stateStore.close(); await rm(root, { recursive: true, force: true }); }
});
