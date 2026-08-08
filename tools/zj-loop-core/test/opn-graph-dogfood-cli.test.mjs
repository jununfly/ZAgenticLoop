import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createContentAddressedEvidenceStore } from '../dist/content-addressed-evidence-store.js';
import { createOpnArtifactStore } from '../dist/opn-artifact-store.js';
import { createOpnReadOnlyGraphVerificationResult } from '../dist/opn-readonly-graph-verification.js';
import { createTransportEnvelope } from '../dist/transport-contract.js';
import { createRealAgentDogfoodGraphPlan } from '../dist/real-agent-dogfood-graph-orchestrator.js';
import { createRealAgentDogfoodGraphPhaseRecord, appendRealAgentDogfoodGraphPhaseRecord } from '../dist/real-agent-dogfood-graph-state.js';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';
import { runOpnGraphDogfoodScopeObservation, runOpnGraphDogfoodVerification } from '../dist/opn-graph-dogfood-cli.js';

const digest = (letter) => `sha256:${letter.repeat(64)}`;

test('OPN Graph dogfood CLI appends only the verified independent-verification phase by CAS', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-opn-graph-dogfood-cli-'));
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  const artifactStore = createOpnArtifactStore({ root: path.join(root, 'artifacts') });
  const evidenceStore = await createContentAddressedEvidenceStore({ root: path.join(root, 'evidence') });
  const plan = createRealAgentDogfoodGraphPlan({ dogfood_id: 'dogfood-cli', execution_id: 'execution-cli', attempt: 1, goal: 'dogfood CLI', repo_root: '/repo', baseline_commit: 'a'.repeat(40), target_worktree: '/tmp/target', source_worktree: '/tmp/source', verifier_worktree: '/tmp/verifier', evidence_store: '/tmp/evidence', allowed_files: ['README.md'], execution_mode: 'write-enabled', network_policy: 'network-allowed' });
  const networkId = 'network-cli';
  const sourcePhase = createRealAgentDogfoodGraphPhaseRecord({ plan, network_id: networkId, phase: 'source_execution', status: 'passed', completed_phases: ['source_execution'], reason: 'passed', actor_kind: 'agent-node', actor_identity: 'Agent1', evidence_digest: digest('1'), evidence_refs: [digest('1')], execution_binding_digest: digest('2'), worker_lease_digest: digest('3') });
  const scopePhase = createRealAgentDogfoodGraphPhaseRecord({ plan, network_id: networkId, phase: 'scope_observation', status: 'passed', completed_phases: ['source_execution', 'scope_observation'], reason: 'passed', actor_kind: 'coordinator', actor_identity: 'Coordinator', evidence_digest: digest('4'), evidence_refs: [digest('4')] });
  try {
    await stateStore.createNetwork({ network_id: networkId, owner_id: 'human-1' });
    await appendRealAgentDogfoodGraphPhaseRecord({ stateStore, plan, network_id: networkId, record: sourcePhase, expected_revision: 1 });
    await appendRealAgentDogfoodGraphPhaseRecord({ stateStore, plan, network_id: networkId, record: scopePhase, expected_revision: 2 });
    const sourceBytes = Buffer.from(JSON.stringify({ schema: 'zj-loop.opn_read_only_graph_source_evidence.v1', graph_id: plan.dogfood_id, plan_digest: plan.plan_digest, task_id: plan.execution_id, node_id: 'Agent1', snapshot_digest: digest('5'), findings: 'findings' }));
    const source = await artifactStore.put({ bytes: sourceBytes, file_name: 'source.json', media_type: 'application/json' });
    const verification = createOpnReadOnlyGraphVerificationResult({ graph_id: plan.dogfood_id, network_id: networkId, plan_id: plan.dogfood_id, plan_revision: 1, task_id: plan.execution_id, plan_digest: plan.plan_digest, source_evidence_ref: source.metadata.artifact_id, verification_evidence_ref: digest('6'), verifier_node_id: 'Agent2', status: 'passed' });
    const resultArtifact = await artifactStore.put({ bytes: Buffer.from(JSON.stringify(verification)), file_name: 'result.json', media_type: 'application/json' });
    const response = createTransportEnvelope({ message_id: 'result-cli', network_id: networkId, event_id: `${plan.dogfood_id}:verification`, plan_id: plan.dogfood_id, plan_revision: 1, task_id: plan.execution_id, from_node_id: 'Agent2', target_node_id: 'Coordinator', notification_kind: 'graph.verification.result', state: 'available', artifact_refs: [{ artifact_id: resultArtifact.metadata.artifact_id, content_sha256: resultArtifact.metadata.content_sha256, kind: 'artifact' }], created_at: '2026-08-08T00:00:00.000Z', expires_at: '2099-01-01T00:00:00.000Z' });
    const transport = { async openSession() { return { session_id: 'session-cli' }; }, async send() { return { status: 'accepted', message_id: 'request-cli', envelope_digest: digest('7'), side_effects_executed: false }; }, async receive() { return response; }, async acknowledge() { return { status: 'accepted', message_id: response.message_id, envelope_digest: response.envelope_digest, side_effects_executed: false }; }, async closeSession() {} };
    const result = await runOpnGraphDogfoodVerification({ plan, network_id: networkId, coordinator_id: 'Coordinator', verifier_id: 'Agent2', source_bytes: sourceBytes, state_store: stateStore, artifact_store: artifactStore, evidence_store: evidenceStore, transport });
    assert.equal(result.status, 'passed');
    assert.equal(result.phase, 'independent_verification');
    assert.equal(result.state_revision, 4);
    const events = await stateStore.readEvents({ network_id: networkId, aggregate_type: 'real-agent-dogfood-graph', aggregate_id: plan.dogfood_id });
    assert.deepEqual(events.events.map((event) => event.payload.phase), ['source_execution', 'scope_observation', 'independent_verification']);
  } finally { await stateStore.close(); await rm(root, { recursive: true, force: true }); }
});

