import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { createContentAddressedEvidenceStore } from '../dist/content-addressed-evidence-store.js';
import { createRealAgentDogfoodGraphCleanupAdapter } from '../dist/real-agent-dogfood-graph-cleanup-adapter.js';
import { createRealAgentDogfoodGraphPhaseRecord } from '../dist/real-agent-dogfood-graph-state.js';
import { createRealAgentDogfoodGraphPlan } from '../dist/real-agent-dogfood-graph-orchestrator.js';

const run = promisify(execFile);
const digest = (value) => `sha256:${value.repeat(64)}`;

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-cleanup-adapter-'));
  const repo = path.join(root, 'repo');
  const target = path.join(root, 'target');
  const source = path.join(root, 'source');
  const verifier = path.join(root, 'verifier');
  await mkdir(repo);
  await run('git', ['init', '-b', 'main'], { cwd: repo });
  await run('git', ['config', 'user.email', 'test@example.com'], { cwd: repo });
  await run('git', ['config', 'user.name', 'Test'], { cwd: repo });
  await writeFile(path.join(repo, 'README.md'), 'cleanup\n');
  await run('git', ['add', 'README.md'], { cwd: repo });
  await run('git', ['commit', '-m', 'base'], { cwd: repo });
  const baseline = (await run('git', ['rev-parse', 'HEAD'], { cwd: repo })).stdout.trim();
  await run('git', ['worktree', 'add', '--detach', target, baseline], { cwd: repo });
  await run('git', ['worktree', 'add', '--detach', source, baseline], { cwd: repo });
  await run('git', ['worktree', 'add', '--detach', verifier, baseline], { cwd: repo });
  const plan = createRealAgentDogfoodGraphPlan({ dogfood_id: 'dogfood-cleanup', execution_id: 'execution-cleanup', attempt: 1, goal: 'cleanup graph resources', repo_root: repo, baseline_commit: baseline, target_worktree: target, source_worktree: source, verifier_worktree: verifier, evidence_store: path.join(root, 'evidence'), allowed_files: ['README.md'], execution_mode: 'write-enabled', network_policy: 'network-allowed' });
  const priorEvidence = digest('a');
  const prior = createRealAgentDogfoodGraphPhaseRecord({ plan, network_id: 'network-cleanup', phase: 'post_merge_gate', status: 'passed', completed_phases: ['source_execution', 'scope_observation', 'independent_verification', 'human_acceptance', 'merge', 'post_merge_gate'], reason: 'post-merge-gate-passed', actor_kind: 'trusted-runner', actor_identity: 'trusted-runner-1', evidence_digest: priorEvidence, evidence_refs: [priorEvidence] });
  const failedEvidence = digest('b');
  const failedMerge = createRealAgentDogfoodGraphPhaseRecord({ plan, network_id: 'network-cleanup', phase: 'merge', status: 'blocked', completed_phases: ['source_execution', 'scope_observation', 'independent_verification', 'human_acceptance'], reason: 'merge-command-failed', actor_kind: 'coordinator', actor_identity: 'coordinator-1', evidence_digest: failedEvidence, evidence_refs: [failedEvidence] });
  const evidenceStore = await createContentAddressedEvidenceStore({ root: path.join(root, 'evidence') });
  return { root, repo, target, source, verifier, plan, prior, failedMerge, evidenceStore };
}

async function exists(value) {
  try { await stat(value); return true; } catch { return false; }
}

test('cleanup adapter removes all bound disposable worktrees and records a passed cleanup phase', async () => {
  const value = await fixture();
  try {
    const adapter = createRealAgentDogfoodGraphCleanupAdapter({ plan: value.plan, network_id: 'network-cleanup', verifier_id: 'trusted-runner-1', prior_phase: value.prior, repo_root: value.repo, target_worktree: value.target, source_worktree: value.source, verifier_worktree: value.verifier, evidence_store: value.evidenceStore });
    const result = await adapter();
    assert.equal(result.status, 'passed', result.reason);
    assert.equal(result.record.phase, 'cleanup');
    assert.deepEqual(result.record.completed_phases, ['source_execution', 'scope_observation', 'independent_verification', 'human_acceptance', 'merge', 'post_merge_gate', 'cleanup']);
    assert.equal(await exists(value.target), false);
    assert.equal(await exists(value.source), false);
    assert.equal(await exists(value.verifier), false);
    const second = await adapter();
    assert.equal(second.status, 'passed');
    assert.equal(second.record.phase, 'cleanup');
  } finally { await rm(value.root, { recursive: true, force: true }); }
});

test('cleanup adapter blocks a dirty bound worktree without force deleting it', async () => {
  const value = await fixture();
  try {
    await writeFile(path.join(value.source, 'uncommitted.txt'), 'keep\n');
    const result = await createRealAgentDogfoodGraphCleanupAdapter({ plan: value.plan, network_id: 'network-cleanup', verifier_id: 'trusted-runner-1', prior_phase: value.prior, repo_root: value.repo, target_worktree: value.target, source_worktree: value.source, verifier_worktree: value.verifier, evidence_store: value.evidenceStore })();
    assert.equal(result.status, 'blocked');
    assert.equal(result.record.status, 'blocked');
    assert.equal(await exists(value.source), true);
  } finally { await rm(value.root, { recursive: true, force: true }); }
});

test('cleanup adapter reports outcome-uncertain when Git resource facts cannot be observed', async () => {
  const value = await fixture();
  try {
    const result = await createRealAgentDogfoodGraphCleanupAdapter({ plan: value.plan, network_id: 'network-cleanup', verifier_id: 'trusted-runner-1', prior_phase: value.prior, repo_root: path.join(value.root, 'missing-repo'), target_worktree: value.target, source_worktree: value.source, verifier_worktree: value.verifier, evidence_store: value.evidenceStore })();
    assert.equal(result.status, 'outcome-uncertain');
    assert.equal(result.record.status, 'outcome-uncertain');
  } finally { await rm(value.root, { recursive: true, force: true }); }
});

test('cleanup after a blocked business phase records independent Evidence without a Graph cleanup phase', async () => {
  const value = await fixture();
  try {
    const result = await createRealAgentDogfoodGraphCleanupAdapter({ plan: value.plan, network_id: 'network-cleanup', verifier_id: 'trusted-runner-1', prior_phase: value.failedMerge, repo_root: value.repo, target_worktree: value.target, source_worktree: value.source, verifier_worktree: value.verifier, evidence_store: value.evidenceStore })();
    assert.equal(result.status, 'passed');
    assert.equal(result.record, undefined);
    assert.match(result.evidence_digest, /^sha256:[0-9a-f]{64}$/);
    assert.equal(await exists(value.target), false);
    assert.equal(await exists(value.source), false);
    assert.equal(await exists(value.verifier), false);
  } finally { await rm(value.root, { recursive: true, force: true }); }
});
