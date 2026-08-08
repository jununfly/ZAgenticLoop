import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createOpnArtifactStore } from '../dist/opn-artifact-store.js';
import { processOpnReadOnlyGraphVerificationRequest } from '../dist/opn-readonly-graph-verifier.js';
import { createTransportEnvelope } from '../dist/transport-contract.js';

const digest = (digit) => `sha256:${digit.repeat(64)}`;

test('Agent2 verifier downloads source evidence, runs read-only provider, and sends a bound result', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-opn-graph-verifier-'));
  try {
    const artifactStore = createOpnArtifactStore({ root });
    const source = await artifactStore.put({
      bytes: Buffer.from(JSON.stringify({ schema: 'zj-loop.opn_read_only_graph_source_evidence.v1', graph_id: 'graph-1', plan_digest: digest('a'), task_id: 'task-1', node_id: 'Agent1', snapshot_digest: digest('b'), findings: 'source findings' }), 'utf8'),
      file_name: 'source.json', media_type: 'application/json',
    });
    const envelope = createTransportEnvelope({
      message_id: 'verification-request-1', network_id: 'network-1', event_id: 'graph-1:verification', plan_id: 'plan-1', plan_revision: 1,
      task_id: 'task-1', from_node_id: 'Coordinator', target_node_id: 'Agent2', notification_kind: 'graph.verification.request', state: 'available',
      artifact_refs: [{ artifact_id: source.metadata.artifact_id, content_sha256: source.metadata.content_sha256, kind: 'artifact' }], created_at: '2026-08-08T00:00:00.000Z', expires_at: '2099-01-01T00:00:00.000Z',
    });
    const sent = [];
    let acknowledged;
    let providerRequest;
    const result = await processOpnReadOnlyGraphVerificationRequest({
      envelope, verifier_node_id: 'Agent2', cwd: '/tmp', session_id: 'session-1',
      artifact_store: artifactStore,
      downloadArtifact: async (artifact_id) => (await artifactStore.read(artifact_id)).bytes,
      provider: { async run(input) { providerRequest = input; return { status: 'completed', success: true, stdout: 'independent findings', stderr: '' }; } },
      transport: { async send(input) { sent.push(input.envelope); return { status: 'accepted', message_id: input.envelope.message_id, envelope_digest: input.envelope.envelope_digest, side_effects_executed: false }; }, async acknowledge(input) { acknowledged = input; return { status: 'accepted', message_id: input.message_id, envelope_digest: input.envelope_digest, side_effects_executed: false }; } },
    });
    assert.equal(result.status, 'processed');
    assert.equal(result.verification_result.status, 'passed');
    assert.equal(result.verification_result.source_evidence_ref, source.metadata.artifact_id);
    assert.equal(providerRequest.mode, 'read-only');
    assert.deepEqual(providerRequest.env_allowlist, []);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].notification_kind, 'graph.verification.result');
    assert.equal(sent[0].target_node_id, 'Coordinator');
    assert.equal(sent[0].artifact_refs.length, 2);
    assert.deepEqual(acknowledged, { session_id: 'session-1', message_id: envelope.message_id, envelope_digest: envelope.envelope_digest });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('Agent2 verifier rejects a request addressed to another node without provider execution', async () => {
  const envelope = createTransportEnvelope({
    message_id: 'verification-request-2', network_id: 'network-1', event_id: 'graph-1:verification', plan_id: 'plan-1', plan_revision: 1,
    task_id: 'task-1', from_node_id: 'Coordinator', target_node_id: 'Agent3', notification_kind: 'graph.verification.request', state: 'available',
    artifact_refs: [{ artifact_id: digest('a'), content_sha256: digest('a'), kind: 'artifact' }], created_at: '2026-08-08T00:00:00.000Z', expires_at: '2099-01-01T00:00:00.000Z',
  });
  let invoked = false;
  const result = await processOpnReadOnlyGraphVerificationRequest({ envelope, verifier_node_id: 'Agent2', cwd: '/tmp', session_id: 'session-1', artifact_store: createOpnArtifactStore({ root: await mkdtemp(path.join(os.tmpdir(), 'zj-loop-opn-graph-verifier-invalid-')) }), downloadArtifact: async () => Buffer.alloc(0), provider: { async run() { invoked = true; throw new Error('must not run'); } }, transport: { async send() { throw new Error('must not send'); }, async acknowledge() { throw new Error('must not ack'); } } });
  assert.deepEqual(result, { status: 'blocked', message_id: envelope.message_id, reason: 'opn-read-only-graph-verification-request-invalid', side_effects_executed: false });
  assert.equal(invoked, false);
});
