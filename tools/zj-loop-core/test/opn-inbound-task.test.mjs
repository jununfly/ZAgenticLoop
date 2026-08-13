import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';
import { appendInboundTaskDecision, appendInboundTaskLifecycle, createInboundTask, expireInboundTasks, listInboundTasks, persistInboundTask, recoverExpiredInboundTasks } from '../dist/opn-inbound-task.js';
import { createTransportEnvelope } from '../dist/transport-contract.js';

const digest = (value) => `sha256:${value.repeat(64)}`;
function envelope() {
  return createTransportEnvelope({ message_id: 'inbound-message-1', network_id: 'network-1', event_id: 'inbound-event-1', plan_id: 'opn-task', plan_revision: 1, task_id: 'inbound-task-1', from_node_id: 'endpoint:network-1', target_node_id: 'agent-1', notification_kind: 'agent.task', state: 'available', artifact_refs: [{ artifact_id: digest('a'), content_sha256: digest('a'), kind: 'artifact' }], created_at: '2099-08-13T00:00:00.000Z', expires_at: '2099-08-13T01:00:00.000Z' });
}

test('inbound task decision is deterministic, auditable, and idempotent', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-inbound-task-'));
  const store = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  try {
    await store.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2099-08-13T00:00:00.000Z' });
    const inbound = createInboundTask({ network_id: 'network-1', envelope: envelope(), received_at: '2099-08-13T00:00:01.000Z' });
    assert.equal((await persistInboundTask({ stateStore: store, inbound })).status, 'recorded');
    await assert.rejects(() => appendInboundTaskDecision({ stateStore: store, inbound, decision: 'approved', human_id: 'human-1', human_note: 'approved' }), /selected-agent-required/);
    const approved = await appendInboundTaskDecision({ stateStore: store, inbound, decision: 'approved', human_id: 'human-1', human_note: 'Target Agent selected after review.', selected_agent_id: 'agent-1', decided_at: '2099-08-13T00:00:02.000Z' });
    assert.equal(approved.inbound.status, 'admitted');
    assert.equal(approved.inbound.selected_agent_id, 'agent-1');
    assert.equal((await appendInboundTaskDecision({ stateStore: store, inbound: approved.inbound, decision: 'approved', human_id: 'human-1', human_note: 'Repeated click.', selected_agent_id: 'agent-1' })).status, 'duplicate');
    assert.equal((await listInboundTasks({ stateStore: store, network_id: 'network-1', now: '2099-08-13T00:00:03.000Z' }))[0].status, 'admitted');
    assert.equal((await store.readEvents({ network_id: 'network-1', aggregate_type: 'opn-inbound-task' })).events.length, 2);
  } finally { await store.close(); await rm(root, { recursive: true, force: true }); }
});

test('expired inbound task cannot be approved', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-inbound-task-expired-'));
  const store = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  try {
    await store.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2099-08-13T00:00:00.000Z' });
    const value = envelope();
    const expired = createInboundTask({ network_id: 'network-1', envelope: createTransportEnvelope({ message_id: 'expired-message-1', network_id: value.network_id, event_id: 'expired-event-1', plan_id: value.plan_id, plan_revision: value.plan_revision, task_id: value.task_id, from_node_id: value.from_node_id, target_node_id: value.target_node_id, notification_kind: value.notification_kind, state: value.state, artifact_refs: value.artifact_refs, created_at: value.created_at, expires_at: '2099-08-13T01:00:00.000Z' }), received_at: '2099-08-13T00:00:01.000Z' });
    await persistInboundTask({ stateStore: store, inbound: expired });
    await assert.rejects(() => appendInboundTaskDecision({ stateStore: store, inbound: expired, decision: 'approved', human_id: 'human-1', human_note: 'too late', selected_agent_id: 'agent-1', decided_at: '2099-08-13T02:00:00.000Z' }), /state-conflict/);
  } finally { await store.close(); await rm(root, { recursive: true, force: true }); }
});

test('inbound expiry is recorded as an append-only fact and is idempotent', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-inbound-task-expiry-fact-'));
  const store = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  try {
    await store.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2099-08-13T00:00:00.000Z' });
    const value = createInboundTask({ network_id: 'network-1', envelope: createTransportEnvelope({ message_id: 'expiry-fact-message', network_id: 'network-1', event_id: 'expiry-fact-event', plan_id: 'opn-task', plan_revision: 1, task_id: 'expiry-fact-task', from_node_id: 'center', target_node_id: 'agent-1', notification_kind: 'agent.task', state: 'available', artifact_refs: [{ artifact_id: digest('a'), content_sha256: digest('a'), kind: 'artifact' }], created_at: '2099-08-13T00:00:00.000Z', expires_at: '2099-08-13T01:00:00.000Z' }), received_at: '2099-08-13T00:00:01.000Z' });
    await persistInboundTask({ stateStore: store, inbound: value });
    assert.deepEqual(await expireInboundTasks({ stateStore: store, network_id: 'network-1', now: '2099-08-13T02:00:00.000Z' }), { expired: 1 });
    assert.deepEqual(await expireInboundTasks({ stateStore: store, network_id: 'network-1', now: '2099-08-13T02:00:01.000Z' }), { expired: 0 });
    assert.equal((await listInboundTasks({ stateStore: store, network_id: 'network-1', now: '2099-08-13T02:00:02.000Z' }))[0].status, 'expired');
    assert.deepEqual((await store.readEvents({ network_id: 'network-1', aggregate_type: 'opn-inbound-task' })).events.map((event) => event.event_type), ['opn.inbound.task.pending-human-approval', 'opn.inbound.task.expired']);
  } finally { await store.close(); await rm(root, { recursive: true, force: true }); }
});

