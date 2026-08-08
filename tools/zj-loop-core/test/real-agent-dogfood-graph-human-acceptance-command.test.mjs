import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';
import { createInMemoryHumanSigner } from '../dist/human-signer.js';
import { createProviderOutcome } from '../dist/provider-outcome.js';
import { createProviderOutcomeVerification } from '../dist/provider-outcome-verification.js';
import { createReviewHandoff } from '../dist/review-handoff.js';
import { createRealAgentDogfoodGraphPlan } from '../dist/real-agent-dogfood-graph-orchestrator.js';
import { recordRealAgentDogfoodGraphHumanAcceptanceFact } from '../dist/real-agent-dogfood-graph-human-acceptance-command.js';
import { createRealAgentDogfoodGraphHumanAcceptanceStateStoreAdapter } from '../dist/real-agent-dogfood-graph-human-acceptance-state-store-adapter.js';
import { createRealAgentDogfoodGraphPhaseRecord } from '../dist/real-agent-dogfood-graph-state.js';
import { createContentAddressedEvidenceStore } from '../dist/content-addressed-evidence-store.js';

const digest = (letter) => `sha256:${letter.repeat(64)}`;
const plan = createRealAgentDogfoodGraphPlan({ dogfood_id: 'dogfood-human-command', execution_id: 'execution-human-command', attempt: 1, goal: 'Human acceptance command', repo_root: '/repo', baseline_commit: 'a'.repeat(40), target_worktree: '/tmp/target-human-command', source_worktree: '/tmp/source-human-command', verifier_worktree: '/tmp/verifier-human-command', evidence_store: '/tmp/evidence-human-command', allowed_files: ['README.md'], execution_mode: 'write-enabled', network_policy: 'network-allowed' });

test('phase-native Human acceptance command records a signed fact without appending a Graph phase', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-human-acceptance-command-'));
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  try {
    const network_id = 'network-human-command';
    await stateStore.createNetwork({ network_id, owner_id: 'human-1' });
    const outcome = createProviderOutcome({ network_id, event_id: 'event-human-command', plan_id: 'plan-human-command', plan_revision: 1, execution_id: plan.execution_id, task_id: 'task-human-command', provider_id: 'agent-1', provider_kind: 'fixture', provider_request_id: 'request-human-command', request_digest: digest('1'), response_digest: digest('2'), resource_scope: ['resource:human-command'], observed_at: '2026-08-08T00:00:00.000Z', outcome: 'confirmed-success', side_effects_executed: true, evidence: { kind: 'receipt', receipt_id: 'receipt-human-command', receipt_digest: digest('3') } });
    const verification = createProviderOutcomeVerification({ outcome, verifier_id: 'verifier-1', verification_conditions: ['present'], satisfied_conditions: ['present'], failed_conditions: [], evidence_digest: digest('4'), checked_at: '2026-08-08T00:00:01.000Z' });
    const handoff = createReviewHandoff({ verification, dependencies_closed: true, remaining_risks: [], external_resource_states: [{ resource_id: 'resource:human-command', last_known_status: 'ready', responsible_party: 'human-1' }], responsible_party: 'human-1', accepted_at: '2026-08-08T00:00:02.000Z' });
    const signer = createInMemoryHumanSigner({ human_id: 'human-1' });
    const result = await recordRealAgentDogfoodGraphHumanAcceptanceFact({ stateStore, plan, network_id, handoff, signer, plan_digest: plan.plan_digest, accepted_at: '2026-08-08T00:00:03.000Z' });
    assert.equal(result.status, 'recorded');
    assert.equal((await stateStore.readEvents({ network_id, aggregate_type: 'human-acceptance' })).events.length, 1);
    assert.equal((await stateStore.readEvents({ network_id, aggregate_type: 'real-agent-dogfood-graph' })).events.length, 0);
    const replay = await recordRealAgentDogfoodGraphHumanAcceptanceFact({ stateStore, plan, network_id, handoff, signer, plan_digest: plan.plan_digest, accepted_at: '2026-08-08T00:00:03.000Z' });
    assert.equal(replay.status, 'duplicate');
  } finally { await stateStore.close(); await rm(root, { recursive: true, force: true }); }
});

