import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createOpnArtifactStore } from '../dist/opn-artifact-store.js';
import { createContentAddressedEvidenceStore } from '../dist/content-addressed-evidence-store.js';
import { createTransportEnvelope } from '../dist/transport-contract.js';
import { createOpnReadOnlyGraphVerificationResult } from '../dist/opn-readonly-graph-verification.js';
import { createRealAgentDogfoodGraphPlan } from '../dist/real-agent-dogfood-graph-orchestrator.js';
import { createRealAgentDogfoodGraphPhaseRecord } from '../dist/real-agent-dogfood-graph-state.js';
import { createRealAgentDogfoodGraphOpnIndependentVerificationAdapter } from '../dist/real-agent-dogfood-graph-opn-independent-verification-adapter.js';

const digest = (letter) => `sha256:${letter.repeat(64)}`;
const plan = createRealAgentDogfoodGraphPlan({ dogfood_id: 'dogfood-opn-adapter', execution_id: 'execution-opn-adapter', attempt: 1, goal: 'route independent verification over OPN', repo_root: '/repo', baseline_commit: 'a'.repeat(40), target_worktree: '/tmp/target', source_worktree: '/tmp/source', verifier_worktree: '/tmp/verifier', evidence_store: '/tmp/evidence', allowed_files: ['README.md'], execution_mode: 'write-enabled', network_policy: 'network-allowed' });
const sourcePhase = createRealAgentDogfoodGraphPhaseRecord({ plan, network_id: 'network-opn-adapter', phase: 'source_execution', status: 'passed', completed_phases: ['source_execution'], reason: 'source-passed', actor_kind: 'agent-node', actor_identity: 'Agent1', evidence_digest: digest('1'), evidence_refs: [digest('1')], execution_binding_digest: digest('2'), worker_lease_digest: digest('3') });
const scopePhase = createRealAgentDogfoodGraphPhaseRecord({ plan, network_id: 'network-opn-adapter', phase: 'scope_observation', status: 'passed', completed_phases: ['source_execution', 'scope_observation'], reason: 'scope-passed', actor_kind: 'coordinator', actor_identity: 'Coordinator', evidence_digest: digest('4'), evidence_refs: [digest('4')] });

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-opn-graph-adapter-'));
  const artifactStore = createOpnArtifactStore({ root: path.join(root, 'opn-artifacts') });
  const evidenceStore = await createContentAddressedEvidenceStore({ root: path.join(root, 'evidence') });
  const sourceBytes = Buffer.from(JSON.stringify({ schema: 'zj-loop.opn_read_only_graph_source_evidence.v1', graph_id: plan.dogfood_id, plan_digest: plan.plan_digest, task_id: plan.execution_id, node_id: 'Agent1', snapshot_digest: digest('6'), findings: 'source findings' }));
  const source = await artifactStore.put({ bytes: sourceBytes, file_name: 'source.json', media_type: 'application/json' });
  const result = createOpnReadOnlyGraphVerificationResult({ graph_id: plan.dogfood_id, network_id: 'network-opn-adapter', plan_id: plan.dogfood_id, plan_revision: plan.attempt, task_id: plan.execution_id, plan_digest: plan.plan_digest, source_evidence_ref: source.metadata.artifact_id, verification_evidence_ref: digest('7'), verifier_node_id: 'Agent2', status: 'passed' });
  const resultArtifact = await artifactStore.put({ bytes: Buffer.from(JSON.stringify(result)), file_name: 'result.json', media_type: 'application/json' });
  const response = createTransportEnvelope({ message_id: 'verification-result-1', network_id: 'network-opn-adapter', event_id: `${plan.dogfood_id}:verification`, plan_id: plan.dogfood_id, plan_revision: plan.attempt, task_id: plan.execution_id, from_node_id: 'Agent2', target_node_id: 'Coordinator', notification_kind: 'graph.verification.result', state: 'available', artifact_refs: [{ artifact_id: resultArtifact.metadata.artifact_id, content_sha256: resultArtifact.metadata.content_sha256, kind: 'artifact' }], created_at: '2026-08-08T00:00:00.000Z', expires_at: '2099-01-01T00:00:00.000Z' });
  const sent = [];
  const acknowledged = [];
  const transport = { async openSession() { return { session_id: 'session-1' }; }, async send(input) { sent.push(input); return { status: 'accepted', message_id: input.envelope.message_id, envelope_digest: input.envelope.envelope_digest, side_effects_executed: false }; }, async receive() { return response; }, async acknowledge(input) { acknowledged.push(input); return { status: 'accepted', message_id: response.message_id, envelope_digest: response.envelope_digest, side_effects_executed: false }; }, async closeSession() {} };
  return { root, artifactStore, evidenceStore, source, sourceBytes, response, sent, acknowledged, transport };
}

test('OPN independent verification adapter publishes a bound request and returns a phase record', async () => {
  const value = await fixture();
  try {
    const result = await createRealAgentDogfoodGraphOpnIndependentVerificationAdapter({ plan, network_id: 'network-opn-adapter', coordinator_id: 'Coordinator', verifier_id: 'Agent2', transport: value.transport, artifact_store: value.artifactStore, evidence_store: value.evidenceStore, source_phase: sourcePhase, scope_phase: scopePhase, source_evidence: async () => value.sourceBytes })();
    assert.equal(result.status, 'passed', result.reason);
    assert.equal(result.record.phase, 'independent_verification');
    assert.equal(result.record.actor_kind, 'trusted-runner');
    assert.equal(value.sent.length, 1);
    assert.equal(value.sent[0].envelope.notification_kind, 'graph.verification.request');
    assert.equal(value.sent[0].envelope.target_node_id, 'Agent2');
    assert.equal(value.acknowledged.length, 1);
  } finally { await rm(value.root, { recursive: true, force: true }); }
});

test('OPN independent verification adapter fails closed on result scope drift', async () => {
  const value = await fixture();
  try {
    value.transport.receive = async () => ({ ...value.response, message_id: 'drift', plan_id: 'other-plan' });
    const result = await createRealAgentDogfoodGraphOpnIndependentVerificationAdapter({ plan, network_id: 'network-opn-adapter', coordinator_id: 'Coordinator', verifier_id: 'Agent2', transport: value.transport, artifact_store: value.artifactStore, evidence_store: value.evidenceStore, source_phase: sourcePhase, scope_phase: scopePhase, source_evidence: async () => value.sourceBytes })();
    assert.equal(result.status, 'blocked');
    assert.equal(result.reason, 'opn-independent-verification-result-scope-mismatch');
    assert.equal(value.acknowledged.length, 0);
  } finally { await rm(value.root, { recursive: true, force: true }); }
});

test('OPN independent verification adapter returns outcome-uncertain when no result arrives', async () => {
  const value = await fixture();
  try {
    value.transport.receive = async () => null;
    const result = await createRealAgentDogfoodGraphOpnIndependentVerificationAdapter({ plan, network_id: 'network-opn-adapter', coordinator_id: 'Coordinator', verifier_id: 'Agent2', transport: value.transport, artifact_store: value.artifactStore, evidence_store: value.evidenceStore, source_phase: sourcePhase, scope_phase: scopePhase, source_evidence: async () => value.sourceBytes, poll_attempts: 1 })();
    assert.equal(result.status, 'outcome-uncertain');
    assert.equal(result.reason, 'opn-independent-verification-result-unavailable');
  } finally { await rm(value.root, { recursive: true, force: true }); }
});
