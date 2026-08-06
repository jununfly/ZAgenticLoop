import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createRealAgentDogfoodGraphConformanceCoordinatorWithRealAdapters } from '../dist/real-agent-dogfood-graph-real-adapters.js';
import { createRealAgentDogfoodGraphPlan } from '../dist/real-agent-dogfood-graph-orchestrator.js';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';
import { createAgentRegistration } from '../dist/agent-registration.js';
import { createOpnGraphAtomEnrollmentSnapshot } from '../dist/opn-graph-atom-enrollment.js';

const digest = (letter) => `sha256:${letter.repeat(64)}`;
const plan = createRealAgentDogfoodGraphPlan({ dogfood_id: 'dogfood-real-wiring', execution_id: 'execution-real-wiring', attempt: 1, goal: 'real adapter wiring', repo_root: '/repo', baseline_commit: 'a'.repeat(40), target_worktree: '/tmp/target', source_worktree: '/tmp/source', verifier_worktree: '/tmp/verifier', evidence_store: '/tmp/evidence', allowed_files: ['README.md'], execution_mode: 'write-enabled', network_policy: 'network-allowed' });
const enrollment = createOpnGraphAtomEnrollmentSnapshot({ graph_id: 'graph-real-wiring', network_id: 'network-real-wiring', device_id: 'device-1', center: { responsibility_unit: 'human+agent', human_id: 'human-1', center_agent_id: 'Agent1' }, agents: ['Agent1', 'Agent2'].map((node_id) => ({ node_id, device_id: 'device-1', network_id: 'network-real-wiring', status: 'approved', capability_ceiling: ['read'], registration: createAgentRegistration({ agent_id: node_id, display_name: node_id, capabilities: ['read'], accepted_task_kinds: ['inspect'], evidence_kinds: ['report'], protocol_version: 'agent-v1', identity_ref: node_id }) })) });

test('Coordinator real-adapter wiring invokes the real source adapter and stops before later phases', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-real-adapter-wiring-'));
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  try {
    await stateStore.createNetwork({ network_id: 'network-real-wiring', owner_id: 'human-local' });
    const coordinator = await createRealAgentDogfoodGraphConformanceCoordinatorWithRealAdapters({
      plan,
      network_id: 'network-real-wiring',
      human_id: 'human-1',
      coordinator_id: 'coordinator-1',
      session_id: 'session-1',
      execution_binding_digest: digest('e'),
      state_store: stateStore,
      enrollment,
      real_adapters: {
        source_execution: { lifecycle: { status: 'idle' } },
        scope_observation: {},
        independent_verification: {},
        human_acceptance: {},
        merge: {},
        post_merge_gate: {},
        cleanup: {},
      },
      replay: async () => ({ status: 'passed', integrity_status: 'complete', read_model_digest: digest('f') }),
    });
    const result = await coordinator.run();
    assert.equal(result.status, 'outcome-uncertain');
    assert.equal(result.current_phase, 'source_execution');
    assert.equal(result.reason, 'source-execution-lifecycle-not-running');
    assert.equal((await stateStore.readEvents({ network_id: 'network-real-wiring', aggregate_type: 'real-agent-dogfood-graph', aggregate_id: plan.dogfood_id })).events.length, 0);
  } finally { await stateStore.close(); await rm(root, { recursive: true, force: true }); }
});

test('Coordinator refuses a Graph Atom whose Human center binding drifts before executing adapters', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-real-adapter-enrollment-gate-'));
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  try {
    await stateStore.createNetwork({ network_id: 'network-real-wiring', owner_id: 'human-local' });
    await assert.rejects(() => createRealAgentDogfoodGraphConformanceCoordinatorWithRealAdapters({ plan, network_id: 'network-real-wiring', human_id: 'human-2', coordinator_id: 'coordinator-1', session_id: 'session-1', execution_binding_digest: digest('e'), state_store: stateStore, enrollment, real_adapters: { source_execution: {}, scope_observation: {}, independent_verification: {}, human_acceptance: {}, merge: {}, post_merge_gate: {}, cleanup: {} }, replay: async () => ({ status: 'passed', integrity_status: 'complete', read_model_digest: digest('f') }) }), /graph-atom-enrollment-coordinator-binding-invalid/);
  } finally { await stateStore.close(); await rm(root, { recursive: true, force: true }); }
});
