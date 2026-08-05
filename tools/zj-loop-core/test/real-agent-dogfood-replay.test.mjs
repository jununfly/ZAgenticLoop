import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  classifyRealAgentDogfoodFailure,
  replayRealAgentDogfoodGraphReadModel,
  replayRealAgentDogfoodAttempt,
} from '../dist/real-agent-dogfood-replay.js';
import { createRealAgentDogfoodDraft, createRealAgentDogfoodTransition } from '../dist/real-agent-dogfood-lifecycle.js';
import { createRealAgentDogfoodGraphPlan } from '../dist/real-agent-dogfood-graph-orchestrator.js';
import { createRealAgentDogfoodGraphPhaseRecord } from '../dist/real-agent-dogfood-graph-state.js';
import { createContentAddressedEvidenceStore } from '../dist/content-addressed-evidence-store.js';
import { sha256CanonicalJson } from '../dist/sqlite-state-store.js';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const digest = (letter) => `sha256:${letter.repeat(64)}`;

test('maps deterministic failure classes to bounded lifecycle outcomes', () => {
  assert.deepEqual(classifyRealAgentDogfoodFailure('known-rejection'), { status: 'blocked', reason_code: 'known-rejection' });
  assert.deepEqual(classifyRealAgentDogfoodFailure('unverifiable-cleanup'), { status: 'outcome-uncertain', reason_code: 'unverifiable-cleanup' });
  assert.deepEqual(classifyRealAgentDogfoodFailure('provider-timeout'), { status: 'blocked', reason_code: 'provider-timeout' });
  assert.throws(() => classifyRealAgentDogfoodFailure('unknown'), /failure-class-invalid/);
});

test('same digest replay is idempotent while different digest conflicts', () => {
  const first = replayRealAgentDogfoodAttempt({ execution_id: 'execution-1', attempt: 1, result_digest: digest('a'), prior: null });
  assert.deepEqual(first, { status: 'recorded', execution_id: 'execution-1', attempt: 1, result_digest: digest('a') });
  assert.deepEqual(replayRealAgentDogfoodAttempt({ execution_id: 'execution-1', attempt: 1, result_digest: digest('a'), prior: first }), { status: 'idempotent', execution_id: 'execution-1', attempt: 1 });
  assert.deepEqual(replayRealAgentDogfoodAttempt({ execution_id: 'execution-1', attempt: 1, result_digest: digest('b'), prior: first }), { status: 'conflict', reason_code: 'attempt-digest-conflict' });
  assert.deepEqual(replayRealAgentDogfoodAttempt({ execution_id: 'execution-2', attempt: 2, result_digest: digest('b'), prior: first }), { status: 'new-attempt', execution_id: 'execution-2', attempt: 2 });
});

function graphFixture() {
  const plan = createRealAgentDogfoodGraphPlan({ dogfood_id: 'dogfood-replay', execution_id: 'execution-replay', attempt: 1, goal: 'replay graph', repo_root: '/tmp/replay-repo', baseline_commit: 'a'.repeat(40), target_worktree: '/tmp/replay-target', source_worktree: '/tmp/replay-source', verifier_worktree: '/tmp/replay-verifier', evidence_store: '/tmp/replay-evidence', allowed_files: ['README.md'], execution_mode: 'write-enabled', network_policy: 'network-allowed' });
  const draft = createRealAgentDogfoodDraft({ network_id: 'network-replay', dogfood_id: plan.dogfood_id, execution_id: plan.execution_id, attempt: 1, provider_id: 'provider-1', adapter_version: 'adapter-1', created_at: '2026-08-05T00:00:00.000Z' });
  return { plan, lifecycle: draft.lifecycle, lifecycle_events: [draft.event], network_id: 'network-replay' };
}

function acceptedLifecycleEvents(draft) {
  const transition = (lifecycle, to, event_id, extra = {}) => createRealAgentDogfoodTransition({ lifecycle, to, event_id, occurred_at: '2026-08-05T00:00:00.000Z', fact_digest: digest('a'), ...extra });
  const ready = transition(draft.lifecycle, 'preflight-ready', 'ready');
  const awaiting = transition(ready.lifecycle, 'awaiting-human-approval', 'awaiting');
  const running = transition(awaiting.lifecycle, 'running', 'running', { approval_digest: digest('b') });
  const verifying = transition(running.lifecycle, 'verification-pending', 'verifying');
  const review = transition(verifying.lifecycle, 'review-pending', 'review');
  const accepted = transition(review.lifecycle, 'accepted', 'accepted');
  return [draft.event, ready.event, awaiting.event, running.event, verifying.event, review.event, accepted.event];
}

function graphEvent(plan, record) {
  return { schema: 'zj-loop.state_event.v1', network_id: 'network-replay', event_id: 'graph-event-1', aggregate_type: 'real-agent-dogfood-graph', aggregate_id: plan.dogfood_id, event_type: 'real-agent-dogfood-graph.phase-recorded', revision: 2, occurred_at: '2026-08-05T00:00:01.000Z', created_at: '2026-08-05T00:00:01.000Z', payload: record, payload_sha256: sha256CanonicalJson(record) };
}

