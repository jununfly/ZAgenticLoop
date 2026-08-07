import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';
import { createTransportEnvelope } from '../dist/transport-contract.js';
import { receiveAndPersistOpnMessage, projectOpnInbox } from '../dist/opn-transport-inbox.js';

const digest = (digit) => `sha256:${digit.repeat(64)}`;
const makeEnvelope = (overrides = {}) => createTransportEnvelope({
  message_id: 'message-1', network_id: 'network-1', event_id: 'event-1', plan_id: 'plan-1', plan_revision: 1,
  task_id: 'task-1', from_node_id: 'agent-1', target_node_id: 'agent-2', notification_kind: 'evidence-available',
  state: 'available', artifact_refs: [{ artifact_id: digest('a'), content_sha256: digest('b'), kind: 'evidence' }],
  created_at: '2026-08-07T10:00:00.000Z', expires_at: '2026-08-07T11:00:00.000Z', ...overrides,
});

function fakeTransport(envelope, options = {}) {
  const calls = [];
  return {
    calls,
    async receive() { calls.push('receive'); return envelope; },
    async acknowledge(input) {
      calls.push({ acknowledge: input });
      if (options.ackError) throw new Error(options.ackError);
      return { status: options.ackStatus ?? 'accepted', message_id: input.message_id, envelope_digest: input.envelope_digest, side_effects_executed: false };
    },
  };
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-opn-inbox-'));
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  await stateStore.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2026-08-07T09:00:00.000Z' });
  return { root, stateStore };
}

test('receive persists the Inbox fact before acknowledging and projects an acknowledged message', async () => {
  const { root, stateStore } = await fixture();
  try {
    const envelope = makeEnvelope();
    const transport = fakeTransport(envelope);
    const result = await receiveAndPersistOpnMessage({ transport, session_id: 'session-1', stateStore, network_id: 'network-1', node_id: 'agent-2', expected_revision: 1, now: '2026-08-07T10:01:00.000Z' });
    assert.equal(result.status, 'acknowledged');
    assert.deepEqual(transport.calls.map((call) => typeof call === 'string' ? call : 'acknowledge'), ['receive', 'acknowledge']);
    const snapshot = await stateStore.readEvents({ network_id: 'network-1', aggregate_type: 'opn-inbox', aggregate_id: 'message-1' });
    assert.deepEqual(snapshot.events.map((event) => event.event_type), ['opn.inbox.message.received', 'opn.inbox.message.acknowledged']);
    assert.equal(snapshot.events[0].payload.envelope_digest, envelope.envelope_digest);
    assert.equal('payload' in snapshot.events[0].payload, false);
    const projection = await projectOpnInbox({ stateStore, network_id: 'network-1', node_id: 'agent-2' });
    assert.equal(projection.length, 1);
    assert.equal(projection[0].delivery_state, 'acknowledged');
  } finally { await stateStore.close(); await rm(root, { recursive: true, force: true }); }
});

test('empty receive does not write or acknowledge', async () => {
  const { root, stateStore } = await fixture();
  try {
    const transport = fakeTransport(null);
    const result = await receiveAndPersistOpnMessage({ transport, session_id: 'session-1', stateStore, network_id: 'network-1', node_id: 'agent-2', expected_revision: 1, now: '2026-08-07T10:01:00.000Z' });
    assert.deepEqual(result, { status: 'empty', side_effects_executed: false });
    assert.deepEqual((await stateStore.readEvents({ network_id: 'network-1', after_revision: 1 })).events, []);
    assert.deepEqual(transport.calls, ['receive']);
  } finally { await stateStore.close(); await rm(root, { recursive: true, force: true }); }
});

