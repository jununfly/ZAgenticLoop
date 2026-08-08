import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';
import { abandonRealAgentDogfoodWorkerLease, acquireRealAgentDogfoodWorkerLease, releaseRealAgentDogfoodWorkerLease, renewRealAgentDogfoodWorkerLease } from '../dist/real-agent-dogfood-worker.js';

const bindingDigest = 'sha256:' + 'a'.repeat(64);

test('worker lease is CAS-backed, idempotent, and cannot be taken over after expiry', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-worker-lease-'));
  const store = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  try {
    await store.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2026-08-01T12:00:00.000Z' });
    const first = await acquireRealAgentDogfoodWorkerLease({ stateStore: store, network_id: 'network-1', execution_id: 'execution-1', worker_id: 'worker-1', execution_binding_digest: bindingDigest, now: '2026-08-01T12:00:00.000Z', ttl_ms: 30_000 });
    assert.equal(first.status, 'acquired');
    const repeated = await acquireRealAgentDogfoodWorkerLease({ stateStore: store, network_id: 'network-1', execution_id: 'execution-1', worker_id: 'worker-2', execution_binding_digest: bindingDigest, now: '2026-08-01T12:00:01.000Z', ttl_ms: 30_000 });
    assert.equal(repeated.status, 'reused');
    assert.equal(repeated.lease_id, first.lease_id);
    const drifted = await acquireRealAgentDogfoodWorkerLease({ stateStore: store, network_id: 'network-1', execution_id: 'execution-1', worker_id: 'worker-2', execution_binding_digest: 'sha256:' + 'b'.repeat(64), now: '2026-08-01T12:00:02.000Z', ttl_ms: 30_000 });
    assert.deepEqual(drifted, { status: 'blocked', reason: 'worker-lease-mismatch' });
    const renewed = await renewRealAgentDogfoodWorkerLease({ stateStore: store, network_id: 'network-1', execution_id: 'execution-1', lease_id: first.lease_id, worker_id: 'worker-1', execution_binding_digest: bindingDigest, expected_revision: repeated.revision, now: '2026-08-01T12:00:10.000Z', ttl_ms: 30_000 });
    assert.equal(renewed.status, 'renewed');
    const expired = await acquireRealAgentDogfoodWorkerLease({ stateStore: store, network_id: 'network-1', execution_id: 'execution-1', worker_id: 'worker-3', execution_binding_digest: bindingDigest, now: '2026-08-01T12:01:00.000Z', ttl_ms: 30_000 });
    assert.deepEqual(expired, { status: 'blocked', reason: 'worker-lease-expired' });
  } finally {
    await store.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('worker lease default TTL covers the bounded provider invocation', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-worker-lease-default-ttl-'));
  const store = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  try {
    await store.createNetwork({ network_id: 'network-default-ttl', owner_id: 'human-1', now: '2026-08-01T12:00:00.000Z' });
    const acquired = await acquireRealAgentDogfoodWorkerLease({ stateStore: store, network_id: 'network-default-ttl', execution_id: 'execution-default-ttl', worker_id: 'worker-default-ttl', execution_binding_digest: bindingDigest, now: '2026-08-01T12:00:00.000Z' });
    assert.equal(acquired.status, 'acquired');
    assert.equal(acquired.expires_at, '2026-08-01T12:03:00.000Z');
  } finally {
    await store.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('worker lease can be explicitly released by its holder', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-worker-lease-'));
  const store = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  try {
    await store.createNetwork({ network_id: 'network-release-1', owner_id: 'human-1', now: '2026-08-01T12:00:00.000Z' });
    const acquired = await acquireRealAgentDogfoodWorkerLease({ stateStore: store, network_id: 'network-release-1', execution_id: 'execution-release-1', worker_id: 'worker-1', execution_binding_digest: bindingDigest, now: '2026-08-01T12:00:00.000Z', ttl_ms: 30_000 });
    assert.equal(acquired.status, 'acquired');
    const released = await releaseRealAgentDogfoodWorkerLease({ stateStore: store, network_id: 'network-release-1', execution_id: 'execution-release-1', lease_id: acquired.lease_id, worker_id: 'worker-1', execution_binding_digest: bindingDigest, expected_revision: acquired.revision, now: '2026-08-01T12:00:05.000Z' });
    assert.deepEqual(released, { status: 'released', lease_id: acquired.lease_id, worker_id: 'worker-1', revision: 3 });
    const events = (await store.readEvents({ network_id: 'network-release-1', aggregate_type: 'real-agent-dogfood-worker', aggregate_id: 'execution-release-1' })).events;
    assert.equal(events.at(-1).payload.operation, 'released');
  } finally {
    await store.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('worker lease release revision conflict never reports a released lease', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-worker-lease-'));
  const store = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  try {
    await store.createNetwork({ network_id: 'network-release-conflict-1', owner_id: 'human-1', now: '2026-08-01T12:00:00.000Z' });
    const acquired = await acquireRealAgentDogfoodWorkerLease({ stateStore: store, network_id: 'network-release-conflict-1', execution_id: 'execution-release-conflict-1', worker_id: 'worker-1', execution_binding_digest: bindingDigest, now: '2026-08-01T12:00:00.000Z', ttl_ms: 30_000 });
    assert.equal(acquired.status, 'acquired');
    const conflict = await releaseRealAgentDogfoodWorkerLease({ stateStore: store, network_id: 'network-release-conflict-1', execution_id: 'execution-release-conflict-1', lease_id: acquired.lease_id, worker_id: 'worker-1', execution_binding_digest: bindingDigest, expected_revision: acquired.revision - 1, now: '2026-08-01T12:00:05.000Z' });
    assert.deepEqual(conflict, { status: 'blocked', reason: 'worker-lease-mismatch' });
    const events = (await store.readEvents({ network_id: 'network-release-conflict-1', aggregate_type: 'real-agent-dogfood-worker', aggregate_id: 'execution-release-conflict-1' })).events;
    assert.equal(events.at(-1).payload.operation, 'acquired');
  } finally {
    await store.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('expired worker lease can be explicitly abandoned and then reacquired', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-worker-lease-'));
  const store = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  try {
    await store.createNetwork({ network_id: 'network-abandon-1', owner_id: 'human-1', now: '2026-08-01T12:00:00.000Z' });
    const acquired = await acquireRealAgentDogfoodWorkerLease({ stateStore: store, network_id: 'network-abandon-1', execution_id: 'execution-abandon-1', worker_id: 'worker-1', execution_binding_digest: bindingDigest, now: '2026-08-01T12:00:00.000Z', ttl_ms: 30_000 });
    assert.equal(acquired.status, 'acquired');
    const abandoned = await abandonRealAgentDogfoodWorkerLease({ stateStore: store, network_id: 'network-abandon-1', execution_id: 'execution-abandon-1', lease_id: acquired.lease_id, worker_id: 'worker-1', execution_binding_digest: bindingDigest, expected_revision: acquired.revision, now: '2026-08-01T12:00:30.000Z' });
    assert.deepEqual(abandoned, { status: 'abandoned', lease_id: acquired.lease_id, worker_id: 'worker-1', revision: 3 });
    const reacquired = await acquireRealAgentDogfoodWorkerLease({ stateStore: store, network_id: 'network-abandon-1', execution_id: 'execution-abandon-1', worker_id: 'worker-2', execution_binding_digest: bindingDigest, now: '2026-08-01T12:00:31.000Z', ttl_ms: 30_000 });
    assert.equal(reacquired.status, 'acquired');
    assert.notEqual(reacquired.lease_id, acquired.lease_id);
  } finally {
    await store.close();
    await rm(root, { recursive: true, force: true });
  }
});
