import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';
import { createRealAgentDogfoodGraphPlan } from '../dist/real-agent-dogfood-graph-orchestrator.js';
import {
  appendRealAgentDogfoodGraphPhaseRecord,
  createRealAgentDogfoodGraphPhaseRecord,
  projectRealAgentDogfoodGraphPhaseRecord,
} from '../dist/real-agent-dogfood-graph-state.js';

const plan = createRealAgentDogfoodGraphPlan({
  dogfood_id: 'dogfood-state-1', execution_id: 'execution-state-1', attempt: 1,
  goal: 'record graph phase evidence', repo_root: '/repo', baseline_commit: 'a'.repeat(40),
  target_worktree: '/tmp/target', source_worktree: '/tmp/source', verifier_worktree: '/tmp/verifier', evidence_store: '/tmp/evidence',
  allowed_files: ['tools/zj-loop-core/test/native-opn-tracer.test.mjs'], execution_mode: 'write-enabled', network_policy: 'network-allowed',
});

test('Graph phase evidence is append-only and resumes from the projected last phase', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-graph-state-'));
  const store = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  try {
    await store.createNetwork({ network_id: 'network-state-1', owner_id: 'human-local' });
    const source = createRealAgentDogfoodGraphPhaseRecord({ plan, network_id: 'network-state-1', phase: 'source_execution', status: 'passed', completed_phases: ['source_execution'], actor_kind: 'agent-node', actor_identity: 'Agent1', evidence_digest: 'sha256:' + '1'.repeat(64), evidence_refs: ['sha256:' + '1'.repeat(64)], execution_binding_digest: 'sha256:' + '2'.repeat(64), worker_lease_digest: 'sha256:' + '3'.repeat(64) });
    assert.equal((await appendRealAgentDogfoodGraphPhaseRecord({ stateStore: store, plan, network_id: 'network-state-1', record: source, expected_revision: 1 })).status, 'recorded');
    const scope = createRealAgentDogfoodGraphPhaseRecord({ plan, network_id: 'network-state-1', phase: 'scope_observation', status: 'blocked', completed_phases: ['source_execution'], reason: 'scope-observation-blocked', actor_kind: 'trusted-runner', actor_identity: 'scope-observer-1', evidence_digest: 'sha256:' + '4'.repeat(64), evidence_refs: ['sha256:' + '4'.repeat(64)] });
    assert.equal((await appendRealAgentDogfoodGraphPhaseRecord({ stateStore: store, plan, network_id: 'network-state-1', record: scope, expected_revision: 2 })).status, 'recorded');
    const snapshot = await store.readEvents({ network_id: 'network-state-1', aggregate_type: 'real-agent-dogfood-graph', aggregate_id: plan.dogfood_id });
    const projected = projectRealAgentDogfoodGraphPhaseRecord({ plan, events: snapshot.events });
    assert.equal(projected?.phase, 'scope_observation');
    assert.deepEqual(projected?.completed_phases, ['source_execution']);
    assert.equal(projected?.status, 'blocked');
    assert.equal(projected?.actor_kind, 'trusted-runner');
    assert.equal(projected?.actor_identity, 'scope-observer-1');
  } finally {
    await store.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('Graph phase evidence rejects a stale StateStore revision', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-graph-state-'));
  const store = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  try {
    await store.createNetwork({ network_id: 'network-state-2', owner_id: 'human-local' });
    const source = createRealAgentDogfoodGraphPhaseRecord({ plan: { ...plan, dogfood_id: 'dogfood-state-2', execution_id: 'execution-state-2' }, network_id: 'network-state-2', phase: 'source_execution', status: 'passed', completed_phases: ['source_execution'] });
    const reboundPlan = { ...plan, dogfood_id: 'dogfood-state-2', execution_id: 'execution-state-2' };
    await assert.rejects(() => appendRealAgentDogfoodGraphPhaseRecord({ stateStore: store, plan: reboundPlan, network_id: 'network-state-2', record: source, expected_revision: 0 }), { message: 'expected-revision-invalid' });
    assert.equal((await appendRealAgentDogfoodGraphPhaseRecord({ stateStore: store, plan: reboundPlan, network_id: 'network-state-2', record: source, expected_revision: 1 })).status, 'recorded');
    const scope = createRealAgentDogfoodGraphPhaseRecord({ plan: reboundPlan, network_id: 'network-state-2', phase: 'scope_observation', status: 'passed', completed_phases: ['source_execution', 'scope_observation'] });
    assert.deepEqual(await appendRealAgentDogfoodGraphPhaseRecord({ stateStore: store, plan: reboundPlan, network_id: 'network-state-2', record: scope, expected_revision: 1 }), { status: 'conflict', current_revision: 2, reason: 'revision-mismatch' });
  } finally {
    await store.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('Graph phase evidence records actor binding and rejects a phase actor mismatch', () => {
  const source = createRealAgentDogfoodGraphPhaseRecord({
    plan,
    network_id: 'network-state-actor',
    phase: 'source_execution',
    status: 'passed',
    completed_phases: ['source_execution'],
    actor_kind: 'agent-node',
    actor_identity: 'Agent1',
    evidence_digest: 'sha256:' + '1'.repeat(64),
    evidence_refs: ['sha256:' + '1'.repeat(64)],
    execution_binding_digest: 'sha256:' + '2'.repeat(64),
    worker_lease_digest: 'sha256:' + '3'.repeat(64),
  });
  assert.equal(source.actor_kind, 'agent-node');
  assert.equal(source.actor_identity, 'Agent1');
  assert.throws(() => createRealAgentDogfoodGraphPhaseRecord({
    plan,
    network_id: 'network-state-actor',
    phase: 'human_acceptance',
    status: 'blocked',
    completed_phases: ['source_execution'],
    actor_kind: 'agent-node',
    actor_identity: 'Agent1',
  }), { message: 'graph-state-actor-binding-invalid' });
});

test('Graph phase evidence keeps legacy v1 records without actor binding compatible', () => {
  const legacy = createRealAgentDogfoodGraphPhaseRecord({
    plan,
    network_id: 'network-state-legacy',
    phase: 'source_execution',
    status: 'passed',
    completed_phases: ['source_execution'],
  });
  assert.equal('actor_kind' in legacy, false);
  assert.equal('actor_identity' in legacy, false);
});

test('Graph source execution requires provider evidence and both execution bindings', () => {
  assert.throws(() => createRealAgentDogfoodGraphPhaseRecord({
    plan,
    network_id: 'network-state-missing-binding',
    phase: 'source_execution',
    status: 'passed',
    completed_phases: ['source_execution'],
    actor_kind: 'agent-node',
    actor_identity: 'Agent1',
    evidence_digest: 'sha256:' + '1'.repeat(64),
    evidence_refs: ['sha256:' + '1'.repeat(64)],
    execution_binding_digest: 'sha256:' + '2'.repeat(64),
  }), { message: 'graph-state-execution-binding-required' });
  assert.throws(() => createRealAgentDogfoodGraphPhaseRecord({
    plan,
    network_id: 'network-state-missing-evidence',
    phase: 'source_execution',
    status: 'passed',
    completed_phases: ['source_execution'],
    actor_kind: 'agent-node',
    actor_identity: 'Agent1',
    execution_binding_digest: 'sha256:' + '2'.repeat(64),
    worker_lease_digest: 'sha256:' + '3'.repeat(64),
  }), { message: 'graph-state-execution-binding-required' });
});