test('OPN Graph dogfood scope continuation appends scope_observation after source_execution', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-opn-graph-scope-cli-'));
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  const evidenceStore = await createContentAddressedEvidenceStore({ root: path.join(root, 'evidence') });
  const plan = createRealAgentDogfoodGraphPlan({ dogfood_id: 'dogfood-scope-cli', execution_id: 'execution-scope-cli', attempt: 1, goal: 'scope CLI', repo_root: '/repo', baseline_commit: 'a'.repeat(40), target_worktree: '/tmp/target', source_worktree: '/tmp/source', verifier_worktree: '/tmp/verifier', evidence_store: '/tmp/evidence', allowed_files: ['README.md'], execution_mode: 'write-enabled', network_policy: 'network-allowed' });
  const source = createRealAgentDogfoodGraphPhaseRecord({ plan, network_id: 'network-scope-cli', phase: 'source_execution', status: 'passed', completed_phases: ['source_execution'], reason: 'passed', actor_kind: 'agent-node', actor_identity: 'Agent1', evidence_digest: digest('1'), evidence_refs: [digest('1')], execution_binding_digest: digest('2'), worker_lease_digest: digest('3') });
  try {
    await stateStore.createNetwork({ network_id: 'network-scope-cli', owner_id: 'human-1' });
    await appendRealAgentDogfoodGraphPhaseRecord({ stateStore, plan, network_id: 'network-scope-cli', record: source, expected_revision: 1 });
    const result = await runOpnGraphDogfoodScopeObservation({ plan, network_id: 'network-scope-cli', coordinator_id: 'Coordinator', state_store: stateStore, evidence_store: evidenceStore, observe: async () => ({ observation_digest: digest('4'), scope: { status: 'valid' } }) });
    assert.equal(result.status, 'passed');
    assert.equal(result.phase, 'scope_observation');
    assert.equal(result.state_revision, 3);
  } finally { await stateStore.close(); await rm(root, { recursive: true, force: true }); }
});
