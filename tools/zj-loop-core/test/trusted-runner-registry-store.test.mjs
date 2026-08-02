import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createInMemoryHumanSigner } from '../dist/human-signer.js';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';
import { createTrustedRunnerRegistryMutation, trustedRunnerCapabilitiesDigest } from '../dist/trusted-runner-registry.js';
import { admitTrustedRunnerExecution, createTrustedRunnerRegistryMutationFromStore, readTrustedRunnerRegistry, recordTrustedRunnerRegistryMutation, trustedRunnerRegistrySnapshotDigest } from '../dist/trusted-runner-registry-store.js';
import { createHumanAuthoritySetInitializationFromStore, createHumanAuthoritySetMutationFromStore, humanAuthoritySetDigest, recordHumanAuthoritySetInitialization, recordHumanAuthoritySetMutation } from '../dist/human-authority-set-store.js';

async function buildInitialization(input) {
  const result = await createHumanAuthoritySetInitializationFromStore(input);
  assert.equal(result.status, 'ready');
  return result.initialization;
}

test('trusted runner registry is persisted as a CAS-backed network aggregate and replays idempotently', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-trusted-runner-registry-store-'));
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  const signer = createInMemoryHumanSigner({ human_id: 'human-1' });
  const delegate = createInMemoryHumanSigner({ human_id: 'human-delegate' });
  const identity = await signer.getPublicIdentity();
  try {
    await stateStore.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2026-08-02T12:00:00.000Z' });
    const initialization = await buildInitialization({ stateStore, signer, network_id: 'network-1', mutation_id: 'authority-1', expected_revision: 1, reason: 'initialize owner authority', occurred_at: '2026-08-02T12:00:01.000Z' });
    assert.equal((await recordHumanAuthoritySetInitialization({ stateStore, initialization, now: '2026-08-02T12:00:01.000Z' })).status, 'recorded');
    const authorityAdd = await createHumanAuthoritySetMutationFromStore({ stateStore, signer, network_id: 'network-1', mutation_id: 'authority-add-1', action: 'add', authority: await delegate.getPublicIdentity(), expected_revision: 2, reason: 'delegate authority', occurred_at: '2026-08-02T12:00:02.000Z' });
    assert.equal(authorityAdd.status, 'ready');
    assert.equal((await recordHumanAuthoritySetMutation({ stateStore, mutation: authorityAdd.mutation, expected_revision: 2, now: '2026-08-02T12:00:02.000Z' })).status, 'recorded');
    const mutationResult = await createTrustedRunnerRegistryMutationFromStore({ stateStore, signer: delegate, network_id: 'network-1', mutation_id: 'mutation-1', action: 'register', runner_id: 'runner-1', new_public_key_fingerprint: 'a'.repeat(64), capabilities: ['process-boundary'], reason: 'enroll', occurred_at: '2026-08-02T12:00:03.000Z' });
    assert.equal(mutationResult.status, 'ready');
    const mutation = mutationResult.mutation;
    const first = await recordTrustedRunnerRegistryMutation({ stateStore, mutation, expected_revision: 3, now: '2026-08-02T12:00:03.000Z' });
    assert.equal(first.status, 'recorded');
    assert.equal(first.revision, 4);
    assert.equal(first.snapshot.registry[0].status, 'active');
    assert.equal(first.snapshot.revision, 4);
    assert.equal(first.snapshot.digest, trustedRunnerRegistrySnapshotDigest(first.snapshot.registry));

    const unknownCapability = await createTrustedRunnerRegistryMutationFromStore({ stateStore, signer: delegate, network_id: 'network-1', mutation_id: 'mutation-unknown-capability', action: 'update-capabilities', runner_id: 'runner-1', capabilities: ['unknown-capability'], reason: 'unknown capability', occurred_at: '2026-08-02T12:00:04.000Z' });
    assert.equal(unknownCapability.status, 'blocked');
    assert.equal(unknownCapability.reason, 'registry-capability-unknown');
    assert.equal(await stateStore.getRevision('network-1'), 4);

    const capabilityResult = await createTrustedRunnerRegistryMutationFromStore({ stateStore, signer: delegate, network_id: 'network-1', mutation_id: 'mutation-capabilities-1', action: 'update-capabilities', runner_id: 'runner-1', capabilities: ['process-boundary', 'secure-signing'], reason: 'declare signing capability', occurred_at: '2026-08-02T12:00:04.000Z' });
    assert.equal(capabilityResult.status, 'ready');
    const capabilityUpdate = capabilityResult.mutation;
    const updated = await recordTrustedRunnerRegistryMutation({ stateStore, mutation: capabilityUpdate, expected_revision: 4, now: '2026-08-02T12:00:04.000Z' });
    assert.equal(updated.status, 'recorded');
    assert.deepEqual(updated.snapshot.registry[0].capabilities, ['process-boundary', 'secure-signing']);
    const missingCapability = admitTrustedRunnerExecution({ snapshot: first.snapshot, runner_id: 'runner-1', required_capabilities: ['secure-signing'] });
    assert.equal(missingCapability.status, 'blocked');
    assert.equal(missingCapability.reason, 'registry-required-capability-missing');
    const admitted = admitTrustedRunnerExecution({ snapshot: updated.snapshot, runner_id: 'runner-1', required_capabilities: ['process-boundary', 'secure-signing'] });
    assert.equal(admitted.status, 'admitted');
    assert.equal(admitted.binding.registry_revision, updated.snapshot.revision);
    const unknownAdmissionCapability = admitTrustedRunnerExecution({ snapshot: updated.snapshot, runner_id: 'runner-1', required_capabilities: ['unknown-capability'] });
    assert.equal(unknownAdmissionCapability.status, 'blocked');
    assert.equal(unknownAdmissionCapability.reason, 'registry-capability-unknown');

    const duplicate = await recordTrustedRunnerRegistryMutation({ stateStore, mutation, expected_revision: 4, now: '2026-08-02T12:00:05.000Z' });
    assert.equal(duplicate.status, 'duplicate');
    assert.equal(duplicate.revision, 5);

    const stale = await recordTrustedRunnerRegistryMutation({ stateStore, mutation: { ...mutation, mutation_id: 'mutation-2' }, expected_revision: 4, now: '2026-08-02T12:00:06.000Z' });
    assert.equal(stale.status, 'conflict');
    assert.equal(stale.reason, 'mutation-revision-mismatch');

    const reopened = await readTrustedRunnerRegistry({ stateStore, network_id: 'network-1' });
    assert.deepEqual(reopened.snapshot.registry, updated.snapshot.registry);
    assert.deepEqual(reopened.history.map((item) => item.mutation_id), ['mutation-1', 'mutation-capabilities-1']);
  } finally {
    await stateStore.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('trusted runner registry replays historical mutations against the authority set at their revision', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-trusted-runner-registry-history-authority-'));
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  const owner = createInMemoryHumanSigner({ human_id: 'human-owner' });
  const delegate = createInMemoryHumanSigner({ human_id: 'human-delegate' });
  const replacement = createInMemoryHumanSigner({ human_id: 'human-replacement' });
  try {
    await stateStore.createNetwork({ network_id: 'network-1', owner_id: 'human-owner', now: '2026-08-02T11:00:00.000Z' });
    const initialization = await buildInitialization({ stateStore, signer: owner, network_id: 'network-1', mutation_id: 'authority-1', expected_revision: 1, reason: 'initialize owner authority', occurred_at: '2026-08-02T11:00:01.000Z' });
    assert.equal((await recordHumanAuthoritySetInitialization({ stateStore, initialization, now: '2026-08-02T11:00:01.000Z' })).status, 'recorded');
    const registryMutation = await createTrustedRunnerRegistryMutation({ signer: owner, network_id: 'network-1', mutation_id: 'mutation-historical-1', action: 'register', runner_id: 'runner-1', new_public_key_fingerprint: 'e'.repeat(64), reason: 'enroll before rotation', occurred_at: '2026-08-02T11:00:02.000Z', expected_revision: 2 });
    assert.equal((await recordTrustedRunnerRegistryMutation({ stateStore, mutation: registryMutation, expected_revision: 2, now: '2026-08-02T11:00:02.000Z' })).status, 'recorded');
    const ownerIdentity = await owner.getPublicIdentity();
    const delegateIdentity = await delegate.getPublicIdentity();
    const replacementIdentity = await replacement.getPublicIdentity();
    const add = await createHumanAuthoritySetMutationFromStore({ stateStore, signer: owner, network_id: 'network-1', mutation_id: 'authority-add-history', action: 'add', authority: delegateIdentity, expected_revision: 3, reason: 'delegate authority', occurred_at: '2026-08-02T11:00:03.000Z' });
    assert.equal(add.status, 'ready');
    assert.equal((await recordHumanAuthoritySetMutation({ stateStore, mutation: add.mutation, expected_revision: 3, now: '2026-08-02T11:00:03.000Z' })).status, 'recorded');
    const rotate = await createHumanAuthoritySetMutationFromStore({ stateStore, signer: delegate, network_id: 'network-1', mutation_id: 'authority-rotate-history', action: 'rotate', authority: ownerIdentity, replacement: replacementIdentity, expected_revision: 4, reason: 'rotate owner authority', occurred_at: '2026-08-02T11:00:04.000Z' });
    assert.equal(rotate.status, 'ready');
    assert.equal((await recordHumanAuthoritySetMutation({ stateStore, mutation: rotate.mutation, expected_revision: 4, now: '2026-08-02T11:00:04.000Z' })).status, 'recorded');
    const reopened = await readTrustedRunnerRegistry({ stateStore, network_id: 'network-1' });
    assert.deepEqual(reopened.history.map((item) => item.mutation_id), ['mutation-historical-1']);
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
    const initialization = await buildInitialization({ stateStore, signer: owner, network_id: 'network-1', mutation_id: 'authority-1', expected_revision: 1, reason: 'initialize owner authority', occurred_at: '2026-08-02T14:00:01.000Z' });
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
    const initialization = await buildInitialization({ stateStore, signer, network_id: 'network-1', mutation_id: 'authority-1', expected_revision: 1, reason: 'initialize owner authority', occurred_at: '2026-08-02T15:00:01.000Z' });
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
    const initialization = await buildInitialization({ stateStore, signer, network_id: 'network-1', mutation_id: 'authority-1', expected_revision: 1, reason: 'initialize owner authority', occurred_at: '2026-08-02T16:00:01.000Z' });
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

test('Human authority set replays add, rotate, and revoke mutations with CAS and last-authority protection', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-human-authority-set-mutations-'));
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  const owner = createInMemoryHumanSigner({ human_id: 'human-owner' });
  const delegate = createInMemoryHumanSigner({ human_id: 'human-delegate' });
  const replacement = createInMemoryHumanSigner({ human_id: 'human-replacement' });
  try {
    await stateStore.createNetwork({ network_id: 'network-1', owner_id: 'human-owner', now: '2026-08-02T17:00:00.000Z' });
    const ownerIdentity = await owner.getPublicIdentity();
    const delegateIdentity = await delegate.getPublicIdentity();
    const replacementIdentity = await replacement.getPublicIdentity();
    const initialization = await buildInitialization({ stateStore, signer: owner, network_id: 'network-1', mutation_id: 'authority-1', expected_revision: 1, reason: 'initialize owner authority', occurred_at: '2026-08-02T17:00:01.000Z' });
    assert.equal((await recordHumanAuthoritySetInitialization({ stateStore, initialization, now: '2026-08-02T17:00:01.000Z' })).status, 'recorded');

    const addResult = await createHumanAuthoritySetMutationFromStore({ stateStore, signer: owner, network_id: 'network-1', mutation_id: 'authority-add-1', action: 'add', authority: delegateIdentity, expected_revision: 2, reason: 'delegate authority', occurred_at: '2026-08-02T17:00:02.000Z' });
    assert.equal(addResult.status, 'ready');
    const add = addResult.mutation;
    const added = await recordHumanAuthoritySetMutation({ stateStore, mutation: add, expected_revision: 2, now: '2026-08-02T17:00:02.000Z' });
    assert.equal(added.status, 'recorded');
    assert.deepEqual(added.snapshot.active.map((item) => item.human_id).sort(), ['human-owner', 'human-delegate'].sort());

    const rotatedResult = await createHumanAuthoritySetMutationFromStore({ stateStore, signer: delegate, network_id: 'network-1', mutation_id: 'authority-rotate-1', action: 'rotate', authority: ownerIdentity, replacement: replacementIdentity, expected_revision: 3, reason: 'rotate owner authority', occurred_at: '2026-08-02T17:00:03.000Z' });
    assert.equal(rotatedResult.status, 'ready');
    const rotated = rotatedResult.mutation;
    const rotation = await recordHumanAuthoritySetMutation({ stateStore, mutation: rotated, expected_revision: 3, now: '2026-08-02T17:00:03.000Z' });
    assert.equal(rotation.status, 'recorded');
    assert.deepEqual(rotation.snapshot.active.map((item) => item.human_id).sort(), ['human-delegate', 'human-replacement'].sort());

    const revokedResult = await createHumanAuthoritySetMutationFromStore({ stateStore, signer: replacement, network_id: 'network-1', mutation_id: 'authority-revoke-1', action: 'revoke', authority: delegateIdentity, expected_revision: 4, reason: 'remove delegate authority', occurred_at: '2026-08-02T17:00:04.000Z' });
    assert.equal(revokedResult.status, 'ready');
    const revoked = revokedResult.mutation;
    const revocation = await recordHumanAuthoritySetMutation({ stateStore, mutation: revoked, expected_revision: 4, now: '2026-08-02T17:00:04.000Z' });
    assert.equal(revocation.status, 'recorded');
    assert.deepEqual(revocation.snapshot.active.map((item) => item.human_id), ['human-replacement']);

    const duplicate = await recordHumanAuthoritySetMutation({ stateStore, mutation: revoked, expected_revision: 4, now: '2026-08-02T17:00:05.000Z' });
    assert.equal(duplicate.status, 'duplicate');
    assert.deepEqual(duplicate.snapshot, revocation.snapshot);

    const lastRevoke = await createHumanAuthoritySetMutationFromStore({ stateStore, signer: replacement, network_id: 'network-1', mutation_id: 'authority-revoke-last', action: 'revoke', authority: replacementIdentity, expected_revision: 5, reason: 'remove final authority', occurred_at: '2026-08-02T17:00:06.000Z' });
    assert.equal(lastRevoke.status, 'blocked');
    assert.equal(lastRevoke.reason, 'authority-set-last-active-cannot-revoke');
    assert.equal(await stateStore.getRevision('network-1'), 5);
  } finally {
    await stateStore.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('Human authority mutation builder derives old and target digests from the StateStore snapshot', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-human-authority-set-builder-'));
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  const owner = createInMemoryHumanSigner({ human_id: 'human-owner' });
  const delegate = createInMemoryHumanSigner({ human_id: 'human-delegate' });
  const other = createInMemoryHumanSigner({ human_id: 'human-other' });
  try {
    await stateStore.createNetwork({ network_id: 'network-1', owner_id: 'human-owner', now: '2026-08-02T18:00:00.000Z' });
    const initialization = await buildInitialization({ stateStore, signer: owner, network_id: 'network-1', mutation_id: 'authority-1', expected_revision: 1, reason: 'initialize owner authority', occurred_at: '2026-08-02T18:00:01.000Z' });
    assert.equal((await recordHumanAuthoritySetInitialization({ stateStore, initialization, now: '2026-08-02T18:00:01.000Z' })).status, 'recorded');
    const mutationResult = await createHumanAuthoritySetMutationFromStore({ stateStore, signer: owner, network_id: 'network-1', mutation_id: 'authority-add-1', action: 'add', authority: await delegate.getPublicIdentity(), expected_revision: 2, reason: 'delegate authority', occurred_at: '2026-08-02T18:00:02.000Z' });
    assert.equal(mutationResult.status, 'ready');
    const mutation = mutationResult.mutation;
    const ownerIdentity = await owner.getPublicIdentity();
    const delegateIdentity = await delegate.getPublicIdentity();
    assert.equal(mutation.previous_authority_set_digest, humanAuthoritySetDigest([ownerIdentity]));
    assert.equal(mutation.target_authority_set_digest, humanAuthoritySetDigest([ownerIdentity, delegateIdentity]));
    assert.equal((await recordHumanAuthoritySetMutation({ stateStore, mutation, expected_revision: 2, now: '2026-08-02T18:00:02.000Z' })).status, 'recorded');
    const stale = await createHumanAuthoritySetMutationFromStore({ stateStore, signer: owner, network_id: 'network-1', mutation_id: 'authority-stale', action: 'add', authority: await other.getPublicIdentity(), expected_revision: 2, reason: 'stale mutation', occurred_at: '2026-08-02T18:00:03.000Z' });
    assert.equal(stale.status, 'conflict');
    assert.equal(stale.reason, 'human-authority-set-revision-mismatch');
    const unauthorized = await createHumanAuthoritySetMutationFromStore({ stateStore, signer: other, network_id: 'network-1', mutation_id: 'authority-unauthorized', action: 'add', authority: await other.getPublicIdentity(), expected_revision: 3, reason: 'unauthorized mutation', occurred_at: '2026-08-02T18:00:04.000Z' });
    assert.equal(unauthorized.status, 'blocked');
    assert.equal(unauthorized.reason, 'human-identity-mismatch');
  } finally {
    await stateStore.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('Human authority initialization builder binds the network owner and current StateStore revision', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-human-authority-set-init-builder-'));
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  const owner = createInMemoryHumanSigner({ human_id: 'human-owner' });
  const other = createInMemoryHumanSigner({ human_id: 'human-other' });
  try {
    await stateStore.createNetwork({ network_id: 'network-1', owner_id: 'human-owner', now: '2026-08-02T19:00:00.000Z' });
    const unauthorized = await createHumanAuthoritySetInitializationFromStore({ stateStore, signer: other, network_id: 'network-1', mutation_id: 'authority-unauthorized', expected_revision: 1, reason: 'unauthorized initialization', occurred_at: '2026-08-02T19:00:01.000Z' });
    assert.equal(unauthorized.status, 'blocked');
    assert.equal(unauthorized.reason, 'human-owner-mismatch');
    const stale = await createHumanAuthoritySetInitializationFromStore({ stateStore, signer: owner, network_id: 'network-1', mutation_id: 'authority-stale', expected_revision: 2, reason: 'stale initialization', occurred_at: '2026-08-02T19:00:01.000Z' });
    assert.equal(stale.status, 'conflict');
    assert.equal(stale.reason, 'human-authority-set-revision-mismatch');
    const ready = await createHumanAuthoritySetInitializationFromStore({ stateStore, signer: owner, network_id: 'network-1', mutation_id: 'authority-1', expected_revision: 1, reason: 'initialize owner authority', occurred_at: '2026-08-02T19:00:01.000Z' });
    assert.equal(ready.status, 'ready');
    assert.equal((await recordHumanAuthoritySetInitialization({ stateStore, initialization: ready.initialization, now: '2026-08-02T19:00:01.000Z' })).status, 'recorded');
  } finally {
    await stateStore.close();
    await rm(root, { recursive: true, force: true });
  }
});
