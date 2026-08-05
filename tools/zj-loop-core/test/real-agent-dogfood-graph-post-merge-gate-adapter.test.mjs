import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { createContentAddressedEvidenceStore } from '../dist/content-addressed-evidence-store.js';
import { createRealAgentDogfoodGraphPlan } from '../dist/real-agent-dogfood-graph-orchestrator.js';
import { createRealAgentDogfoodGraphPhaseRecord } from '../dist/real-agent-dogfood-graph-state.js';
import { createRealAgentDogfoodGraphPostMergeGateAdapter } from '../dist/real-agent-dogfood-graph-post-merge-gate-adapter.js';
import { nativeOpnTracerMergeAuthorizationDigest } from '../dist/native-opn-graph-merge.js';

const run = promisify(execFile);
const digest = (value) => `sha256:${value.repeat(64)}`;

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-post-merge-gate-adapter-'));
  const target = path.join(root, 'target');
  await mkdir(target);
  await run('git', ['init', '-b', 'main'], { cwd: target });
  await run('git', ['config', 'user.email', 'test@example.com'], { cwd: target });
  await run('git', ['config', 'user.name', 'Test'], { cwd: target });
  await writeFile(path.join(target, 'README.md'), 'merged\n');
  await run('git', ['add', 'README.md'], { cwd: target });
  await run('git', ['commit', '-m', 'merged'], { cwd: target });
  const sourceCommit = (await run('git', ['rev-parse', 'HEAD'], { cwd: target })).stdout.trim();
  const plan = createRealAgentDogfoodGraphPlan({ dogfood_id: 'dogfood-post-merge', execution_id: 'execution-post-merge', attempt: 1, goal: 'gate merged result', repo_root: target, baseline_commit: 'a'.repeat(40), target_worktree: target, source_worktree: path.join(root, 'source'), verifier_worktree: path.join(root, 'verifier', 'execution-post-merge-attempt-1'), evidence_store: path.join(root, 'evidence'), allowed_files: ['README.md'], execution_mode: 'write-enabled', network_policy: 'network-allowed' });
  const authorization = { source_commit_sha: sourceCommit, target_ref: 'refs/heads/main', target_worktree_ref: 'worktree:post-merge-target', strategy: 'fast-forward-only', scope_digest: digest('1'), deterministic_gate_digest: digest('2') };
  const humanAcceptance = { decision: 'accepted', merge_authorization_digest: nativeOpnTracerMergeAuthorizationDigest(authorization) };
  const mergePhase = createRealAgentDogfoodGraphPhaseRecord({ plan, network_id: 'network-post-merge', phase: 'merge', status: 'passed', completed_phases: ['source_execution', 'scope_observation', 'independent_verification', 'human_acceptance', 'merge'], reason: 'graph-merge-passed', actor_kind: 'coordinator', actor_identity: 'coordinator-1', evidence_digest: digest('a'), evidence_refs: [digest('a')] });
  const evidenceStore = await createContentAddressedEvidenceStore({ root: path.join(root, 'evidence') });
  const commands = [
    { id: 'git-diff-check', executable: 'git', args: ['diff', '--check'], timeout_ms: 10_000 },
    { id: 'project-build', executable: process.execPath, args: ['-e', 'process.exit(0)'], timeout_ms: 10_000 },
    { id: 'target-test', executable: process.execPath, args: ['-e', 'process.exit(0)'], timeout_ms: 10_000 },
    { id: 'graph-regression', executable: process.execPath, args: ['-e', 'process.exit(0)'], timeout_ms: 10_000 },
  ];
  return { root, target, plan, authorization, humanAcceptance, mergePhase, evidenceStore, commands };
}

test('post-merge gate observes the merged target and records deterministic verification Evidence', async () => {
  const value = await fixture();
  try {
    const result = await createRealAgentDogfoodGraphPostMergeGateAdapter({ plan: value.plan, network_id: 'network-post-merge', verifier_id: 'trusted-runner-1', merge_phase: value.mergePhase, human_acceptance: value.humanAcceptance, authorization: value.authorization, target_worktree: value.target, commands: value.commands, evidence_store: value.evidenceStore })();
    assert.equal(result.status, 'passed');
    assert.equal(result.record.phase, 'post_merge_gate');
    assert.equal(result.record.actor_kind, 'trusted-runner');
    assert.deepEqual(result.record.completed_phases, ['source_execution', 'scope_observation', 'independent_verification', 'human_acceptance', 'merge', 'post_merge_gate']);
    assert.match(result.evidence_digest, /^sha256:[0-9a-f]{64}$/);
  } finally { await rm(value.root, { recursive: true, force: true }); }
});

test('post-merge gate blocks after a fixed verification command fails', async () => {
  const value = await fixture();
  try {
    const result = await createRealAgentDogfoodGraphPostMergeGateAdapter({ plan: value.plan, network_id: 'network-post-merge', verifier_id: 'trusted-runner-1', merge_phase: value.mergePhase, human_acceptance: value.humanAcceptance, authorization: value.authorization, target_worktree: value.target, commands: value.commands.map((command) => command.id === 'target-test' ? { ...command, executable: process.execPath, args: ['-e', 'process.exit(2)'] } : command), evidence_store: value.evidenceStore })();
    assert.equal(result.status, 'blocked');
    assert.equal(result.record.status, 'blocked');
    assert.deepEqual(result.record.completed_phases, ['source_execution', 'scope_observation', 'independent_verification', 'human_acceptance', 'merge']);
  } finally { await rm(value.root, { recursive: true, force: true }); }
});

test('post-merge gate returns outcome-uncertain when target observation is unavailable', async () => {
  const value = await fixture();
  try {
    const result = await createRealAgentDogfoodGraphPostMergeGateAdapter({ plan: value.plan, network_id: 'network-post-merge', verifier_id: 'trusted-runner-1', merge_phase: value.mergePhase, human_acceptance: value.humanAcceptance, authorization: value.authorization, target_worktree: path.join(value.root, 'missing-target'), commands: value.commands, evidence_store: value.evidenceStore })();
    assert.equal(result.status, 'outcome-uncertain');
    assert.equal(result.record.status, 'outcome-uncertain');
  } finally { await rm(value.root, { recursive: true, force: true }); }
});
