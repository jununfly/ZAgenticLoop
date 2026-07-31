import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRelaySession } from '../dist/relay-contract.js';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';
import { createSqliteTransportDeliveryStore } from '../dist/sqlite-transport-delivery-store.js';

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-transport-state-'));
  const filename = path.join(root, 'state.sqlite');
  const state = createSqliteStateStore({ filename });
  await state.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2026-08-01T12:00:00.000Z' });
  return { root, filename, state, store: createSqliteTransportDeliveryStore({ stateStore: state }) };
}

test('SQLite transport store reconstructs sessions and delivery acknowledgement after reconnect', async () => {
  const value = await fixture();
  const session = createRelaySession({ session_id: 'session-1', network_id: 'network-1', node_id: 'node-1', credential_id: 'credential-1', protocol_version: 'transport.v1', created_at: '2026-08-01T12:00:00.000Z', credential_expires_at: '2026-08-01T13:00:00.000Z', max_ttl_ms: 15 * 60 * 1000 });
  const delivery = { delivery_id: 'delivery-1', attempt_id: '', network_id: 'network-1', event_id: 'event-1', task_id: 'task-1', target_node_id: 'node-1', state: 'offered', retry_count: 0 };
  assert.equal((await value.store.openSession({ session })).status, 'recorded');
  assert.equal((await value.store.offerDelivery({ delivery })).status, 'recorded');
  assert.equal((await value.store.startLease({ network_id: 'network-1', delivery_id: 'delivery-1', attempt_id: 'attempt-1', now: '2026-08-01T12:01:00.000Z', lease_ms: 30_000 })).status, 'recorded');
  assert.equal((await value.store.accept({ network_id: 'network-1', delivery_id: 'delivery-1', attempt_id: 'attempt-1' })).status, 'recorded');
  await value.state.close();

  const reopenedState = createSqliteStateStore({ filename: value.filename });
  const reopened = createSqliteTransportDeliveryStore({ stateStore: reopenedState });
  assert.equal((await reopened.getSession({ network_id: 'network-1', session_id: 'session-1' })).status, 'active');
  const acknowledged = await reopened.acknowledge({ network_id: 'network-1', delivery_id: 'delivery-1', attempt_id: 'attempt-1', now: '2026-08-01T12:01:10.000Z' });
  assert.equal(acknowledged.status, 'recorded');
  assert.equal(acknowledged.delivery.state, 'acknowledged');
  await reopenedState.close();
  await rm(value.root, { recursive: true, force: true });
});

test('SQLite transport store bounds retries and persists blocked delivery', async () => {
  const value = await fixture();
  const delivery = { delivery_id: 'delivery-2', attempt_id: 'attempt-1', network_id: 'network-1', event_id: 'event-2', task_id: 'task-2', target_node_id: 'node-1', state: 'offered', retry_count: 0 };
  await value.store.offerDelivery({ delivery });
  assert.equal((await value.store.scheduleRetry({ network_id: 'network-1', delivery_id: 'delivery-2', now: '2026-08-01T12:01:00.000Z', max_retries: 1, reason: 'lease-expired' })).delivery.retry_count, 1);
  const blocked = await value.store.scheduleRetry({ network_id: 'network-1', delivery_id: 'delivery-2', now: '2026-08-01T12:02:00.000Z', max_retries: 1, reason: 'lease-expired' });
  assert.equal(blocked.delivery.state, 'blocked');
  await value.state.close();
  const reopenedState = createSqliteStateStore({ filename: value.filename });
  const reopened = createSqliteTransportDeliveryStore({ stateStore: reopenedState });
  assert.equal((await reopened.getDelivery({ network_id: 'network-1', delivery_id: 'delivery-2' })).state, 'blocked');
  await reopenedState.close();
  await rm(value.root, { recursive: true, force: true });
});
