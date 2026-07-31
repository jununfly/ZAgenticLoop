import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';
import { createSqliteTransportDeliveryStore } from '../dist/sqlite-transport-delivery-store.js';
import { runTransportReplayConformance } from '../dist/transport-replay-conformance.js';

test('transport replay conformance proves disconnect, duplicate, reordering, recovery, and final ack', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-transport-replay-'));
  const state = createSqliteStateStore({ filename: path.join(root, 'state.sqlite') });
  await state.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2026-08-01T12:00:00.000Z' });
  const result = await runTransportReplayConformance({ store: createSqliteTransportDeliveryStore({ stateStore: state }), network_id: 'network-1', scenario_id: 'replay-1' });
  assert.equal(result.schema, 'zj-loop.transport_replay_conformance.v1');
  assert.equal(result.status, 'passed');
  assert.equal(result.side_effects_executed, false);
  assert.equal(result.assertions.every((item) => item.status === 'passed'), true);
  assert.deepEqual(result.final_deliveries.map((item) => item.state), ['acknowledged', 'acknowledged']);
  await state.close();
  await rm(root, { recursive: true, force: true });
});
