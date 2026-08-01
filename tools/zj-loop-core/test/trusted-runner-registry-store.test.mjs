import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createInMemoryHumanSigner } from '../dist/human-signer.js';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';
import { createTrustedRunnerRegistryMutation, trustedRunnerCapabilitiesDigest } from '../dist/trusted-runner-registry.js';
import { readTrustedRunnerRegistry, recordTrustedRunnerRegistryMutation, trustedRunnerRegistrySnapshotDigest } from '../dist/trusted-runner-registry-store.js';
import { createHumanAuthoritySetInitialization, recordHumanAuthoritySetInitialization } from '../dist/human-authority-set-store.js';

test('trusted runner registry is persisted as a CAS-backed network aggregate and replays idempotently', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-trusted-runner-registry-store-'));
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  const signer = createInMemoryHumanSigner({ human_id: 'human-1' });
  const identity = await signer.getPublicIdentity();
  try {
    await stateStore.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2026-08-02T12:00:00.000Z' });
    const initialization = await createHumanAuthoritySetInitialization({ signer, network_id: 'network-1', mutation_id: 'authority-1', expected_revision: 1, reason: 'initialize owner authority', occurred_at: '2026-08-02T12:00:01.000Z' });
    assert.equal((await recordHumanAuthoritySetInitialization({ stateStore, initialization, now: '2026-08-02T12:00:01.000Z' })).status, 'recorded');
    const mutation = await createTrustedRunnerRegistryMutation({ signer, network_id: 'network-1', mutation_id: 'mutation-1', action: 'register', runner_id: 'runner-1', new_public_key_fingerprint: 'a'.repeat(64), capabilities: ['process-boundary'], reason: 'enroll', occurred_at: '2026-08-02T12:00:02.000Z', expected_revision: 2 });
    const first = await recordTrustedRunnerRegistryMutation({ stateStore, mutation, expected_revision: 2, now: '2026-08-02T12:00:02.000Z' });
    assert.equal(first.status, 'recorded');
    assert.equal(first.revision, 3);
    assert.equal(first.snapshot.registry[0].status, 'active');
    assert.equal(first.snapshot.revision, 3);
    assert.equal(first.snapshot.digest, trustedRunnerRegistrySnapshotDigest(first.snapshot.registry));

    const capabilityUpdate = await createTrustedRunnerRegistryMutation({ signer, network_id: 'network-1', mutation_id: 'mutation-capabilities-1', action: 'update-capabilities', runner_id: 'runner-1', old_capabilities_digest: trustedRunnerCapabilitiesDigest(['process-boundary']), capabilities: ['process-boundary', 'secure-signing'], reason: 'declare signing capability', occurred_at: '2026-08-02T12:00:03.000Z', expected_revision: 3 });
    const updated = await recordTrustedRunnerRegistryMutation({ stateStore, mutation: capabilityUpdate, expected_revision: 3, now: '2026-08-02T12:00:03.000Z' });
    assert.equal(updated.status, 'recorded');
    assert.deepEqual(updated.snapshot.registry[0].capabilities, ['process-boundary', 'secure-signing']);

    const duplicate = await recordTrustedRunnerRegistryMutation({ stateStore, mutation, expected_revision: 2, now: '2026-08-02T12:00:04.000Z' });
    assert.equal(duplicate.status, 'duplicate');
    assert.equal(duplicate.revision, 4);

    const stale = await recordTrustedRunnerRegistryMutation({ stateStore, mutation: { ...mutation, mutation_id: 'mutation-2' }, expected_revision: 2, now: '2026-08-02T12:00:05.000Z' });
    assert.equal(stale.status, 'conflict');
    assert.equal(stale.reason, 'revision-mismatch');

    const reopened = await readTrustedRunnerRegistry({ stateStore, network_id: 'network-1' });
    assert.deepEqual(reopened.snapshot.registry, updated.snapshot.registry);
    assert.deepEqual(reopened.history.map((item) => item.mutation_id), ['mutation-1', 'mutation-capabilities-1']);
  } finally {
    await stateStore.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('trusted runner registry blocks mutation when the Human authority set is not initialized', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-trusted-runner-registry-uninitialized-'));
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  const signer = createInMemoryHumanSigner({ human_id: 'human-1' });
  try {
    await stateStore.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2026-08-02T13:00:00.000Z' });
    const mutation = await createTrustedRunnerRegistryMutation({ signer, network_id: 'network-1', mutation_id: 'mutation-1', action: 'register', runner_id: 'runner-1', new_public_key_fingerprint: 'b'.repeat(64), reason: 'enroll', occurred_at: '2026-08-02T13:00:01.000Z', expected_revision: 1 });
    const result = await recordTrustedRunnerRegistryMutation({ stateStore, mutation, expected_revision: 1, now: '2026-08-02T13:00:01.000Z' });
    assert.equal(result.status, 'blocked');
    assert.equal(result.reason, 'human-authority-set-not-initialized');
    assert.equal(await stateStore.getRevision('network-1'), 1);
  } finally {
    await stateStore.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('trusted runner registry blocks a mutation signed by a non-active Human authority', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-trusted-runner-registry-non-active-'));
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  const owner = createInMemoryHumanSigner({ human_id: 'human-owner' });
  const nonActive = createInMemoryHumanSigner({ human_id: 'human-other' });
  try {
    await stateStore.createNetwork({ network_id: 'network-1', owner_id: 'human-owner', now: '2026-08-02T14:00:00.000Z' });
    const initialization = await createHumanAuthoritySetInitialization({ signer: owner, network_id: 'network-1', mutation_id: 'authority-1', expected_revision: 1, reason: 'initialize owner authority', occurred_at: '2026-08-02T14:00:01.000Z' });
    assert.equal((await recordHumanAuthoritySetInitialization({ stateStore, initialization, now: '2026-08-02T14:00:01.000Z' })).status, 'recorded');
    const mutation = await createTrustedRunnerRegistryMutation({ signer: nonActive, network_id: 'network-1', mutation_id: 'mutation-1', action: 'register', runner_id: 'runner-1', new_public_key_fingerprint: 'c'.repeat(64), reason: 'unauthorized enrollment', occurred_at: '2026-08-02T14:00:02.000Z', expected_revision: 2 });
    const result = await recordTrustedRunnerRegistryMutation({ stateStore, mutation, expected_revision: 2, now: '2026-08-02T14:00:02.000Z' });
    assert.equal(result.status, 'blocked');
    assert.equal(result.reason, 'human-identity-mismatch');
    assert.equal(await stateStore.getRevision('network-1'), 2);
  } finally {
    await stateStore.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('trusted runner registry blocks a mutation whose Human identity drifts from its signed payload', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-trusted-runner-registry-identity-drift-'));
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  const signer = createInMemoryHumanSigner({ human_id: 'human-1' });
  try {
    await stateStore.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2026-08-02T15:00:00.000Z' });
    const initialization = await createHumanAuthoritySetInitialization({ signer, network_id: 'network-1', mutation_id: 'authority-1', expected_revision: 1, reason: 'initialize owner authority', occurred_at: '2026-08-02T15:00:01.000Z' });
    assert.equal((await recordHumanAuthoritySetInitialization({ stateStore, initialization, now: '2026-08-02T15:00:01.000Z' })).status, 'recorded');
    const mutation = await createTrustedRunnerRegistryMutation({ signer, network_id: 'network-1', mutation_id: 'mutation-1', action: 'register', runner_id: 'runner-1', new_public_key_fingerprint: 'd'.repeat(64), reason: 'enroll', occurred_at: '2026-08-02T15:00:02.000Z', expected_revision: 2 });
    const drifted = { ...mutation, human_id: 'human-drifted' };
    const result = await recordTrustedRunnerRegistryMutation({ stateStore, mutation: drifted, expected_revision: 2, now: '2026-08-02T15:00:02.000Z' });
    assert.equal(result.status, 'blocked');
    assert.equal(result.reason, 'human-identity-mismatch');
    assert.equal(await stateStore.getRevision('network-1'), 2);
  } finally {
    await stateStore.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('Human authority set initialization is idempotent for the same signed mutation', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-human-authority-set-duplicate-'));
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  const signer = createInMemoryHumanSigner({ human_id: 'human-1' });
  try {
    await stateStore.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2026-08-02T16:00:00.000Z' });
    const initialization = await createHumanAuthoritySetInitialization({ signer, network_id: 'network-1', mutation_id: 'authority-1', expected_revision: 1, reason: 'initialize owner authority', occurred_at: '2026-08-02T16:00:01.000Z' });
    const first = await recordHumanAuthoritySetInitialization({ stateStore, initialization, now: '2026-08-02T16:00:01.000Z' });
    assert.equal(first.status, 'recorded');
    const duplicate = await recordHumanAuthoritySetInitialization({ stateStore, initialization, now: '2026-08-02T16:00:02.000Z' });
    assert.equal(duplicate.status, 'duplicate');
    assert.deepEqual(duplicate.snapshot, first.snapshot);
    assert.equal(await stateStore.getRevision('network-1'), 2);
  } finally {
    await stateStore.close();
    await rm(root, { recursive: true, force: true });
  }
});
