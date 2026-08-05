import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';
import {
  abandonRealAgentDogfoodCoordinatorLease,
  acquireRealAgentDogfoodCoordinatorLease,
  releaseRealAgentDogfoodCoordinatorLease,
} from '../dist/real-agent-dogfood-coordinator-lease.js';

test('Coordinator lease is scoped to one execution and can be released with CAS', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-coordinator-lease-'));
  const store = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  try {
    await store.createNetwork({ network_id: 'network-coordinator-1', owner_id: 'human-1', now: '2026-08-01T12:00:00.000Z' });
    const first = await acquireRealAgentDogfoodCoordinatorLease({ stateStore: store, network_id: 'network-coordinator-1', execution_id: 'execution-coordinator-1', human_id: 'human-1', coordinator_id: 'coordinator-1', session_id: 'session-1', execution_binding_digest: 'sha256:' + 'a'.repeat(64), now: '2026-08-01T12:00:00.000Z', ttl_ms: 30_000 });
    assert.equal(first.status, 'acquired');
    assert.match(first.coordinator_lease_digest, /^sha256:[0-9a-f]{64}$/);
    const repeated = await acquireRealAgentDogfoodCoordinatorLease({ stateStore: store, network_id: 'network-coordinator-1', execution_id: 'execution-coordinator-1', human_id: 'human-1', coordinator_id: 'coordinator-1', session_id: 'session-1', execution_binding_digest: 'sha256:' + 'a'.repeat(64), now: '2026-08-01T12:00:01.000Z', ttl_ms: 30_000 });
    assert.equal(repeated.status, 'reused');
    assert.equal(repeated.lease_id, first.lease_id);
    const concurrent = await acquireRealAgentDogfoodCoordinatorLease({ stateStore: store, network_id: 'network-coordinator-1', execution_id: 'execution-coordinator-1', human_id: 'human-1', coordinator_id: 'coordinator-2', session_id: 'session-2', execution_binding_digest: 'sha256:' + 'a'.repeat(64), now: '2026-08-01T12:00:02.000Z', ttl_ms: 30_000 });
    assert.deepEqual(concurrent, { status: 'blocked', reason: 'coordinator-lease-mismatch' });
    const released = await releaseRealAgentDogfoodCoordinatorLease({ stateStore: store, network_id: 'network-coordinator-1', execution_id: 'execution-coordinator-1', lease_id: first.lease_id, human_id: 'human-1', coordinator_id: 'coordinator-1', expected_revision: repeated.revision, now: '2026-08-01T12:00:05.000Z' });
    assert.equal(released.status, 'released');
    assert.equal(released.coordinator_lease_digest, first.coordinator_lease_digest);
    const otherExecution = await acquireRealAgentDogfoodCoordinatorLease({ stateStore: store, network_id: 'network-coordinator-1', execution_id: 'execution-coordinator-2', human_id: 'human-1', coordinator_id: 'coordinator-2', session_id: 'session-2', execution_binding_digest: 'sha256:' + 'b'.repeat(64), now: '2026-08-01T12:00:06.000Z', ttl_ms: 30_000 });
    assert.equal(otherExecution.status, 'acquired');
  } finally {
    await store.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('expired Coordinator lease can be abandoned before a new session resumes the execution', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-coordinator-lease-'));
  const store = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  try {
    await store.createNetwork({ network_id: 'network-coordinator-2', owner_id: 'human-1', now: '2026-08-01T12:00:00.000Z' });
    const acquired = await acquireRealAgentDogfoodCoordinatorLease({ stateStore: store, network_id: 'network-coordinator-2', execution_id: 'execution-coordinator-2', human_id: 'human-1', coordinator_id: 'coordinator-1', session_id: 'session-1', execution_binding_digest: 'sha256:' + 'a'.repeat(64), now: '2026-08-01T12:00:00.000Z', ttl_ms: 30_000 });
    assert.equal(acquired.status, 'acquired');
    const abandoned = await abandonRealAgentDogfoodCoordinatorLease({ stateStore: store, network_id: 'network-coordinator-2', execution_id: 'execution-coordinator-2', lease_id: acquired.lease_id, human_id: 'human-1', coordinator_id: 'coordinator-1', expected_revision: acquired.revision, now: '2026-08-01T12:00:30.000Z' });
    assert.equal(abandoned.status, 'abandoned');
    assert.equal(abandoned.coordinator_lease_digest, acquired.coordinator_lease_digest);
    const resumed = await acquireRealAgentDogfoodCoordinatorLease({ stateStore: store, network_id: 'network-coordinator-2', execution_id: 'execution-coordinator-2', human_id: 'human-1', coordinator_id: 'coordinator-2', session_id: 'session-2', execution_binding_digest: 'sha256:' + 'a'.repeat(64), now: '2026-08-01T12:00:31.000Z', ttl_ms: 30_000 });
    assert.equal(resumed.status, 'acquired');
    assert.notEqual(resumed.lease_id, acquired.lease_id);
  } finally {
    await store.close();
    await rm(root, { recursive: true, force: true });
  }
});
