import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { createContentAddressedEvidenceStore } from '../dist/content-addressed-evidence-store.js';
import { createRealAgentDogfoodExecutionBindingDigest } from '../dist/real-agent-dogfood-binding.js';
import { createRealAgentDogfoodDraft, createRealAgentDogfoodTransition } from '../dist/real-agent-dogfood-lifecycle.js';
import { createRealAgentDogfoodGraphConformanceCoordinatorWithRealAdapters } from '../dist/real-agent-dogfood-graph-real-adapters.js';
import { createRealAgentDogfoodGraphPlan } from '../dist/real-agent-dogfood-graph-orchestrator.js';
import { createLocalGitNativeOpnGraphMergeAdapter, nativeOpnTracerMergeAuthorizationDigest } from '../dist/native-opn-graph-merge.js';
import { createNativeOpnTracerAggregation } from '../dist/native-opn-tracer-aggregation.js';
import { createNativeOpnTracerReviewHandoff } from '../dist/review-handoff.js';
import { createNativeOpnTracerVerification } from '../dist/native-opn-tracer-verification.js';
import { createHumanAcceptance } from '../dist/human-acceptance.js';
import { createInMemoryHumanSigner } from '../dist/human-signer.js';
import { replayRealAgentDogfoodGraphReadModel } from '../dist/real-agent-dogfood-replay.js';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';

const execFile = promisify(execFileCallback);
const digest = (letter) => `sha256:${({ g: '1', h: '2', i: '3', j: '4', k: '5' }[letter] ?? letter).repeat(64)}`;

async function git(cwd, args, env = {}) {
  const result = await execFile('git', args, { cwd, env: { ...process.env, ...env }, maxBuffer: 1024 * 1024 });
  return result.stdout.trim();
}

async function gitResult(cwd, args) {
  try { return { status: 0, stdout: await git(cwd, args) }; }
  catch (error) { return { status: error.code ?? 1, stdout: error.stdout ?? '' }; }
}

async function createRepository(root) {
  const repo = root;
  await execFile('git', ['init', '-q', '-b', 'master'], { cwd: root });
  await git(root, ['config', 'user.email', 'fixture@example.test']);
  await git(root, ['config', 'user.name', 'Graph Fixture']);
  await writeFile(path.join(root, 'README.md'), 'baseline\n');
  await git(root, ['add', 'README.md']);
  await git(root, ['commit', '-q', '-m', 'baseline']);
  const baseline = await git(root, ['rev-parse', 'HEAD']);
  await git(root, ['worktree', 'add', '-q', '-b', 'graph-target', path.join(root, 'target'), baseline]);
  await git(root, ['worktree', 'add', '-q', '-b', 'graph-source', path.join(root, 'source'), baseline]);
  const source = path.join(root, 'source');
  await writeFile(path.join(source, 'README.md'), 'graph result\n');
  await git(source, ['add', 'README.md']);
  const commitEnv = { GIT_AUTHOR_DATE: '2026-08-06T00:00:00Z', GIT_COMMITTER_DATE: '2026-08-06T00:00:00Z' };
  await git(source, ['commit', '-q', '-m', 'graph result'], commitEnv);
  const sourceCommit = await git(source, ['rev-parse', 'HEAD']);
  await git(source, ['reset', '-q', '--hard', baseline]);
  return { repo, baseline, sourceCommit, target: path.join(root, 'target'), source, verifier: path.join(root, 'verifier', 'execution-full-chain-attempt-1') };
}

