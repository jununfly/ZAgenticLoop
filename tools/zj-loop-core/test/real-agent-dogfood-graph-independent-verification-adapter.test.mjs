import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { createContentAddressedEvidenceStore } from '../dist/content-addressed-evidence-store.js';
import { createRealAgentDogfoodGraphIndependentVerificationAdapter } from '../dist/real-agent-dogfood-graph-independent-verification-adapter.js';
import { createRealAgentDogfoodGraphPhaseRecord } from '../dist/real-agent-dogfood-graph-state.js';
import { createRealAgentDogfoodGraphPlan } from '../dist/real-agent-dogfood-graph-orchestrator.js';

const run = promisify(execFile);
const digest = (letter) => `sha256:${letter.repeat(64)}`;

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-independent-verification-adapter-'));
  const source = path.join(root, 'source');
  const verifier = path.join(root, 'verifiers', 'execution-independent-attempt-1');
  await mkdir(source);
  await run('git', ['init', '-b', 'master'], { cwd: source });
  await run('git', ['config', 'user.email', 'test@example.com'], { cwd: source });
  await run('git', ['config', 'user.name', 'Test'], { cwd: source });
  await writeFile(path.join(source, 'README.md'), 'source\n');
  await run('git', ['add', 'README.md'], { cwd: source });
  await run('git', ['commit', '-m', 'source'], { cwd: source });
  const plan = createRealAgentDogfoodGraphPlan({ dogfood_id: 'dogfood-independent', execution_id: 'execution-independent', attempt: 1, goal: 'verify', repo_root: source, baseline_commit: 'a'.repeat(40), target_worktree: path.join(root, 'target'), source_worktree: source, verifier_worktree: verifier, evidence_store: path.join(root, 'evidence'), allowed_files: ['README.md'], execution_mode: 'write-enabled', network_policy: 'network-allowed' });
  const sourcePhase = createRealAgentDogfoodGraphPhaseRecord({ plan, network_id: 'network-independent', phase: 'source_execution', status: 'passed', completed_phases: ['source_execution'], reason: 'provider-completed', actor_kind: 'agent-node', actor_identity: 'worker-1', evidence_digest: digest('a'), evidence_refs: [digest('a')], execution_binding_digest: digest('b'), worker_lease_digest: digest('c') });
  const scopePhase = createRealAgentDogfoodGraphPhaseRecord({ plan, network_id: 'network-independent', phase: 'scope_observation', status: 'passed', completed_phases: ['source_execution', 'scope_observation'], reason: 'scope-observed', actor_kind: 'coordinator', actor_identity: 'coordinator-1', evidence_digest: digest('d'), evidence_refs: [digest('d')], execution_binding_digest: digest('b'), worker_lease_digest: digest('c') });
  const evidenceStore = await createContentAddressedEvidenceStore({ root: path.join(root, 'evidence') });
  const commands = [{ id: 'node-version', executable: process.execPath, args: ['--version'], timeout_ms: 10_000 }];
  return { root, plan, sourcePhase, scopePhase, evidenceStore, commands, verifier };
}

test('independent verification runs fixed commands in a disposable verifier worktree and records Evidence', async () => {
  const value = await fixture();
  try {
    const result = await createRealAgentDogfoodGraphIndependentVerificationAdapter({ plan: value.plan, network_id: 'network-independent', verifier_id: 'verifier-1', evidence_store: value.evidenceStore, source_phase: value.sourcePhase, scope_phase: value.scopePhase, commands: value.commands })();
    assert.equal(result.status, 'passed', result.reason);
    assert.equal(result.record.phase, 'independent_verification');
    assert.equal(result.record.actor_kind, 'trusted-runner');
    assert.deepEqual(result.record.completed_phases, ['source_execution', 'scope_observation', 'independent_verification']);
    assert.match(result.evidence_digest, /^sha256:[0-9a-f]{64}$/);
  } finally { await run('git', ['worktree', 'remove', '--force', value.verifier], { cwd: value.plan.source_worktree }).catch(() => {}); await rm(value.root, { recursive: true, force: true }); }
});

test('independent verification blocks a failed fixed command and does not claim passed', async () => {
  const value = await fixture();
  try {
    const result = await createRealAgentDogfoodGraphIndependentVerificationAdapter({ plan: value.plan, network_id: 'network-independent', verifier_id: 'verifier-1', evidence_store: value.evidenceStore, source_phase: value.sourcePhase, scope_phase: value.scopePhase, commands: [{ id: 'failure', executable: process.execPath, args: ['-e', 'process.exit(2)'], timeout_ms: 10_000 }] })();
    assert.equal(result.status, 'blocked', result.reason);
    assert.equal(result.record.status, 'blocked');
    assert.deepEqual(result.record.completed_phases, ['source_execution', 'scope_observation']);
  } finally { await run('git', ['worktree', 'remove', '--force', value.verifier], { cwd: value.plan.source_worktree }).catch(() => {}); await rm(value.root, { recursive: true, force: true }); }
});
