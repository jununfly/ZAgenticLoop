import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createRealAgentDogfoodGraphConformanceCoordinator } from '../dist/real-agent-dogfood-graph-conformance-coordinator.js';
import { REAL_AGENT_DOGFOOD_GRAPH_PHASES, createRealAgentDogfoodGraphPlan } from '../dist/real-agent-dogfood-graph-orchestrator.js';
import { createRealAgentDogfoodGraphPhaseRecord, appendRealAgentDogfoodGraphPhaseRecord } from '../dist/real-agent-dogfood-graph-state.js';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';

const digest = (letter) => `sha256:${letter.repeat(64)}`;
const plan = createRealAgentDogfoodGraphPlan({ dogfood_id: 'dogfood-coordinator', execution_id: 'execution-coordinator', attempt: 1, goal: 'coordinator', repo_root: '/repo', baseline_commit: 'a'.repeat(40), target_worktree: '/tmp/target', source_worktree: '/tmp/source', verifier_worktree: '/tmp/verifier', evidence_store: '/tmp/evidence', allowed_files: ['README.md'], execution_mode: 'write-enabled', network_policy: 'network-allowed' });

function adapters(calls) {
  return Object.fromEntries(REAL_AGENT_DOGFOOD_GRAPH_PHASES.map((phase, index) => [phase, async () => {
    calls.push(phase);
    const completed = REAL_AGENT_DOGFOOD_GRAPH_PHASES.slice(0, index + 1);
    const evidence = digest(String(index + 1));
    return { status: 'passed', evidence_digest: evidence, record: createRealAgentDogfoodGraphPhaseRecord({ plan, network_id: 'network-coordinator', phase, status: 'passed', completed_phases: completed, evidence_digest: evidence, evidence_refs: [evidence] }) };
  }]));
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-graph-conformance-coordinator-'));
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  await stateStore.createNetwork({ network_id: 'network-coordinator', owner_id: 'human-local' });
  return { root, stateStore };
}

test('Coordinator appends trusted phase records in order and requires replay to close', async () => {
  const { root, stateStore } = await fixture();
  try {
    const calls = [];
    const coordinator = await createRealAgentDogfoodGraphConformanceCoordinator({ plan, network_id: 'network-coordinator', state_store: stateStore, adapters: adapters(calls), replay: async () => ({ status: 'passed', integrity_status: 'complete', read_model_digest: digest('f') }) });
    const result = await coordinator.run();
    assert.equal(result.status, 'closed');
    assert.deepEqual(calls, [...REAL_AGENT_DOGFOOD_GRAPH_PHASES]);
    assert.equal((await stateStore.readEvents({ network_id: 'network-coordinator', aggregate_type: 'real-agent-dogfood-graph', aggregate_id: plan.dogfood_id })).events.length, 7);
  } finally { await stateStore.close(); await rm(root, { recursive: true, force: true }); }
});

test('Coordinator resumes after an existing passed prefix without rerunning it', async () => {
  const { root, stateStore } = await fixture();
  try {
    const evidence = digest('a');
    const source = createRealAgentDogfoodGraphPhaseRecord({ plan, network_id: 'network-coordinator', phase: 'source_execution', status: 'passed', completed_phases: ['source_execution'], evidence_digest: evidence, evidence_refs: [evidence] });
    await appendRealAgentDogfoodGraphPhaseRecord({ stateStore, plan, network_id: 'network-coordinator', record: source, expected_revision: 1 });
    const calls = [];
    const coordinator = await createRealAgentDogfoodGraphConformanceCoordinator({ plan, network_id: 'network-coordinator', state_store: stateStore, adapters: adapters(calls), replay: async () => ({ status: 'passed', integrity_status: 'complete', read_model_digest: digest('f') }) });
    const result = await coordinator.run();
    assert.equal(result.status, 'closed');
    assert.deepEqual(calls, REAL_AGENT_DOGFOOD_GRAPH_PHASES.slice(1));
  } finally { await stateStore.close(); await rm(root, { recursive: true, force: true }); }
});

test('Coordinator converts a phase append conflict into outcome-uncertain', async () => {
  const { root, stateStore } = await fixture();
  try {
    const coordinator = await createRealAgentDogfoodGraphConformanceCoordinator({ plan, network_id: 'network-coordinator', state_store: stateStore, adapters: adapters([]), replay: async () => ({ status: 'passed', integrity_status: 'complete', read_model_digest: digest('f') }) });
    await stateStore.appendEvent({ network_id: 'network-coordinator', expected_revision: 1, event: { event_id: 'unrelated', aggregate_type: 'other', aggregate_id: 'other', event_type: 'other', occurred_at: '2026-08-06T00:00:00.000Z', payload: {} } });
    const result = await coordinator.run();
    assert.equal(result.status, 'outcome-uncertain');
    assert.equal(result.reason, 'graph-phase-append-conflict');
    assert.deepEqual(result.completed_phases, []);
  } finally { await stateStore.close(); await rm(root, { recursive: true, force: true }); }
});
