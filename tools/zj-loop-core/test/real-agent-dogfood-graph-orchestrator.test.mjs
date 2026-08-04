import assert from 'node:assert/strict';
import { test } from 'node:test';
import { advanceRealAgentDogfoodGraph, createRealAgentDogfoodGraphPlan, runRealAgentDogfoodGraph } from '../dist/real-agent-dogfood-graph-orchestrator.js';

const base = {
  dogfood_id: 'dogfood-1', execution_id: 'execution-1', attempt: 1,
  goal: 'add the responsibility boundary test', repo_root: '/repo', baseline_commit: 'a'.repeat(40),
  target_worktree: '/tmp/target', source_worktree: '/tmp/source', verifier_worktree: '/tmp/verifier', evidence_store: '/tmp/evidence',
  allowed_files: ['tools/zj-loop-core/test/native-opn-tracer.test.mjs'], execution_mode: 'write-enabled', network_policy: 'network-allowed',
};
const plan = () => createRealAgentDogfoodGraphPlan(base);
const passed = async () => ({ status: 'passed' });
const stages = (calls) => Object.fromEntries(['source_execution', 'scope_observation', 'independent_verification', 'human_acceptance', 'merge', 'post_merge_gate', 'cleanup'].map((name) => [name, async () => { calls.push(name); return { status: 'passed' }; }]));

test('Graph orchestrator advances exactly one phase per call', async () => {
  const calls = [];
  const result = await advanceRealAgentDogfoodGraph({ plan: plan(), ...stages(calls) });
  assert.equal(result.status, 'in-progress');
  assert.deepEqual(result.completed_phases, ['source_execution']);
  assert.equal(result.next_phase, 'scope_observation');
  assert.deepEqual(calls, ['source_execution']);
});

test('Graph orchestrator resumes at the first incomplete phase', async () => {
  const calls = [];
  const result = await advanceRealAgentDogfoodGraph({ plan: plan(), completed_phases: ['source_execution', 'scope_observation'], ...stages(calls) });
  assert.equal(result.status, 'in-progress');
  assert.deepEqual(result.completed_phases, ['source_execution', 'scope_observation', 'independent_verification']);
  assert.equal(result.next_phase, 'human_acceptance');
  assert.deepEqual(calls, ['independent_verification']);
});

test('Graph orchestrator closes only after the complete trusted phase order', async () => {
  const calls = [];
  const result = await runRealAgentDogfoodGraph({ plan: plan(), ...Object.fromEntries(['source_execution', 'scope_observation', 'independent_verification', 'human_acceptance', 'merge', 'post_merge_gate', 'cleanup'].map((name) => [name, async () => { calls.push(name); return { status: 'passed' }; }])) });
  assert.equal(result.status, 'closed');
  assert.deepEqual(calls, ['source_execution', 'scope_observation', 'independent_verification', 'human_acceptance', 'merge', 'post_merge_gate', 'cleanup']);
  assert.equal(result.side_effects_executed, true);
});

test('Graph orchestrator stops before verification when trusted scope observation blocks', async () => {
  const calls = [];
  const result = await runRealAgentDogfoodGraph({ plan: plan(), source_execution: async () => { calls.push('source'); return { status: 'passed' }; }, scope_observation: async () => { calls.push('scope'); return { status: 'blocked', reason: 'write-scope-file-drift' }; }, independent_verification: async () => { calls.push('verify'); return passed(); }, human_acceptance: passed, merge: passed, post_merge_gate: passed, cleanup: passed });
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'write-scope-file-drift');
  assert.deepEqual(calls, ['source', 'scope']);
});

test('Graph orchestrator treats a missing stage outcome as uncertain and does not continue', async () => {
  const calls = [];
  const result = await runRealAgentDogfoodGraph({ plan: plan(), source_execution: async () => { calls.push('source'); throw new Error('provider-unavailable'); }, scope_observation: async () => { calls.push('scope'); return passed(); }, independent_verification: passed, human_acceptance: passed, merge: passed, post_merge_gate: passed, cleanup: passed });
  assert.equal(result.status, 'outcome-uncertain');
  assert.equal(result.reason, 'source-execution-outcome-uncertain');
  assert.deepEqual(calls, ['source']);
});
