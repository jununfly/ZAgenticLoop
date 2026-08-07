import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createInMemoryHumanSigner } from '../dist/human-signer.js';
import { createHumanActionDecision, createHumanActionRequest } from '../dist/human-action.js';
import { createOpnArtifactStore } from '../dist/opn-artifact-store.js';
import { projectOpnHumanActions } from '../dist/human-action-opn-projection.js';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';
import { createTransportEnvelope } from '../dist/transport-contract.js';

const digest = (digit) => `sha256:${digit.repeat(64)}`;
const requestInput = { network_id: 'network-1', request_id: 'action-1', action_type: 'agent.result.review', reason: 'Review remote result.', context: { task_id: 'task-1' }, evidence_refs: [{ artifact_id: digest('a'), kind: 'artifact' }], requester_node_id: 'agent-1', created_at: '2026-08-07T10:00:00.000Z', expires_at: '2026-08-07T11:00:00.000Z' };

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-human-action-'));
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  await stateStore.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2026-08-07T09:00:00.000Z' });
  return { root, stateStore, artifactStore: createOpnArtifactStore({ root: path.join(root, 'artifacts') }) };
}

async function offer({ stateStore, artifactStore }, envelope, content, eventId) {
  const artifact = await artifactStore.put({ bytes: Buffer.from(JSON.stringify(content)), file_name: `${content.schema}.json`, media_type: 'application/json' });
  const withArtifact = createTransportEnvelope({ ...envelope, artifact_refs: [{ artifact_id: artifact.metadata.artifact_id, content_sha256: artifact.metadata.content_sha256, kind: 'artifact' }] });
  const revision = await stateStore.getRevision('network-1');
  await stateStore.appendEvent({ network_id: 'network-1', expected_revision: revision, now: envelope.created_at, event: { event_id: eventId, aggregate_type: 'opn-inbox', aggregate_id: withArtifact.message_id, event_type: 'opn.inbox.message.received', occurred_at: withArtifact.created_at, payload: { schema: 'zj-loop.opn_inbox_event.v1', message_id: withArtifact.message_id, envelope_digest: withArtifact.envelope_digest, envelope: withArtifact } } });
}

async function offerTransport({ stateStore, artifactStore }, envelope, content, eventId) {
  const artifact = await artifactStore.put({ bytes: Buffer.from(JSON.stringify(content)), file_name: `${content.schema}.json`, media_type: 'application/json' });
  const withArtifact = createTransportEnvelope({ ...envelope, artifact_refs: [{ artifact_id: artifact.metadata.artifact_id, content_sha256: artifact.metadata.content_sha256, kind: 'artifact' }] });
  const revision = await stateStore.getRevision('network-1');
  await stateStore.appendEvent({ network_id: 'network-1', expected_revision: revision, now: envelope.created_at, event: { event_id: eventId, aggregate_type: 'opn-transport-message', aggregate_id: withArtifact.message_id, event_type: 'opn.transport.message.offered', occurred_at: withArtifact.created_at, payload: { schema: 'zj-loop.opn_transport_http.v1', envelope: withArtifact } } });
}

test('OPN Human action projection reads request and signed decision artifacts as read-only state', async () => {
  const fixtureValue = await fixture();
  try {
    const signer = createInMemoryHumanSigner({ human_id: 'human-1' });
    const request = createHumanActionRequest(requestInput);
    await offer(fixtureValue, { message_id: 'request-message', network_id: 'network-1', event_id: 'event-request', plan_id: 'plan-1', plan_revision: 1, task_id: 'task-1', from_node_id: 'agent-1', target_node_id: 'agent-2', notification_kind: 'human.action.request', state: 'available', created_at: request.created_at, expires_at: request.expires_at }, request, 'inbox-request');
    let projection = await projectOpnHumanActions({ ...fixtureValue, network_id: 'network-1', node_id: 'agent-2', now: '2026-08-07T10:05:00.000Z' });
    assert.equal(projection.requests[0].status, 'pending');
    assert.equal(projection.requests[0].reason, request.reason);
    const decision = await createHumanActionDecision({ signer, request, decision: 'approved', reason: 'Reviewed evidence.', decided_at: '2026-08-07T10:06:00.000Z' });
    await offer(fixtureValue, { message_id: 'decision-message', network_id: 'network-1', event_id: 'event-decision', plan_id: 'plan-1', plan_revision: 1, task_id: 'task-1', from_node_id: 'endpoint:mac', target_node_id: 'agent-2', notification_kind: 'human.action.decision', state: 'available', created_at: decision.decided_at, expires_at: request.expires_at }, decision, 'inbox-decision');
    projection = await projectOpnHumanActions({ ...fixtureValue, network_id: 'network-1', node_id: 'agent-2', now: '2026-08-07T10:07:00.000Z' });
    assert.equal(projection.requests[0].status, 'approved');
    assert.equal(projection.requests[0].decision.human_id, 'human-1');
    assert.equal(projection.side_effects_executed, false);
    await offerTransport(fixtureValue, { message_id: 'offered-request', network_id: 'network-1', event_id: 'event-offered-request', plan_id: 'plan-1', plan_revision: 1, task_id: 'task-1', from_node_id: 'agent-1', target_node_id: 'agent-2', notification_kind: 'human.action.request', state: 'available', created_at: request.created_at, expires_at: request.expires_at }, request, 'offered-request-fact');
    await offerTransport(fixtureValue, { message_id: 'offered-decision', network_id: 'network-1', event_id: 'event-offered-decision', plan_id: 'plan-1', plan_revision: 1, task_id: 'task-1', from_node_id: 'endpoint:mac', target_node_id: 'agent-2', notification_kind: 'human.action.decision', state: 'available', created_at: decision.decided_at, expires_at: request.expires_at }, decision, 'offered-decision-fact');
    const centerProjection = await projectOpnHumanActions({ ...fixtureValue, network_id: 'network-1', now: '2026-08-07T10:07:00.000Z' });
    assert.equal(centerProjection.requests[0].status, 'approved');
  } finally { await fixtureValue.stateStore.close(); await rm(fixtureValue.root, { recursive: true, force: true }); }
});