function acceptedLifecycle(plan) {
  const draft = createRealAgentDogfoodDraft({ network_id: 'network-full-chain', dogfood_id: plan.dogfood_id, execution_id: plan.execution_id, attempt: 1, provider_id: 'fixture-agent', adapter_version: 'fixture-agent.v1', created_at: '2026-08-06T00:00:00.000Z' });
  const transition = (lifecycle, to, id, extra = {}) => createRealAgentDogfoodTransition({ lifecycle, to, event_id: id, occurred_at: '2026-08-06T00:00:01.000Z', fact_digest: digest('a'), ...extra });
  const ready = transition(draft.lifecycle, 'preflight-ready', 'ready');
  const awaiting = transition(ready.lifecycle, 'awaiting-human-approval', 'awaiting');
  const running = transition(awaiting.lifecycle, 'running', 'running', { approval_digest: digest('b') });
  const verifying = transition(running.lifecycle, 'verification-pending', 'verifying');
  const review = transition(verifying.lifecycle, 'review-pending', 'review');
  const accepted = transition(review.lifecycle, 'accepted', 'accepted');
  return { lifecycle: accepted.lifecycle, events: [draft.event, ready.event, awaiting.event, running.event, verifying.event, review.event, accepted.event] };
}

test('real adapters complete the deterministic seven-phase Graph chain and replay closed state', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-graph-full-chain-'));
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  try {
    const repository = await createRepository(root);
    const networkId = 'network-full-chain';
    const plan = createRealAgentDogfoodGraphPlan({
      dogfood_id: 'dogfood-full-chain', execution_id: 'execution-full-chain', attempt: 1,
      goal: 'complete deterministic Graph chain', repo_root: repository.repo, baseline_commit: repository.baseline,
      target_worktree: repository.target, source_worktree: repository.source, verifier_worktree: repository.verifier,
      evidence_store: path.join(root, 'evidence'), allowed_files: ['README.md'], execution_mode: 'write-enabled', network_policy: 'network-allowed',
    });
    await stateStore.createNetwork({ network_id: networkId, owner_id: 'human-1' });
    const evidenceStore = await createContentAddressedEvidenceStore({ root: plan.evidence_store });
    const executable = path.join(root, 'fixture-agent');
    await writeFile(executable, '#!/bin/sh\nexit 0\n');
    await chmod(executable, 0o755);
    const args = ['exec', '--json', '--ephemeral', '--sandbox', 'workspace-write', '--cd', repository.source];
    const executionBindingDigest = await createRealAgentDogfoodExecutionBindingDigest({ executable, args, cwd: repository.source, worktree_path: repository.source });
    const draft = createRealAgentDogfoodDraft({ network_id: networkId, dogfood_id: plan.dogfood_id, execution_id: plan.execution_id, attempt: 1, provider_id: 'fixture-agent', adapter_version: 'fixture-agent.v1', created_at: '2026-08-06T00:00:00.000Z' });
    const preflight = createRealAgentDogfoodTransition({ lifecycle: draft.lifecycle, to: 'preflight-ready', event_id: 'fixture-preflight', occurred_at: '2026-08-06T00:00:01.000Z', fact_digest: digest('a'), next_action: 'human-approval' });
    const awaiting = createRealAgentDogfoodTransition({ lifecycle: preflight.lifecycle, to: 'awaiting-human-approval', event_id: 'fixture-awaiting', occurred_at: '2026-08-06T00:00:02.000Z', fact_digest: digest('b'), next_action: 'human-approval' });
    const active = createRealAgentDogfoodTransition({ lifecycle: awaiting.lifecycle, to: 'running', event_id: 'fixture-running', occurred_at: '2026-08-06T00:00:03.000Z', approval_digest: digest('c'), next_action: 'provider-execution' });
    const targetWorktreeRef = `worktree:graph-target:${plan.dogfood_id}:${plan.execution_id}`;
    const scopeDigest = digest('d');
    const authorization = { source_commit_sha: repository.sourceCommit, target_ref: 'refs/heads/graph-target', target_worktree_ref: targetWorktreeRef, strategy: 'fast-forward-only', scope_digest: scopeDigest, deterministic_gate_digest: digest('e') };
    const aggregation = createNativeOpnTracerAggregation({
      network_id: networkId, event_id: 'graph-event-full-chain', plan_id: 'graph-plan-full-chain', plan_revision: 1, plan_digest: plan.plan_digest,
      aggregation_id: plan.execution_id, execution_ids: [plan.execution_id, 'verification-source'], input_evidence_digests: [digest('f'), digest('g')], output_evidence_digest: digest('h'), aggregated_at: '2026-08-06T00:00:04.000Z',
      graph: { responsibility_unit: 'human+agent', human_id: 'human-1', lifecycle_status: 'review-pending', execution_bindings: [
        { execution_id: plan.execution_id, node_id: 'Agent1', task_id: 'source', commit_sha: repository.sourceCommit, worktree_ref: `worktree:graph-source:${plan.execution_id}` },
        { execution_id: 'verification-source', node_id: 'Agent2', task_id: 'verify', commit_sha: repository.sourceCommit, worktree_ref: repository.verifier },
      ], resource_isolation: [
        { node_id: 'Agent1', resource_id: 'repo', strategy: 'git-branch-worktree', isolation_ref: repository.source },
        { node_id: 'Agent2', resource_id: 'repo', strategy: 'git-branch-worktree-read-only', isolation_ref: repository.verifier },
      ], merge_authorization: authorization },
    });
    const verification = createNativeOpnTracerVerification({
      network_id: networkId, event_id: aggregation.event_id, plan_id: aggregation.plan_id, plan_revision: 1, plan_digest: plan.plan_digest,
      aggregation_id: aggregation.aggregation_id, aggregation_digest: aggregation.aggregation_digest, verifier_id: 'verifier-full-chain', excluded_node_ids: ['human-1'], status: 'passed',
      conditions: ['source-commit', 'scope', 'verification'], satisfied_conditions: ['source-commit', 'scope', 'verification'], failed_conditions: [], evidence_digest: digest('i'), checked_at: '2026-08-06T00:00:05.000Z',
      graph: { verifier_execution_id: 'verifier-full-chain', source_commit_sha: repository.sourceCommit, source_execution_ids: [plan.execution_id, 'verification-source'], verifier_worktree_ref: repository.verifier },
    });
    const handoff = createNativeOpnTracerReviewHandoff({ aggregation, verification, dependencies_closed: true, remaining_risks: [], external_resource_states: [{ resource_id: 'repo', last_known_status: 'ready-to-merge', responsible_party: 'human-1' }], responsible_party: 'human-1', accepted_at: '2026-08-06T00:00:06.000Z' });
    const signer = createInMemoryHumanSigner({ human_id: 'human-1' });
    const identity = await signer.getPublicIdentity();
    const acceptance = await createHumanAcceptance({ signer, handoff, plan_digest: plan.plan_digest, accepted_at: '2026-08-06T00:00:07.000Z' });
    const humanAcceptanceConfig = { plan_id: aggregation.plan_id, plan_revision: 1, human_id: 'human-1', identity, handoff, acceptance, evidence_store: evidenceStore };
    const mergeAdapter = createLocalGitNativeOpnGraphMergeAdapter({ repo_root: repository.target, target_worktree_ref: targetWorktreeRef, authorization, scope_digest: scopeDigest });
    const verificationCommands = [{ id: 'verify-readme', executable: process.execPath, args: ['-e', "if (require('node:fs').readFileSync('README.md', 'utf8') !== 'graph result\\n') process.exit(1)"], timeout_ms: 5000 }];
    const gateCommands = [
      { id: 'git-diff-check', executable: 'git', args: ['diff', '--check'], timeout_ms: 5000 },
      { id: 'project-build', executable: process.execPath, args: ['-e', 'process.exit(0)'], timeout_ms: 5000 },
      { id: 'target-test', executable: process.execPath, args: ['-e', 'process.exit(0)'], timeout_ms: 5000 },
      { id: 'graph-regression', executable: process.execPath, args: ['-e', 'process.exit(0)'], timeout_ms: 5000 },
    ];
    const accepted = acceptedLifecycle(plan);
    const coordinator = await createRealAgentDogfoodGraphConformanceCoordinatorWithRealAdapters({
      plan, network_id: networkId, human_id: 'human-1', coordinator_id: 'coordinator-1', session_id: 'session-full-chain', execution_binding_digest: executionBindingDigest, state_store: stateStore,
      real_adapters: {
        source_execution: { state_store: stateStore, evidence_store: evidenceStore, lifecycle: active.lifecycle, worker_id: 'Agent1', execution_binding_digest: executionBindingDigest, executable, args, admission_bound_execution: { preflight: { cwd: repository.source }, execution: { execution_id: plan.execution_id, attempt: plan.attempt } }, goal: plan.goal, provider: { run: async () => ({}) }, worker_runner: async (input) => { await git(repository.source, ['reset', '--hard', repository.sourceCommit]); const fact = await evidenceStore.put({ kind: 'fixture-provider-result', content: JSON.stringify({ schema: 'zj-loop.real_agent_dogfood_provider_result.v1', network_id: networkId, dogfood_id: plan.dogfood_id, execution_id: plan.execution_id, attempt: 1, status: 'verification-pending' }) }); return { status: 'verification-pending', stdout_digest: digest('j'), stderr_digest: digest('k'), stdout_size: 0, stderr_size: 0, provider_fact_digest: fact.digest, revision: input.expected_revision, reason_code: 'provider-completed', next_action: 'run-independent-verifier' }; } },
        scope_observation: { coordinator_id: 'coordinator-1', evidence_store: evidenceStore },
        independent_verification: { verifier_id: 'verifier-full-chain', evidence_store: evidenceStore, commands: verificationCommands },
        human_acceptance: humanAcceptanceConfig,
        merge: { coordinator_id: 'coordinator-1', human_acceptance: { decision: acceptance.decision, merge_authorization_digest: acceptance.merge_authorization_digest }, authorization, merge_adapter: mergeAdapter, evidence_store: evidenceStore },
        post_merge_gate: { verifier_id: 'verifier-full-chain', human_acceptance: { decision: acceptance.decision, merge_authorization_digest: acceptance.merge_authorization_digest }, authorization, target_worktree: repository.target, commands: gateCommands, evidence_store: evidenceStore },
        cleanup: { verifier_id: 'verifier-full-chain', repo_root: repository.repo, target_worktree: repository.target, source_worktree: repository.source, verifier_worktree: repository.verifier, evidence_store: evidenceStore },
      },
      replay: async () => {
        const graphEvents = (await stateStore.readEvents({ network_id: networkId, aggregate_type: 'real-agent-dogfood-graph', aggregate_id: plan.dogfood_id })).events;
        const replay = await replayRealAgentDogfoodGraphReadModel({ network_id: networkId, plan, lifecycle_events: accepted.events, graph_events: graphEvents, evidenceStore });
        return { status: replay.status === 'passed' ? 'passed' : replay.status === 'in-progress' ? 'outcome-uncertain' : replay.status, integrity_status: replay.integrity_status, read_model_digest: replay.read_model_digest };
      },
    });
    const result = await coordinator.run();
    assert.equal(result.status, 'closed', JSON.stringify(result));
    assert.deepEqual(result.completed_phases, ['source_execution', 'scope_observation', 'independent_verification', 'human_acceptance', 'merge', 'post_merge_gate', 'cleanup']);
    const graphEvents = (await stateStore.readEvents({ network_id: networkId, aggregate_type: 'real-agent-dogfood-graph', aggregate_id: plan.dogfood_id })).events;
    assert.equal(graphEvents.length, 7);
    assert.deepEqual(graphEvents.map((event) => event.payload.phase), result.completed_phases);
    const replay = await replayRealAgentDogfoodGraphReadModel({ network_id: networkId, plan, lifecycle_events: accepted.events, graph_events: graphEvents, evidenceStore });
    assert.equal(replay.status, 'passed');
    assert.equal(replay.integrity_status, 'complete');
    assert.equal(replay.graph.current_phase, 'cleanup');
    assert.deepEqual(replay.graph.completed_phases, result.completed_phases);
    assert.equal((await gitResult(repository.repo, ['worktree', 'list', '--porcelain'])).stdout.includes(repository.target), false);
    assert.equal((await gitResult(repository.repo, ['worktree', 'list', '--porcelain'])).stdout.includes(repository.source), false);
    assert.equal((await gitResult(repository.repo, ['worktree', 'list', '--porcelain'])).stdout.includes(repository.verifier), false);
  } finally {
    await stateStore.close();
    await rm(root, { recursive: true, force: true });
  }
});
