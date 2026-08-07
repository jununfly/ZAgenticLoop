import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';
import { createTransportEnvelope } from '../dist/transport-contract.js';
import { createLocalOpnTransportAdapter } from '../dist/opn-center-transport.js';
import { projectOpnInbox, receiveAndPersistOpnMessage } from '../dist/opn-transport-inbox.js';

const digest = (digit) => `sha256:${digit.repeat(64)}`;
const centerNode = 'endpoint:network-1';

function envelope(overrides = {}) {
  return createTransportEnvelope({
    message_id: 'message-1', network_id: 'network-1', event_id: 'event-1', plan_id: 'plan-1', plan_revision: 1,
    task_id: 'task-1', from_node_id: 'agent-1', target_node_id: centerNode, notification_kind: 'evidence-available',
    state: 'available', artifact_refs: [{ artifact_id: digest('a'), content_sha256: digest('b'), kind: 'evidence' }],
    created_at: '2026-08-07T10:00:00.000Z', expires_at: '2026-08-07T11:00:00.000Z', ...overrides,
  });
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-opn-center-transport-'));
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  await stateStore.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2026-08-07T09:00:00.000Z' });
  return { root, stateStore };
}

async function offer(stateStore, value) {
  const current = await stateStore.getRevision('network-1');
  return stateStore.appendEvent({
    network_id: 'network-1', expected_revision: current, now: '2026-08-07T10:01:00.000Z',
    event: {
      event_id: `opn.transport.message.offered:${value.message_id}:${value.envelope_digest}`,
      aggregate_type: 'opn-transport-message', aggregate_id: value.message_id,
      event_type: 'opn.transport.message.offered', occurred_at: value.created_at,
      payload: { schema: 'zj-loop.opn_transport_http.v1', envelope: value },
    },
  });
}

test('center-local adapter receives and acknowledges a message from StateStore', async () => {
  const { root, stateStore } = await fixture();
  try {
    const value = envelope();
    await offer(stateStore, value);
    const adapter = createLocalOpnTransportAdapter({ stateStore, network_id: 'network-1', node_id: centerNode, now: () => '2026-08-07T10:02:00.000Z' });
    const session = await adapter.openSession({ network_id: 'network-1', node_id: centerNode });
    assert.deepEqual(await adapter.receive({ session_id: session.session_id }), value);
    assert.deepEqual(await adapter.acknowledge({ session_id: session.session_id, message_id: value.message_id, envelope_digest: value.envelope_digest }), {
      status: 'accepted', message_id: value.message_id, envelope_digest: value.envelope_digest, side_effects_executed: false,
    });
    assert.equal(await adapter.receive({ session_id: session.session_id }), null);
    const events = await stateStore.readEvents({ network_id: 'network-1', aggregate_type: 'opn-transport-message', aggregate_id: value.message_id });
    assert.deepEqual(events.events.map((event) => event.event_type), ['opn.transport.message.offered', 'opn.transport.message.acknowledged']);
    await adapter.closeSession({ session_id: session.session_id });
  } finally { await stateStore.close(); await rm(root, { recursive: true, force: true }); }
});

test('center-local adapter does not receive messages targeted at another node', async () => {
  const { root, stateStore } = await fixture();
  try {
    const value = envelope({ target_node_id: 'agent-2' });
    await offer(stateStore, value);
    const adapter = createLocalOpnTransportAdapter({ stateStore, network_id: 'network-1', node_id: centerNode });
    const session = await adapter.openSession({ network_id: 'network-1', node_id: centerNode });
    assert.equal(await adapter.receive({ session_id: session.session_id }), null);
  } finally { await stateStore.close(); await rm(root, { recursive: true, force: true }); }
});

test('center-local adapter can send a message through the same StateStore transport facts', async () => {
  const { root, stateStore } = await fixture();
  try {
    const adapter = createLocalOpnTransportAdapter({ stateStore, network_id: 'network-1', node_id: centerNode, now: () => '2026-08-07T10:02:00.000Z' });
    const session = await adapter.openSession({ network_id: 'network-1', node_id: centerNode });
    const value = envelope({ message_id: 'center-to-agent-1', from_node_id: centerNode, target_node_id: 'agent-1' });
    assert.deepEqual(await adapter.send({ session_id: session.session_id, envelope: value }), {
      status: 'accepted', message_id: value.message_id, envelope_digest: value.envelope_digest, side_effects_executed: false,
    });
    const events = await stateStore.readEvents({ network_id: 'network-1', aggregate_type: 'opn-transport-message', aggregate_id: value.message_id });
    assert.equal(events.events[0].event_type, 'opn.transport.message.offered');
  } finally { await stateStore.close(); await rm(root, { recursive: true, force: true }); }
});

test('center-local adapter completes the production Inbox receive, projection, and ack path', async () => {
  const { root, stateStore } = await fixture();
  try {
    const value = envelope({ message_id: 'message-for-inbox' });
    await offer(stateStore, value);
    const adapter = createLocalOpnTransportAdapter({ stateStore, network_id: 'network-1', node_id: centerNode, now: () => '2026-08-07T10:02:00.000Z' });
    const session = await adapter.openSession({ network_id: 'network-1', node_id: centerNode });
    const result = await receiveAndPersistOpnMessage({ transport: adapter, session_id: session.session_id, stateStore, network_id: 'network-1', node_id: centerNode, expected_revision: 2, now: '2026-08-07T10:02:00.000Z' });
    assert.equal(result.status, 'acknowledged');
    const projection = await projectOpnInbox({ stateStore, network_id: 'network-1', node_id: centerNode });
    assert.equal(projection.length, 1);
    assert.equal(projection[0].message_id, value.message_id);
    assert.equal(projection[0].delivery_state, 'acknowledged');
  } finally { await stateStore.close(); await rm(root, { recursive: true, force: true }); }
});
