import assert from 'node:assert/strict';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createRealAgentDogfoodExecutionBindingDigest } from '../dist/real-agent-dogfood-binding.js';
import { createRealAgentDogfoodDraft, createRealAgentDogfoodTransition } from '../dist/real-agent-dogfood-lifecycle.js';
import { createRealAgentDogfoodGraphPlan } from '../dist/real-agent-dogfood-graph-orchestrator.js';
import { createRealAgentDogfoodGraphSourceExecutionAdapter } from '../dist/real-agent-dogfood-graph-source-execution-adapter.js';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';

const digest = (letter) => `sha256:${letter.repeat(64)}`;

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-source-adapter-'));
  const source = path.join(root, 'source');
  const executable = path.join(root, 'codex');
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  await stateStore.createNetwork({ network_id: 'network-source-adapter', owner_id: 'human-local' });
  await writeFile(executable, '#!/bin/sh\n');
  await chmod(executable, 0o755);
  const plan = createRealAgentDogfoodGraphPlan({ dogfood_id: 'dogfood-source-adapter', execution_id: 'execution-source-adapter', attempt: 1, goal: 'source', repo_root: source, baseline_commit: 'a'.repeat(40), target_worktree: path.join(root, 'target'), source_worktree: source, verifier_worktree: path.join(root, 'verifier'), evidence_store: path.join(root, 'evidence'), allowed_files: ['README.md'], execution_mode: 'write-enabled', network_policy: 'network-allowed' });
    const args = ['exec', '--json', '--ephemeral', '--sandbox', 'workspace-write', '--cd', source];
  const executionBindingDigest = await createRealAgentDogfoodExecutionBindingDigest({ executable, args, cwd: source, worktree_path: source });
  const draft = createRealAgentDogfoodDraft({ network_id: 'network-source-adapter', dogfood_id: plan.dogfood_id, execution_id: plan.execution_id, attempt: 1, provider_id: 'codex', adapter_version: 'codex-agent-provider.v1', created_at: '2026-08-06T00:00:00.000Z' });
  const running = createRealAgentDogfoodTransition({ lifecycle: draft.lifecycle, to: 'preflight-ready', event_id: 'preflight', occurred_at: '2026-08-06T00:00:01.000Z', fact_digest: digest('b'), next_action: 'human-approval' });
  const awaiting = createRealAgentDogfoodTransition({ lifecycle: running.lifecycle, to: 'awaiting-human-approval', event_id: 'awaiting', occurred_at: '2026-08-06T00:00:02.000Z', fact_digest: digest('c'), next_action: 'human-approval' });
  const active = createRealAgentDogfoodTransition({ lifecycle: awaiting.lifecycle, to: 'running', event_id: 'running', occurred_at: '2026-08-06T00:00:03.000Z', approval_digest: digest('a'), next_action: 'provider-execution' });
  const evidenceStore = { put: async () => ({ digest: digest('x'), size: 1, path: '/tmp/x', kind: 'test' }), read: async () => Buffer.from(''), readOnly: async () => Buffer.from('') };
  return { root, stateStore, state_store: stateStore, plan, executable, args, executionBindingDigest, lifecycle: active.lifecycle, evidenceStore, evidence_store: evidenceStore };
}

function admission(plan) {
  return { preflight: { cwd: plan.source_worktree }, execution: { execution_id: plan.execution_id, attempt: plan.attempt } };
}

test('source adapter binds the real source worktree, worker lease, provider fact and Graph phase record', async () => {
  const fixtureValue = await fixture();
  try {
    let workerInput;
    const adapter = createRealAgentDogfoodGraphSourceExecutionAdapter({ ...fixtureValue, network_id: 'network-source-adapter', worker_id: 'worker-source', execution_binding_digest: fixtureValue.executionBindingDigest, admission_bound_execution: admission(fixtureValue.plan), goal: fixtureValue.plan.goal, provider: { run: async () => ({}) }, worker_runner: async (input) => { workerInput = input; return { status: 'verification-pending', stdout_digest: digest('s'), stderr_digest: digest('t'), stdout_size: 1, stderr_size: 1, provider_fact_digest: digest('f'), revision: input.expected_revision, reason_code: 'provider-completed', next_action: 'run-independent-verifier' }; } });
    const result = await adapter();
    assert.equal(result.status, 'passed');
    assert.equal(result.record.phase, 'source_execution');
    assert.equal(result.record.actor_identity, 'worker-source');
    assert.equal(result.record.execution_binding_digest, fixtureValue.executionBindingDigest);
    assert.equal(workerInput.worktree_path, fixtureValue.plan.source_worktree);
    assert.equal(workerInput.execution_mode, 'write-enabled');
  } finally { await fixtureValue.stateStore.close(); await rm(fixtureValue.root, { recursive: true, force: true }); }
});

test('source adapter does not report passed when worker lease release is uncertain', async () => {
  const fixtureValue = await fixture();
  try {
    const adapter = createRealAgentDogfoodGraphSourceExecutionAdapter({ ...fixtureValue, network_id: 'network-source-adapter', worker_id: 'worker-source', execution_binding_digest: fixtureValue.executionBindingDigest, admission_bound_execution: admission(fixtureValue.plan), goal: fixtureValue.plan.goal, provider: { run: async () => ({}) }, worker_runner: async (input) => { await fixtureValue.stateStore.appendEvent({ network_id: 'network-source-adapter', expected_revision: await fixtureValue.stateStore.getRevision('network-source-adapter'), event: { event_id: 'race', aggregate_type: 'race', aggregate_id: 'race', event_type: 'race', occurred_at: '2026-08-06T00:00:04.000Z', payload: {} } }); return { status: 'verification-pending', stdout_digest: digest('s'), stderr_digest: digest('t'), stdout_size: 1, stderr_size: 1, provider_fact_digest: digest('f'), revision: input.expected_revision, reason_code: 'provider-completed', next_action: 'run-independent-verifier' }; } });
    const result = await adapter();
    assert.equal(result.status, 'outcome-uncertain');
    assert.equal(result.reason, 'source-execution-worker-lease-release-uncertain');
  } finally { await fixtureValue.stateStore.close(); await rm(fixtureValue.root, { recursive: true, force: true }); }
});
