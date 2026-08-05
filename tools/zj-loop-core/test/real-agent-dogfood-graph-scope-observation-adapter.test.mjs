import assert from 'node:assert/strict';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { createRealAgentDogfoodGraphPlan } from '../dist/real-agent-dogfood-graph-orchestrator.js';
import { createRealAgentDogfoodGraphPhaseRecord } from '../dist/real-agent-dogfood-graph-state.js';
import { createRealAgentDogfoodGraphScopeObservationAdapter } from '../dist/real-agent-dogfood-graph-scope-observation-adapter.js';
import { createContentAddressedEvidenceStore } from '../dist/content-addressed-evidence-store.js';

const run = promisify(execFile);
const digest = (letter) => `sha256:${letter.repeat(64)}`;

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-scope-adapter-'));
  const repo = path.join(root, 'repo');
  await (await import('node:fs/promises')).mkdir(repo);
  await run('git', ['init', '-b', 'master'], { cwd: repo });
  await run('git', ['config', 'user.email', 'test@example.com'], { cwd: repo });
  await run('git', ['config', 'user.name', 'Test'], { cwd: repo });
  await writeFile(path.join(repo, 'README.md'), 'base\n');
  await run('git', ['add', 'README.md'], { cwd: repo });
  await run('git', ['commit', '-m', 'base'], { cwd: repo });
  const { stdout } = await run('git', ['rev-parse', 'HEAD'], { cwd: repo });
  const baseline = stdout.trim();
  await writeFile(path.join(repo, 'README.md'), 'observed\n');
  await run('git', ['add', 'README.md'], { cwd: repo });
  await run('git', ['commit', '-m', 'source'], { cwd: repo });
  const plan = createRealAgentDogfoodGraphPlan({ dogfood_id: 'dogfood-scope', execution_id: 'execution-scope', attempt: 1, goal: 'scope', repo_root: repo, baseline_commit: baseline, target_worktree: path.join(root, 'target'), source_worktree: repo, verifier_worktree: path.join(root, 'verifier'), evidence_store: path.join(root, 'evidence'), allowed_files: ['README.md'], execution_mode: 'write-enabled', network_policy: 'network-allowed' });
  const source = createRealAgentDogfoodGraphPhaseRecord({ plan, network_id: 'network-scope', phase: 'source_execution', status: 'passed', completed_phases: ['source_execution'], reason: 'provider-completed', actor_kind: 'agent-node', actor_identity: 'worker-1', evidence_digest: digest('a'), evidence_refs: [digest('a')], execution_binding_digest: digest('b'), worker_lease_digest: digest('c') });
  const evidenceStore = await createContentAddressedEvidenceStore({ root: path.join(root, 'evidence') });
  return { root, plan, source, evidenceStore };
}

test('scope adapter observes the source worktree and emits independent coordinator Evidence', async () => {
  const value = await fixture();
  try {
    const result = await createRealAgentDogfoodGraphScopeObservationAdapter({ plan: value.plan, network_id: 'network-scope', coordinator_id: 'coordinator-1', evidence_store: value.evidenceStore, source_phase: value.source })();
    assert.equal(result.status, 'passed');
    assert.equal(result.record.phase, 'scope_observation');
    assert.equal(result.record.actor_kind, 'coordinator');
    assert.deepEqual(result.record.completed_phases, ['source_execution', 'scope_observation']);
    assert.match(result.evidence_digest, /^sha256:[0-9a-f]{64}$/);
  } finally { await rm(value.root, { recursive: true, force: true }); }
});

test('scope adapter blocks extra committed files and never claims scope passed', async () => {
  const value = await fixture();
  try {
    await writeFile(path.join(value.plan.source_worktree, 'extra.txt'), 'drift\n');
    await run('git', ['add', 'extra.txt'], { cwd: value.plan.source_worktree });
    await run('git', ['commit', '-m', 'scope drift'], { cwd: value.plan.source_worktree });
    const result = await createRealAgentDogfoodGraphScopeObservationAdapter({ plan: value.plan, network_id: 'network-scope', coordinator_id: 'coordinator-1', evidence_store: value.evidenceStore, source_phase: value.source })();
    assert.equal(result.status, 'blocked');
    assert.equal(result.record.status, 'blocked');
    assert.equal(result.record.completed_phases.length, 1);
    assert.equal(result.record.reason, 'write-scope-file-drift');
  } finally { await rm(value.root, { recursive: true, force: true }); }
});
