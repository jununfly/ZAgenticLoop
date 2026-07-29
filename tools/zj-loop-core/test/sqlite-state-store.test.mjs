import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';

test('SQLite StateStore bootstraps idempotently and creates a Human-owned network at revision one', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-state-'));
  const filename = path.join(root, 'state.db');
  try {
    const first = createSqliteStateStore({ filename });
    const created = await first.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2026-07-29T01:00:00.000Z' });
    assert.equal(created.status, 'recorded');
    assert.equal(await first.getRevision('network-1'), 1);
    await first.close();

    const reopened = createSqliteStateStore({ filename });
    assert.equal(await reopened.getRevision('network-1'), 1);
    await reopened.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('SQLite StateStore appends a canonical event and advances the network revision', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-state-'));
  const filename = path.join(root, 'state.db');
  try {
    const store = createSqliteStateStore({ filename });
    await store.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2026-07-29T01:00:00.000Z' });
    const result = await store.appendEvent({
      network_id: 'network-1',
      expected_revision: 1,
      event: {
        event_id: 'event-1',
        aggregate_type: 'enrollment',
        aggregate_id: 'node-1',
        event_type: 'pairing-requested',
        occurred_at: '2026-07-29T01:01:00.000Z',
        payload: { z: 1, a: 'stable' },
      },
      now: '2026-07-29T01:01:01.000Z',
    });
    assert.equal(result.status, 'recorded');
    assert.equal(result.revision, 2);
    assert.equal(await store.getRevision('network-1'), 2);
    const snapshot = await store.readEvents({ network_id: 'network-1' });
    assert.equal(snapshot.snapshot_revision, 2);
    assert.equal(snapshot.events[1].event_id, 'event-1');
    assert.deepEqual(snapshot.events[1].payload, { a: 'stable', z: 1 });
    assert.match(snapshot.events[1].payload_sha256, /^[0-9a-f]{64}$/);
    await store.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('SQLite StateStore makes event retries idempotent and rejects stale CAS writes', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-state-'));
  const filename = path.join(root, 'state.db');
  try {
    const store = createSqliteStateStore({ filename });
    await store.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2026-07-29T01:00:00.000Z' });
    const event = { event_id: 'event-1', aggregate_type: 'task', aggregate_id: 'task-1', event_type: 'task.created', occurred_at: '2026-07-29T01:01:00.000Z', payload: { value: 1 } };
    const first = await store.appendEvent({ network_id: 'network-1', expected_revision: 1, event, now: '2026-07-29T01:01:01.000Z' });
    const retry = await store.appendEvent({ network_id: 'network-1', expected_revision: 1, event, now: '2026-07-29T01:01:02.000Z' });
    const stale = await store.appendEvent({ network_id: 'network-1', expected_revision: 1, event: { ...event, event_id: 'event-2' }, now: '2026-07-29T01:01:03.000Z' });
    assert.equal(first.status, 'recorded');
    assert.equal(retry.status, 'duplicate');
    assert.equal(retry.revision, 2);
    assert.equal(stale.status, 'conflict');
    assert.equal(stale.reason, 'revision-mismatch');
    assert.equal(await store.getRevision('network-1'), 2);
    await store.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('SQLite StateStore fails closed when a network is recreated with another owner', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-state-'));
  const filename = path.join(root, 'state.db');
  try {
    const store = createSqliteStateStore({ filename });
    await store.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2026-07-29T01:00:00.000Z' });
    const result = await store.createNetwork({ network_id: 'network-1', owner_id: 'human-2', now: '2026-07-29T01:01:00.000Z' });
    assert.equal(result.status, 'conflict');
    assert.equal(result.reason, 'network-owner-mismatch');
    assert.equal(await store.getRevision('network-1'), 1);
    await store.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
