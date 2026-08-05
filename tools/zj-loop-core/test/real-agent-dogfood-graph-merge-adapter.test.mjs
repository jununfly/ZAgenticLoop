import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createContentAddressedEvidenceStore } from '../dist/content-addressed-evidence-store.js';
import { createRealAgentDogfoodGraphMergeAdapter } from '../dist/real-agent-dogfood-graph-merge-adapter.js';
import { createRealAgentDogfoodGraphPhaseRecord } from '../dist/real-agent-dogfood-graph-state.js';
import { createRealAgentDogfoodGraphPlan } from '../dist/real-agent-dogfood-graph-orchestrator.js';
import { nativeOpnTracerMergeAuthorizationDigest } from '../dist/native-opn-graph-merge.js';

const digest = (value) => `sha256:${value.repeat(64)}`;

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-merge-adapter-'));
  const plan = createRealAgentDogfoodGraphPlan({
    dogfood_id: 'dogfood-merge', execution_id: 'execution-merge', attempt: 1, goal: 'merge graph result',
    repo_root: path.join(root, 'repo'), baseline_commit: 'a'.repeat(40), target_worktree: path.join(root, 'target'),
    source_worktree: path.join(root, 'source'), verifier_worktree: path.join(root, 'verifier', 'execution-merge-attempt-1'),
    evidence_store: path.join(root, 'evidence'), allowed_files: ['README.md'], execution_mode: 'write-enabled', network_policy: 'network-allowed',
  });
  const authorization = { source_commit_sha: 'c'.repeat(40), target_ref: 'refs/heads/main', target_worktree_ref: 'worktree:merge-target', strategy: 'fast-forward-only', scope_digest: digest('1'), deterministic_gate_digest: digest('2') };
  const humanAcceptance = { decision: 'accepted', merge_authorization_digest: nativeOpnTracerMergeAuthorizationDigest(authorization) };
  const humanPhase = createRealAgentDogfoodGraphPhaseRecord({ plan, network_id: 'network-merge', phase: 'human_acceptance', status: 'passed', completed_phases: ['source_execution', 'scope_observation', 'independent_verification', 'human_acceptance'], reason: 'human-acceptance-verified', actor_kind: 'human', actor_identity: 'human-1', evidence_digest: digest('f'), evidence_refs: [digest('f')] });
  const evidenceStore = await createContentAddressedEvidenceStore({ root: path.join(root, 'evidence') });
  const mergeAdapter = {
    observations: 0,
    executions: 0,
    async observe() { this.observations += 1; return { target_ref: 'refs/heads/main', target_worktree_ref: 'worktree:merge-target', target_head: 'b'.repeat(40), source_commit_reachable: true, fast_forward_possible: true, target_clean: true, scope_digest: digest('1') }; },
    async execute() { this.executions += 1; return { status: 'merged', target_head: 'c'.repeat(40), side_effects_executed: true }; },
  };
  return { root, plan, authorization, humanAcceptance, humanPhase, evidenceStore, mergeAdapter };
}

test('merge adapter reuses Human-approved fast-forward contract and records Graph Evidence', async () => {
  const value = await fixture();
  try {
    const result = await createRealAgentDogfoodGraphMergeAdapter({ plan: value.plan, network_id: 'network-merge', coordinator_id: 'coordinator-1', human_acceptance_phase: value.humanPhase, human_acceptance: value.humanAcceptance, authorization: value.authorization, merge_adapter: value.mergeAdapter, evidence_store: value.evidenceStore })();
    assert.equal(result.status, 'passed');
    assert.equal(result.record.phase, 'merge');
    assert.equal(result.record.actor_kind, 'coordinator');
    assert.deepEqual(result.record.completed_phases, ['source_execution', 'scope_observation', 'independent_verification', 'human_acceptance', 'merge']);
    assert.equal(value.mergeAdapter.observations, 1);
    assert.equal(value.mergeAdapter.executions, 1);
    assert.match(result.evidence_digest, /^sha256:[0-9a-f]{64}$/);
  } finally { await rm(value.root, { recursive: true, force: true }); }
});

test('merge adapter blocks authorization drift before invoking the merge side effect', async () => {
  const value = await fixture();
  try {
    const result = await createRealAgentDogfoodGraphMergeAdapter({ plan: value.plan, network_id: 'network-merge', coordinator_id: 'coordinator-1', human_acceptance_phase: value.humanPhase, human_acceptance: { ...value.humanAcceptance, merge_authorization_digest: digest('9') }, authorization: value.authorization, merge_adapter: value.mergeAdapter, evidence_store: value.evidenceStore })();
    assert.equal(result.status, 'blocked');
    assert.equal(result.reason, 'human-acceptance-binding-invalid');
    assert.equal(result.record, undefined);
    assert.equal(value.mergeAdapter.executions, 0);
  } finally { await rm(value.root, { recursive: true, force: true }); }
});

test('merge adapter preserves outcome uncertainty when the merge result cannot be proven', async () => {
  const value = await fixture();
  value.mergeAdapter.execute = async () => ({ status: 'outcome-uncertain', target_head: 'c'.repeat(40), side_effects_executed: true, reason: 'merged-head-unreadable-or-mismatched' });
  try {
    const result = await createRealAgentDogfoodGraphMergeAdapter({ plan: value.plan, network_id: 'network-merge', coordinator_id: 'coordinator-1', human_acceptance_phase: value.humanPhase, human_acceptance: value.humanAcceptance, authorization: value.authorization, merge_adapter: value.mergeAdapter, evidence_store: value.evidenceStore })();
    assert.equal(result.status, 'outcome-uncertain');
    assert.equal(result.record.status, 'outcome-uncertain');
    assert.deepEqual(result.record.completed_phases, ['source_execution', 'scope_observation', 'independent_verification', 'human_acceptance']);
  } finally { await rm(value.root, { recursive: true, force: true }); }
});
