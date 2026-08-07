import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createOpnArtifactStore } from '../dist/opn-artifact-store.js';
import { receiveOpnReadOnlyGraphVerificationResult } from '../dist/opn-readonly-graph-coordinator.js';
import { createOpnReadOnlyGraphVerificationResult } from '../dist/opn-readonly-graph-verification.js';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';
import { createTransportEnvelope } from '../dist/transport-contract.js';

const digest = (digit) => `sha256:${digit.repeat(64)}`;

test('Mac Coordinator persists a bound Graph verification result before acknowledging it', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-opn-graph-coordinator-'));
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  try {
    await stateStore.createNetwork({ network_id: 'network-1', owner_id: 'human-1' });
    const artifactStore = createOpnArtifactStore({ root: path.join(root, 'artifacts') });
    const verification = createOpnReadOnlyGraphVerificationResult({ graph_id: 'graph-1', network_id: 'network-1', plan_id: 'plan-1', plan_revision: 1, task_id: 'task-1', plan_digest: digest('a'), source_evidence_ref: digest('b'), verification_evidence_ref: digest('c'), verifier_node_id: 'Agent2', status: 'passed' });
    const resultArtifact = await artifactStore.put({ bytes: Buffer.from(JSON.stringify(verification), 'utf8'), file_name: 'result.json', media_type: 'application/json' });
    const envelope = createTransportEnvelope({ message_id: 'result-message-1', network_id: 'network-1', event_id: 'graph-1:verification', plan_id: 'plan-1', plan_revision: 1, task_id: 'task-1', from_node_id: 'Agent2', target_node_id: 'Coordinator', notification_kind: 'graph.verification.result', state: 'available', artifact_refs: [{ artifact_id: resultArtifact.metadata.artifact_id, content_sha256: resultArtifact.metadata.content_sha256, kind: 'artifact' }], created_at: '2026-08-08T00:00:00.000Z', expires_at: '2026-08-08T01:00:00.000Z' });
    let acked = false;
    const transport = { async receive() { return envelope; }, async acknowledge(input) { acked = input.message_id === envelope.message_id; return { status: 'accepted', message_id: input.message_id, envelope_digest: input.envelope_digest, side_effects_executed: false }; } };
    const input = { transport, session_id: 'session-1', coordinator_id: 'Coordinator', expected: { graph_id: 'graph-1', network_id: 'network-1', plan_id: 'plan-1', plan_revision: 1, task_id: 'task-1', plan_digest: digest('a'), source_evidence_ref: digest('b'), verifier_node_id: 'Agent2' }, state_store: stateStore, artifact_store: artifactStore, downloadArtifact: async (artifact_id) => (await artifactStore.read(artifact_id)).bytes };
    const result = await receiveOpnReadOnlyGraphVerificationResult(input);
    assert.equal(result.status, 'recorded');
    assert.equal(result.result.result_digest, verification.result_digest);
    assert.equal(acked, true);
    const events = await stateStore.readEvents({ network_id: 'network-1', aggregate_type: 'opn-readonly-graph', aggregate_id: 'task-1' });
    assert.equal(events.events.at(-1).event_type, 'graph.verification.result.received');
    assert.equal(events.events.at(-1).payload.result_artifact_ref, resultArtifact.metadata.artifact_id);
    const duplicate = await receiveOpnReadOnlyGraphVerificationResult(input);
    assert.equal(duplicate.status, 'duplicate');
    assert.equal((await stateStore.readEvents({ network_id: 'network-1', aggregate_type: 'opn-readonly-graph', aggregate_id: 'task-1' })).events.length, 1);
  } finally { await stateStore.close(); await rm(root, { recursive: true, force: true }); }
});

test('Mac Coordinator blocks verification result scope drift without acknowledging it', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-opn-graph-coordinator-drift-'));
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  try {
    await stateStore.createNetwork({ network_id: 'network-1', owner_id: 'human-1' });
    const artifactStore = createOpnArtifactStore({ root: path.join(root, 'artifacts') });
    const verification = createOpnReadOnlyGraphVerificationResult({ graph_id: 'graph-other', network_id: 'network-1', plan_id: 'plan-1', plan_revision: 1, task_id: 'task-1', plan_digest: digest('a'), source_evidence_ref: digest('b'), verification_evidence_ref: digest('c'), verifier_node_id: 'Agent2', status: 'passed' });
    const resultArtifact = await artifactStore.put({ bytes: Buffer.from(JSON.stringify(verification), 'utf8'), file_name: 'result.json', media_type: 'application/json' });
    const envelope = createTransportEnvelope({ message_id: 'result-message-2', network_id: 'network-1', event_id: 'graph-other:verification', plan_id: 'plan-1', plan_revision: 1, task_id: 'task-1', from_node_id: 'Agent2', target_node_id: 'Coordinator', notification_kind: 'graph.verification.result', state: 'available', artifact_refs: [{ artifact_id: resultArtifact.metadata.artifact_id, content_sha256: resultArtifact.metadata.content_sha256, kind: 'artifact' }], created_at: '2026-08-08T00:00:00.000Z', expires_at: '2026-08-08T01:00:00.000Z' });
    let acked = false;
    const result = await receiveOpnReadOnlyGraphVerificationResult({ transport: { async receive() { return envelope; }, async acknowledge() { acked = true; throw new Error('must not ack'); } }, session_id: 'session-1', coordinator_id: 'Coordinator', expected: { graph_id: 'graph-1', network_id: 'network-1', plan_id: 'plan-1', plan_revision: 1, task_id: 'task-1', plan_digest: digest('a'), source_evidence_ref: digest('b'), verifier_node_id: 'Agent2' }, state_store: stateStore, artifact_store: artifactStore, downloadArtifact: async (artifact_id) => (await artifactStore.read(artifact_id)).bytes });
    assert.equal(result.status, 'blocked');
    assert.equal(result.reason, 'opn-read-only-graph-verification-result-scope-mismatch');
    assert.equal(acked, false);
  } finally { await stateStore.close(); await rm(root, { recursive: true, force: true }); }
});
