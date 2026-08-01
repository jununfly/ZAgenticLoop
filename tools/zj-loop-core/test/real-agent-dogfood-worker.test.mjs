import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';
import { acquireRealAgentDogfoodWorkerLease, renewRealAgentDogfoodWorkerLease } from '../dist/real-agent-dogfood-worker.js';

test('worker lease is CAS-backed, idempotent, and cannot be taken over after expiry', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-worker-lease-'));
  const store = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  try {
    await store.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2026-08-01T12:00:00.000Z' });
    const first = await acquireRealAgentDogfoodWorkerLease({ stateStore: store, network_id: 'network-1', execution_id: 'execution-1', worker_id: 'worker-1', now: '2026-08-01T12:00:00.000Z', ttl_ms: 30_000 });
    assert.equal(first.status, 'acquired');
    const repeated = await acquireRealAgentDogfoodWorkerLease({ stateStore: store, network_id: 'network-1', execution_id: 'execution-1', worker_id: 'worker-2', now: '2026-08-01T12:00:01.000Z', ttl_ms: 30_000 });
    assert.equal(repeated.status, 'reused');
    assert.equal(repeated.lease_id, first.lease_id);
    const renewed = await renewRealAgentDogfoodWorkerLease({ stateStore: store, network_id: 'network-1', execution_id: 'execution-1', lease_id: first.lease_id, worker_id: 'worker-1', expected_revision: repeated.revision, now: '2026-08-01T12:00:10.000Z', ttl_ms: 30_000 });
    assert.equal(renewed.status, 'renewed');
    const expired = await acquireRealAgentDogfoodWorkerLease({ stateStore: store, network_id: 'network-1', execution_id: 'execution-1', worker_id: 'worker-3', now: '2026-08-01T12:01:00.000Z', ttl_ms: 30_000 });
    assert.deepEqual(expired, { status: 'blocked', reason: 'worker-lease-expired' });
  } finally {
    await store.close();
    await rm(root, { recursive: true, force: true });
  }
});
