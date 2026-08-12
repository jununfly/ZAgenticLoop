import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';
import { createOutboundTaskApproval, listOutboundTaskApprovals, recordOutboundTaskApproval, appendOutboundTaskApprovalDecision, appendOutboundTaskPublished } from '../dist/opn-outbound-task-approval.js';
import { createTransportEnvelope } from '../dist/transport-contract.js';

function envelope() {
  return createTransportEnvelope({ message_id: 'task-message-1', network_id: 'network-1', event_id: 'task-event-1', plan_id: 'opn-task', plan_revision: 1, task_id: 'task-1', from_node_id: 'endpoint:network-1', target_node_id: 'agent-1', notification_kind: 'agent.task', state: 'available', artifact_refs: [{ artifact_id: `sha256:${'a'.repeat(64)}`, content_sha256: `sha256:${'a'.repeat(64)}`, kind: 'artifact' }], created_at: '2099-08-12T00:00:00.000Z', expires_at: '2099-08-12T01:00:00.000Z' });
}

test('outbound task approval is pending until an explicit human decision and publishes once', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-outbound-approval-'));
  const store = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  try {
    await store.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2099-08-12T00:00:00.000Z' });
    const approval = createOutboundTaskApproval({ network_id: 'network-1', envelope: envelope(), requested_at: '2099-08-12T00:00:00.000Z' });
    assert.equal((await recordOutboundTaskApproval({ stateStore: store, approval })).status, 'recorded');
    assert.equal((await listOutboundTaskApprovals({ stateStore: store, network_id: 'network-1' }))[0].status, 'pending');
    const decided = await appendOutboundTaskApprovalDecision({ stateStore: store, approval, decision: 'approved', human_id: 'human-1', human_note: 'Target and bounded artifact reviewed.', decided_at: '2099-08-12T00:01:00.000Z' });
    assert.equal(decided.approval.status, 'approved');
    assert.equal((await appendOutboundTaskApprovalDecision({ stateStore: store, approval: decided.approval, decision: 'approved', human_id: 'human-1', human_note: 'Repeated click.', decided_at: '2099-08-12T00:01:02.000Z' })).status, 'duplicate');
    const published = await appendOutboundTaskPublished({ stateStore: store, approval: decided.approval, message_id: approval.envelope.message_id, published_at: '2099-08-12T00:01:01.000Z' });
    assert.equal(published.approval.status, 'published');
    assert.equal((await appendOutboundTaskPublished({ stateStore: store, approval: published.approval, message_id: approval.envelope.message_id })).status, 'duplicate');
  } finally { await store.close(); await rm(root, { recursive: true, force: true }); }
});

test('gateway-task-send creates an approval request instead of directly publishing', async () => {
  const source = await readFile(new URL('../src/opn-transport-cli.ts', import.meta.url), 'utf8');
  const taskBlock = source.slice(source.indexOf("if (command === 'gateway-task-send')"), source.indexOf("if (command === 'gateway-cancel')"));
  assert.match(taskBlock, /\/v1\/owner\/outbound-task-approvals/);
  assert.doesNotMatch(taskBlock, /pathname: '\/v1\/owner\/messages'/);
  assert.match(taskBlock, /pending-approval/);
});