test('processing lease is recorded and does not recover before expiry', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-inbound-task-lease-'));
  const store = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  try {
    await store.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2099-08-13T00:00:00.000Z' });
    const inbound = createInboundTask({ network_id: 'network-1', envelope: envelope(), received_at: '2099-08-13T00:00:01.000Z' });
    await persistInboundTask({ stateStore: store, inbound });
    const approved = await appendInboundTaskDecision({ stateStore: store, inbound, decision: 'approved', human_id: 'human-1', human_note: 'lease test', selected_agent_id: 'agent-1', decided_at: '2099-08-13T00:00:02.000Z' });
    const processing = await appendInboundTaskLifecycle({ stateStore: store, inbound: approved.inbound, status: 'processing', now: '2099-08-13T00:00:03.000Z', processing_lease_ms: 60_000 });
    assert.equal(processing.status, 'recorded');
    assert.equal(processing.inbound.processing_started_at, '2099-08-13T00:00:03.000Z');
    assert.equal(processing.inbound.processing_lease_expires_at, '2099-08-13T00:01:03.000Z');
    assert.deepEqual(await recoverExpiredInboundTasks({ stateStore: store, network_id: 'network-1', now: '2099-08-13T00:01:02.000Z' }), { recovered: 0 });
    assert.equal((await listInboundTasks({ stateStore: store, network_id: 'network-1', now: '2099-08-13T00:01:02.000Z' }))[0].status, 'processing');
  } finally { await store.close(); await rm(root, { recursive: true, force: true }); }
});

test('expired processing lease recovers to admitted without changing the task attempt', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-inbound-task-recovery-'));
  const store = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  try {
    await store.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2099-08-13T00:00:00.000Z' });
    const inbound = createInboundTask({ network_id: 'network-1', envelope: envelope(), received_at: '2099-08-13T00:00:01.000Z' });
    await persistInboundTask({ stateStore: store, inbound });
    const approved = await appendInboundTaskDecision({ stateStore: store, inbound, decision: 'approved', human_id: 'human-1', human_note: 'recovery test', selected_agent_id: 'agent-1', decided_at: '2099-08-13T00:00:02.000Z' });
    await appendInboundTaskLifecycle({ stateStore: store, inbound: approved.inbound, status: 'processing', now: '2099-08-13T00:00:03.000Z', processing_lease_ms: 60_000 });
    assert.deepEqual(await recoverExpiredInboundTasks({ stateStore: store, network_id: 'network-1', now: '2099-08-13T00:01:03.000Z' }), { recovered: 1 });
    const recovered = (await listInboundTasks({ stateStore: store, network_id: 'network-1', now: '2099-08-13T00:01:04.000Z' }))[0];
    assert.equal(recovered.status, 'admitted');
    assert.equal(recovered.admission_reason, 'processing-lease-expired');
    assert.equal(recovered.envelope.task_id, 'inbound-task-1');
    assert.equal(recovered.processing_started_at, '2099-08-13T00:00:03.000Z');
    assert.equal(recovered.processing_lease_expires_at, undefined);
    assert.deepEqual(await recoverExpiredInboundTasks({ stateStore: store, network_id: 'network-1', now: '2099-08-13T00:02:00.000Z' }), { recovered: 0 });
    assert.deepEqual((await store.readEvents({ network_id: 'network-1', aggregate_type: 'opn-inbound-task' })).events.map((event) => event.event_type), ['opn.inbound.task.pending-human-approval', 'opn.inbound.task.approved', 'opn.inbound.task.processing', 'opn.inbound.task.admitted']);
  } finally { await store.close(); await rm(root, { recursive: true, force: true }); }
});

test('concurrent inbound recovery records only one admission fact', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-inbound-task-concurrent-recovery-'));
  const store = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  try {
    await store.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2099-08-13T00:00:00.000Z' });
    const inbound = createInboundTask({ network_id: 'network-1', envelope: envelope(), received_at: '2099-08-13T00:00:01.000Z' });
    await persistInboundTask({ stateStore: store, inbound });
    const approved = await appendInboundTaskDecision({ stateStore: store, inbound, decision: 'approved', human_id: 'human-1', human_note: 'concurrent recovery test', selected_agent_id: 'agent-1', decided_at: '2099-08-13T00:00:02.000Z' });
    await appendInboundTaskLifecycle({ stateStore: store, inbound: approved.inbound, status: 'processing', now: '2099-08-13T00:00:03.000Z', processing_lease_ms: 1_000 });
    const results = await Promise.all([
      recoverExpiredInboundTasks({ stateStore: store, network_id: 'network-1', now: '2099-08-13T00:01:03.000Z' }),
      recoverExpiredInboundTasks({ stateStore: store, network_id: 'network-1', now: '2099-08-13T00:01:03.000Z' }),
    ]);
    assert.deepEqual(results.map((result) => result.recovered).sort(), [0, 1]);
    assert.equal((await store.readEvents({ network_id: 'network-1', aggregate_type: 'opn-inbound-task' })).events.filter((event) => event.event_type === 'opn.inbound.task.admitted').length, 1);
  } finally { await store.close(); await rm(root, { recursive: true, force: true }); }
});