test('Graph replay reconstructs a valid phase and is content-addressed without mutating evidence audit state', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-replay-read-model-'));
  try {
    const fixture = graphFixture();
    const evidenceStore = await createContentAddressedEvidenceStore({ root });
    const evidence = await evidenceStore.put({ kind: 'provider-fact', content: JSON.stringify({ schema: 'zj-loop.real_agent_dogfood_provider_result.v1', network_id: fixture.network_id, dogfood_id: fixture.plan.dogfood_id, execution_id: fixture.plan.execution_id, attempt: 1 }) });
    const record = createRealAgentDogfoodGraphPhaseRecord({ plan: fixture.plan, network_id: fixture.network_id, phase: 'source_execution', status: 'passed', completed_phases: ['source_execution'], actor_kind: 'agent-node', actor_identity: 'Agent1', evidence_digest: evidence.digest, evidence_refs: [evidence.digest], execution_binding_digest: digest('b'), worker_lease_digest: digest('c') });
    const before = await readFile(path.join(root, 'access.log'), 'utf8');
    const first = await replayRealAgentDogfoodGraphReadModel({ ...fixture, graph_events: [graphEvent(fixture.plan, record)], evidenceStore });
    const second = await replayRealAgentDogfoodGraphReadModel({ ...fixture, graph_events: [graphEvent(fixture.plan, record)], evidenceStore });
    assert.equal(first.status, 'in-progress');
    assert.equal(first.integrity_status, 'complete');
    assert.deepEqual(first.graph.completed_phases, ['source_execution']);
    assert.equal(first.graph.next_phase, 'scope_observation');
    assert.equal(first.read_model_digest, second.read_model_digest);
    assert.equal(await readFile(path.join(root, 'access.log'), 'utf8'), before);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('Graph replay reports missing evidence as outcome-uncertain without acquiring leases', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-replay-missing-evidence-'));
  try {
    const fixture = graphFixture();
    const evidenceStore = await createContentAddressedEvidenceStore({ root });
    const missing = digest('d');
    const record = createRealAgentDogfoodGraphPhaseRecord({ plan: fixture.plan, network_id: fixture.network_id, phase: 'source_execution', status: 'passed', completed_phases: ['source_execution'], actor_kind: 'agent-node', actor_identity: 'Agent1', evidence_digest: missing, evidence_refs: [missing], execution_binding_digest: digest('b'), worker_lease_digest: digest('c') });
    const replay = await replayRealAgentDogfoodGraphReadModel({ ...fixture, graph_events: [graphEvent(fixture.plan, record)], evidenceStore });
    assert.equal(replay.status, 'outcome-uncertain');
    assert.equal(replay.integrity_status, 'incomplete');
    assert.match(replay.integrity_failures[0], /^evidence-missing:/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('Graph replay rejects lifecycle and plan scope mismatch before reading evidence', async () => {
  const fixture = graphFixture();
  const evidenceStore = { readOnly: async () => { throw new Error('must-not-read'); } };
  await assert.rejects(() => replayRealAgentDogfoodGraphReadModel({ ...fixture, network_id: 'network-other', graph_events: [], evidenceStore }), /scope-mismatch/);
});

test('Graph replay reports StateEvent payload drift and revision collision as outcome-uncertain', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-replay-state-integrity-'));
  try {
    const fixture = graphFixture();
    const evidenceStore = await createContentAddressedEvidenceStore({ root });
    const record = createRealAgentDogfoodGraphPhaseRecord({ plan: fixture.plan, network_id: fixture.network_id, phase: 'source_execution', status: 'passed', completed_phases: ['source_execution'], actor_kind: 'agent-node', actor_identity: 'Agent1', evidence_digest: digest('a'), evidence_refs: [digest('a')], execution_binding_digest: digest('b'), worker_lease_digest: digest('c') });
    const first = graphEvent(fixture.plan, record);
    const drift = { ...first, event_id: 'graph-event-drift', revision: 3, payload: { ...record, reason: 'drifted' } };
    const collision = { ...first, event_id: 'graph-event-2', revision: 2, payload_sha256: sha256CanonicalJson(first.payload) };
    const replay = await replayRealAgentDogfoodGraphReadModel({ ...fixture, graph_events: [first, drift, collision], evidenceStore });
    assert.equal(replay.status, 'outcome-uncertain');
    assert.equal(replay.integrity_status, 'incomplete');
    assert.ok(replay.integrity_failures.includes('graph-event-payload-digest-mismatch:graph-event-drift'));
    assert.ok(replay.integrity_failures.includes('graph-event-revision-conflict:2'));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('Graph replay does not claim passed when accepted lifecycle lacks terminal graph facts', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-replay-terminal-integrity-'));
  try {
    const fixture = graphFixture();
    const evidenceStore = await createContentAddressedEvidenceStore({ root });
    const record = createRealAgentDogfoodGraphPhaseRecord({ plan: fixture.plan, network_id: fixture.network_id, phase: 'source_execution', status: 'passed', completed_phases: ['source_execution'], actor_kind: 'agent-node', actor_identity: 'Agent1', evidence_digest: digest('a'), evidence_refs: [digest('a')], execution_binding_digest: digest('b'), worker_lease_digest: digest('c') });
    const replay = await replayRealAgentDogfoodGraphReadModel({ ...fixture, lifecycle_events: acceptedLifecycleEvents({ lifecycle: fixture.lifecycle, event: fixture.lifecycle_events[0] }), graph_events: [graphEvent(fixture.plan, record)], evidenceStore });
    assert.equal(replay.status, 'outcome-uncertain');
    assert.ok(replay.integrity_failures.includes('lifecycle-graph-terminal-mismatch'));
  } finally { await rm(root, { recursive: true, force: true }); }
});