test('repeated receive is idempotent and still acknowledges the already persisted fact', async () => {
  const { root, stateStore } = await fixture();
  try {
    const envelope = makeEnvelope();
    const firstTransport = fakeTransport(envelope);
    const first = await receiveAndPersistOpnMessage({ transport: firstTransport, session_id: 'session-1', stateStore, network_id: 'network-1', node_id: 'agent-2', expected_revision: 1, now: '2026-08-07T10:01:00.000Z' });
    const retryTransport = fakeTransport(envelope, { ackStatus: 'duplicate' });
    const retry = await receiveAndPersistOpnMessage({ transport: retryTransport, session_id: 'session-1', stateStore, network_id: 'network-1', node_id: 'agent-2', expected_revision: 1, now: '2026-08-07T10:02:00.000Z' });
    assert.equal(first.status, 'acknowledged');
    assert.equal(retry.status, 'duplicate');
    assert.equal((await stateStore.readEvents({ network_id: 'network-1', aggregate_type: 'opn-inbox', aggregate_id: 'message-1' })).events.length, 2);
    assert.equal(retryTransport.calls.length, 2);
  } finally { await stateStore.close(); await rm(root, { recursive: true, force: true }); }
});

test('same message id with a different envelope digest is blocked without ack', async () => {
  const { root, stateStore } = await fixture();
  try {
    const first = makeEnvelope();
    await receiveAndPersistOpnMessage({ transport: fakeTransport(first), session_id: 'session-1', stateStore, network_id: 'network-1', node_id: 'agent-2', expected_revision: 1, now: '2026-08-07T10:01:00.000Z' });
    const conflicting = makeEnvelope({ notification_kind: 'different-message-meaning' });
    const transport = fakeTransport(conflicting);
    const result = await receiveAndPersistOpnMessage({ transport, session_id: 'session-1', stateStore, network_id: 'network-1', node_id: 'agent-2', expected_revision: 3, now: '2026-08-07T10:02:00.000Z' });
    assert.equal(result.status, 'outcome-uncertain');
    assert.equal(result.reason, 'opn-inbox-message-digest-conflict');
    assert.deepEqual(transport.calls, ['receive']);
  } finally { await stateStore.close(); await rm(root, { recursive: true, force: true }); }
});

test('invalid target, network, expired, and digest-conflicting messages are blocked before ack', async (t) => {
  for (const [name, envelope] of [
    ['target', makeEnvelope({ target_node_id: 'agent-3' })],
    ['network', makeEnvelope({ network_id: 'network-2' })],
    ['expired', makeEnvelope({ expires_at: '2026-08-07T10:00:30.000Z' })],
  ]) {
    await t.test(name, async () => {
      const { root, stateStore } = await fixture();
      try {
        const transport = fakeTransport(envelope);
        const result = await receiveAndPersistOpnMessage({ transport, session_id: 'session-1', stateStore, network_id: 'network-1', node_id: 'agent-2', expected_revision: 1, now: '2026-08-07T10:01:00.000Z' });
        assert.equal(result.status, 'blocked');
        assert.equal(transport.calls.length, 1);
        assert.equal((await stateStore.readEvents({ network_id: 'network-1', after_revision: 1 })).events.length, 0);
      } finally { await stateStore.close(); await rm(root, { recursive: true, force: true }); }
    });
  }
});

test('ack failure preserves the Inbox fact as ack-pending', async () => {
  const { root, stateStore } = await fixture();
  try {
    const envelope = makeEnvelope();
    const transport = fakeTransport(envelope, { ackError: 'peer-unavailable' });
    const result = await receiveAndPersistOpnMessage({ transport, session_id: 'session-1', stateStore, network_id: 'network-1', node_id: 'agent-2', expected_revision: 1, now: '2026-08-07T10:01:00.000Z' });
    assert.equal(result.status, 'ack-pending');
    assert.equal((await stateStore.readEvents({ network_id: 'network-1', aggregate_type: 'opn-inbox', aggregate_id: 'message-1' })).events.length, 1);
  } finally { await stateStore.close(); await rm(root, { recursive: true, force: true }); }
});

test('persistence failure never acknowledges the transport message', async () => {
  const envelope = makeEnvelope();
  const transport = fakeTransport(envelope);
  const stateStore = { getRevision: async () => 1, appendEvent: async () => { throw new Error('state-store-down'); }, readEvents: async () => ({ snapshot_revision: 1, events: [] }) };
  const result = await receiveAndPersistOpnMessage({ transport, session_id: 'session-1', stateStore, network_id: 'network-1', node_id: 'agent-2', expected_revision: 1, now: '2026-08-07T10:01:00.000Z' });
  assert.equal(result.status, 'outcome-uncertain');
  assert.deepEqual(transport.calls, ['receive']);
});
