import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createNativeOpnTracerRelayEnvelope, createNativeOpnTracerRelayInbox } from '../dist/native-opn-tracer-relay.js';
import { recordNativeOpnTracerRelayReceipt, toNativeOpnTracerRelayDelivery } from '../dist/native-opn-tracer-relay-fact.js';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';

const digest = (digit) => `sha256:${digit.repeat(64)}`;
const makeEnvelope = () => createNativeOpnTracerRelayEnvelope({ message_id: 'message-1', network_id: 'network-1', event_id: 'event-1', plan_id: 'plan-1', plan_revision: 1, from_node_id: 'agent-1', target_node_id: 'agent-2', notification_kind: 'execution-evidence-available', state: 'available', artifact_refs: [{ artifact_id: digest('2'), content_sha256: digest('2'), kind: 'execution-evidence' }], created_at: '2026-07-31T11:00:00.000Z', expires_at: '2026-07-31T11:05:00.000Z' });

test('Native Tracer adapter produces a Relay delivery without business payload and records receipt once', async () => {
  const envelope = makeEnvelope();
  const delivery = toNativeOpnTracerRelayDelivery({ envelope, delivery_id: 'delivery-1', attempt_id: 'attempt-1', revision: 4 });
  assert.equal(delivery.target_node_id, 'agent-2');
  assert.equal(delivery.envelope_sha256, envelope.envelope_digest);
  assert.deepEqual(delivery.artifact_refs, envelope.artifact_refs);
  assert.equal('payload' in delivery, false);
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-native-opn-tracer-relay-fact-'));
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  try {
    await stateStore.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2026-07-31T00:00:00.000Z' });
    const inbox = createNativeOpnTracerRelayInbox({ network_id: 'network-1', node_id: 'agent-2', now: '2026-07-31T11:01:00.000Z' });
    const first = await recordNativeOpnTracerRelayReceipt({ stateStore, inbox, expected_revision: 1, envelope, now: '2026-07-31T11:01:00.000Z' });
    assert.equal(first.status, 'recorded');
    const retry = await recordNativeOpnTracerRelayReceipt({ stateStore, inbox, expected_revision: 2, envelope, now: '2026-07-31T11:02:00.000Z' });
    assert.equal(retry.status, 'duplicate');
    const events = await stateStore.readEvents({ network_id: 'network-1', after_revision: 1 });
    assert.equal(events.events.length, 1);
    assert.equal(events.events[0].event_type, 'native-opn-tracer.relay.message.received');
  } finally {
    await stateStore.close();
    await rm(root, { recursive: true, force: true });
  }
});