test('phase-native Human acceptance command blocks a handoff from another Graph execution', async () => {
  const signer = createInMemoryHumanSigner({ human_id: 'human-1' });
  await assert.rejects(() => recordRealAgentDogfoodGraphHumanAcceptanceFact({ stateStore: { getRevision: async () => 1 }, plan, network_id: 'network-human-command', handoff: { execution_id: 'other-execution' }, signer, plan_digest: plan.plan_digest, accepted_at: '2026-08-08T00:00:03.000Z' }), /graph-human-acceptance-handoff-binding-invalid/);
});

test('Coordinator state-store Human acceptance adapter consumes the signed fact and returns a phase record', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-human-acceptance-adapter-'));
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  const evidenceStore = await createContentAddressedEvidenceStore({ root: path.join(root, 'evidence') });
  try {
    const network_id = 'network-human-adapter';
    const adapterPlan = { ...plan, dogfood_id: 'dogfood-human-adapter', execution_id: 'execution-human-adapter', plan_digest: plan.plan_digest };
    await stateStore.createNetwork({ network_id, owner_id: 'human-1' });
    const outcome = createProviderOutcome({ network_id, event_id: 'event-human-adapter', plan_id: 'plan-human-adapter', plan_revision: 1, execution_id: adapterPlan.execution_id, task_id: 'task-human-adapter', provider_id: 'agent-1', provider_kind: 'fixture', provider_request_id: 'request-human-adapter', request_digest: digest('1'), response_digest: digest('2'), resource_scope: ['resource:human-adapter'], observed_at: '2026-08-08T00:00:00.000Z', outcome: 'confirmed-success', side_effects_executed: true, evidence: { kind: 'receipt', receipt_id: 'receipt-human-adapter', receipt_digest: digest('3') } });
    const verification = createProviderOutcomeVerification({ outcome, verifier_id: 'verifier-1', verification_conditions: ['present'], satisfied_conditions: ['present'], failed_conditions: [], evidence_digest: digest('4'), checked_at: '2026-08-08T00:00:01.000Z' });
    const handoff = createReviewHandoff({ verification, dependencies_closed: true, remaining_risks: [], external_resource_states: [{ resource_id: 'resource:human-adapter', last_known_status: 'ready', responsible_party: 'human-1' }], responsible_party: 'human-1', accepted_at: '2026-08-08T00:00:02.000Z' });
    const signer = createInMemoryHumanSigner({ human_id: 'human-1' });
    await recordRealAgentDogfoodGraphHumanAcceptanceFact({ stateStore, plan: adapterPlan, network_id, handoff, signer, plan_digest: adapterPlan.plan_digest, accepted_at: '2026-08-08T00:00:03.000Z' });
    const phase = (name, completed, letter, actor_kind, actor_identity) => createRealAgentDogfoodGraphPhaseRecord({ plan: adapterPlan, network_id, phase: name, status: 'passed', completed_phases: completed, reason: 'passed', evidence_digest: digest(letter), evidence_refs: [digest(letter)], actor_kind, actor_identity, ...(name === 'source_execution' ? { execution_binding_digest: digest('8'), worker_lease_digest: digest('9') } : {}) });
    const identity = await signer.getPublicIdentity();
    const result = await createRealAgentDogfoodGraphHumanAcceptanceStateStoreAdapter({ stateStore, plan: adapterPlan, network_id, plan_id: handoff.plan_id, plan_revision: handoff.plan_revision, human_id: 'human-1', identity, handoff, source_phase: phase('source_execution', ['source_execution'], '5', 'agent-node', 'agent-1'), scope_phase: phase('scope_observation', ['source_execution', 'scope_observation'], '6', 'coordinator', 'coordinator-1'), verification_phase: phase('independent_verification', ['source_execution', 'scope_observation', 'independent_verification'], '7', 'trusted-runner', 'verifier-1'), evidence_store: evidenceStore })();
    assert.equal(result.status, 'passed', JSON.stringify(result));
    assert.equal(result.record.phase, 'human_acceptance');
  } finally { await stateStore.close(); await rm(root, { recursive: true, force: true }); }
});
