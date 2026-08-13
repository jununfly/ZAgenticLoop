import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';
import { createOpnArtifactStore } from '../dist/opn-artifact-store.js';
import { createTransportEnvelope } from '../dist/transport-contract.js';
import { createOutboundTaskApproval, recordOutboundTaskApproval } from '../dist/opn-outbound-task-approval.js';
import { projectOpnAgentTaskChains } from '../dist/opn-agent-task-read-model.js';

const digest = (value) => `sha256:${value.repeat(64)}`;
const makeEnvelope = ({ message_id, notification_kind, from_node_id, target_node_id, artifact_refs, task_id = 'task-chain-1' }) => createTransportEnvelope({ message_id, network_id: 'network-1', event_id: `${message_id}-event`, plan_id: 'plan-1', plan_revision: 1, task_id, from_node_id, target_node_id, notification_kind, state: 'available', artifact_refs, created_at: '2099-08-13T00:00:00.000Z', expires_at: '2099-08-13T01:00:00.000Z' });

test('agent task chain read model joins approval, result and evidence', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-agent-task-chain-'));
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  const artifactStore = createOpnArtifactStore({ root: path.join(root, 'artifacts') });
  try {
    await stateStore.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2099-08-13T00:00:00.000Z' });
    const taskArtifact = await artifactStore.put({ bytes: Buffer.from('{"task_id":"task-chain-1"}'), file_name: 'task.json', media_type: 'application/json' });
    const task = makeEnvelope({ message_id: 'task-chain-message', notification_kind: 'agent.task', from_node_id: 'endpoint:network-1', target_node_id: 'agent-1', artifact_refs: [{ artifact_id: taskArtifact.metadata.artifact_id, content_sha256: taskArtifact.metadata.content_sha256, kind: 'artifact' }] });
    const approval = createOutboundTaskApproval({ network_id: 'network-1', envelope: task, task_artifact_id: taskArtifact.metadata.artifact_id, requested_at: '2099-08-13T00:00:00.000Z' });
    await recordOutboundTaskApproval({ stateStore, approval });
    const resultArtifact = await artifactStore.put({ bytes: Buffer.from(JSON.stringify({ schema: 'zj-loop.opn_agent_result.v1', execution: { status: 'evidence-recorded', evidence_refs: ['evidence-1'] } })), file_name: 'result.json', media_type: 'application/json' });
    const result = makeEnvelope({ message_id: 'agent-result:task-chain-message', notification_kind: 'agent.result', from_node_id: 'agent-1', target_node_id: 'endpoint:network-1', artifact_refs: [{ artifact_id: resultArtifact.metadata.artifact_id, content_sha256: resultArtifact.metadata.content_sha256, kind: 'artifact' }] });
    const revision = await stateStore.getRevision('network-1');
    await stateStore.appendEvent({ network_id: 'network-1', expected_revision: revision, event: { event_id: `offered:${result.message_id}`, aggregate_type: 'opn-transport-message', aggregate_id: result.message_id, event_type: 'opn.transport.message.offered', occurred_at: result.created_at, payload: { schema: 'zj-loop.opn_transport_http.v1', envelope: result } } });
    const model = await projectOpnAgentTaskChains({ stateStore, artifactStore, network_id: 'network-1', node_id: 'endpoint:network-1' });
    assert.equal(model.tasks.length, 1);
    assert.equal(model.tasks[0].approval.approval_id, approval.approval_id);
    assert.equal(model.tasks[0].result_message.message_id, result.message_id);
    assert.equal(model.tasks[0].status, 'succeeded');
    assert.deepEqual(model.tasks[0].evidence_refs, ['evidence-1']);
  } finally { await stateStore.close(); await rm(root, { recursive: true, force: true }); }
});
