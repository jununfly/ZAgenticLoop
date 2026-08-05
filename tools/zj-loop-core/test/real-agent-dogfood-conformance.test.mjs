import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateRealAgentDogfoodConformanceEvidence } from '../dist/real-agent-dogfood-conformance.js';
import { runRealAgentDogfoodGraphConformance } from '../dist/real-agent-dogfood-conformance.js';
import { createRealAgentDogfoodGraphPlan, REAL_AGENT_DOGFOOD_GRAPH_PHASES } from '../dist/real-agent-dogfood-graph-orchestrator.js';

const digest = (letter) => `sha256:${letter.repeat(64)}`;
const plan = createRealAgentDogfoodGraphPlan({ dogfood_id: 'dogfood-conformance', execution_id: 'execution-conformance', attempt: 1, goal: 'graph conformance', repo_root: '/repo', baseline_commit: 'a'.repeat(40), target_worktree: '/tmp/target', source_worktree: '/tmp/source', verifier_worktree: '/tmp/verifier', evidence_store: '/tmp/evidence', allowed_files: ['README.md'], execution_mode: 'write-enabled', network_policy: 'network-allowed' });
function stages(calls, failedPhase) {
  return Object.fromEntries(REAL_AGENT_DOGFOOD_GRAPH_PHASES.map((phase, index) => [phase, async () => { calls.push(phase); return phase === failedPhase ? { status: 'blocked', reason: 'stage-blocked' } : { status: 'passed', evidence_digest: digest(String(index + 1)) }; }]));
}

test('conformance evidence binds the fixed test command, commit, plan and failure matrix', async () => {
  let stored;
  const result = await generateRealAgentDogfoodConformanceEvidence({
    repo_root: '/repo',
    plan_digest: digest('a'),
    git_head: async () => 'b'.repeat(40),
    run: async (cwd, command) => { assert.equal(cwd, '/repo/tools/zj-loop-core'); assert.deepEqual(command, ['npm', 'test']); return { exit_code: 0, stdout: '432 passed', stderr: '' }; },
    evidenceStore: { put: async (input) => { stored = input; return { digest: digest('c'), size: input.content.length, path: '/evidence/c', kind: input.kind }; } },
  });
  assert.equal(result.status, 'passed');
  assert.equal(result.evidence.side_effects_executed, false);
  assert.equal(result.evidence.plan_digest, digest('a'));
  assert.equal(result.evidence.core_commit, 'b'.repeat(40));
  assert.equal(result.evidence.test_command[0], 'npm');
  assert.equal(stored.kind, 'real-agent-dogfood-conformance');
});

test('failed deterministic tests are retained as blocked conformance evidence', async () => {
  const result = await generateRealAgentDogfoodConformanceEvidence({
    repo_root: '/repo', plan_digest: digest('a'), git_head: async () => 'b'.repeat(40),
    run: async () => ({ exit_code: 1, stdout: 'failure', stderr: 'blocked' }),
    evidenceStore: { put: async () => ({ digest: digest('d'), size: 1, path: '/evidence/d', kind: 'real-agent-dogfood-conformance' }) },
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.evidence.exit_code, 1);
});

test('Graph conformance closes only after every phase Evidence and replay gate pass', async () => {
  const calls = [];
  const result = await runRealAgentDogfoodGraphConformance({ plan, stages: stages(calls), replay: async () => ({ status: 'passed', integrity_status: 'complete', read_model_digest: digest('f') }) });
  assert.equal(result.status, 'closed');
  assert.deepEqual(calls, [...REAL_AGENT_DOGFOOD_GRAPH_PHASES]);
  assert.deepEqual(result.completed_phases, [...REAL_AGENT_DOGFOOD_GRAPH_PHASES]);
});

test('Graph conformance stops before later phases when a stage blocks', async () => {
  const calls = [];
  const result = await runRealAgentDogfoodGraphConformance({ plan, stages: stages(calls, 'scope_observation'), replay: async () => ({ status: 'passed', integrity_status: 'complete', read_model_digest: digest('f') }) });
  assert.equal(result.status, 'blocked');
  assert.equal(result.current_phase, 'scope_observation');
  assert.deepEqual(calls, ['source_execution', 'scope_observation']);
  assert.equal(result.side_effects_executed, false);
});

test('Graph conformance treats missing phase Evidence or replay integrity as uncertainty', async () => {
  const missingEvidence = await runRealAgentDogfoodGraphConformance({ plan, stages: { ...stages([], undefined), source_execution: async () => ({ status: 'passed' }) }, replay: async () => ({ status: 'passed', integrity_status: 'complete', read_model_digest: digest('f') }) });
  assert.equal(missingEvidence.status, 'outcome-uncertain');
  assert.equal(missingEvidence.reason, 'phase-evidence-required');
  const replayFailed = await runRealAgentDogfoodGraphConformance({ plan, stages: stages([]), replay: async () => ({ status: 'outcome-uncertain', integrity_status: 'incomplete', read_model_digest: digest('f') }) });
  assert.equal(replayFailed.status, 'outcome-uncertain');
  assert.equal(replayFailed.reason, 'replay-gate-failed');
});
