import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createInMemoryHumanSigner } from '../dist/human-signer.js';
import { createProviderRuntimeArtifactApproval } from '../dist/provider-runtime-artifact-approval.js';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';
import { createHumanAuthoritySetInitializationFromStore, recordHumanAuthoritySetInitialization, createHumanAuthoritySetMutationFromStore, recordHumanAuthoritySetMutation } from '../dist/human-authority-set-store.js';
import { readProviderRuntimeArtifactApproval, recordProviderRuntimeArtifactApproval } from '../dist/provider-runtime-artifact-approval-store.js';
import { verifyProviderRuntimeTrustBeforeLaunch } from '../dist/provider-runtime-launcher-factory.js';

const manifest = { artifact_id: 'runtime-1', manifest_digest: 'sha256:' + 'a'.repeat(64), profile: 'development-local', platform: 'darwin' };

async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-runtime-approval-store-'));
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  const signer = createInMemoryHumanSigner({ human_id: 'human-owner' });
  await stateStore.createNetwork({ network_id: 'network-1', owner_id: 'human-owner', now: '2026-08-06T10:00:00.000Z' });
  const init = await createHumanAuthoritySetInitializationFromStore({ stateStore, signer, network_id: 'network-1', mutation_id: 'authority-1', expected_revision: 1, reason: 'initialize', occurred_at: '2026-08-06T10:00:01.000Z' });
  assert.equal(init.status, 'ready');
  assert.equal((await recordHumanAuthoritySetInitialization({ stateStore, initialization: init.initialization })).status, 'recorded');
  return { root, stateStore, signer };
}

async function approval(signer, overrides = {}) {
  return createProviderRuntimeArtifactApproval({ signer, network_id: 'network-1', node_id: 'node-1', device_id: 'device-1', manifest, approval_id: 'approval-1', revision: 1, issued_at: '2026-08-06T10:01:00.000Z', expires_at: '2026-09-06T10:01:00.000Z', ...overrides });
}

test('runtime artifact approval is persisted and resolved from the network StateStore', async () => {
  const fixture = await setup();
  try {
    const record = await recordProviderRuntimeArtifactApproval({ stateStore: fixture.stateStore, approval: await approval(fixture.signer), expected_revision: 2, now: '2026-08-06T10:02:00.000Z' });
    assert.equal(record.status, 'recorded');
    assert.equal(record.revision, 3);
    const resolved = await readProviderRuntimeArtifactApproval({ stateStore: fixture.stateStore, expected: { network_id: 'network-1', node_id: 'node-1', device_id: 'device-1', manifest }, now: '2026-08-06T10:03:00.000Z' });
    assert.equal(resolved.status, 'valid');
    assert.equal(resolved.approval.approval_id, 'approval-1');
    assert.equal(resolved.state_revision, 3);
  } finally { await fixture.stateStore.close(); await rm(fixture.root, { recursive: true, force: true }); }
});

test('runtime launcher trust gate requires the persisted Human approval after artifact verification', async () => {
  const fixture = await setup();
  try {
    const config = { network_id: 'network-1', runtime_id: 'node-1' };
    const verify_artifact = async () => ({ status: 'verified', manifest });
    const missing = await verifyProviderRuntimeTrustBeforeLaunch({ verify_artifact, state_store: fixture.stateStore, config, now: '2026-08-06T10:03:00.000Z' });
    assert.deepEqual(missing, { status: 'blocked', reason: 'artifact-approval-missing' });
    await recordProviderRuntimeArtifactApproval({ stateStore: fixture.stateStore, approval: await approval(fixture.signer, { node_id: 'node-1', device_id: 'node-1' }), expected_revision: 2 });
    const admitted = await verifyProviderRuntimeTrustBeforeLaunch({ verify_artifact, state_store: fixture.stateStore, config, now: '2026-08-06T10:03:00.000Z' });
    assert.equal(admitted.status, 'verified');
  } finally { await fixture.stateStore.close(); await rm(fixture.root, { recursive: true, force: true }); }
});

test('runtime artifact approval recording is idempotent and rejects approval-id conflicts', async () => {
  const fixture = await setup();
  try {
    const firstApproval = await approval(fixture.signer);
    assert.equal((await recordProviderRuntimeArtifactApproval({ stateStore: fixture.stateStore, approval: firstApproval, expected_revision: 2 })).status, 'recorded');
    assert.equal((await recordProviderRuntimeArtifactApproval({ stateStore: fixture.stateStore, approval: firstApproval, expected_revision: 2 })).status, 'duplicate');
    const conflicting = await approval(fixture.signer, { expires_at: '2026-10-06T10:01:00.000Z' });
    const result = await recordProviderRuntimeArtifactApproval({ stateStore: fixture.stateStore, approval: conflicting, expected_revision: 2 });
    assert.equal(result.status, 'conflict');
    assert.equal(result.reason, 'artifact-approval-id-conflict');
  } finally { await fixture.stateStore.close(); await rm(fixture.root, { recursive: true, force: true }); }
});

test('cross-device approval is explicit and device reads do not shadow one another', async () => {
  const fixture = await setup();
  try {
    const first = await approval(fixture.signer, { approval_id: 'approval-device-1', device_id: 'device-1' });
    assert.equal((await recordProviderRuntimeArtifactApproval({ stateStore: fixture.stateStore, approval: first, expected_revision: 2 })).status, 'recorded');
    const copied = await readProviderRuntimeArtifactApproval({ stateStore: fixture.stateStore, expected: { network_id: 'network-1', node_id: 'node-1', device_id: 'device-2', manifest }, now: '2026-08-06T10:03:00.000Z' });
    assert.equal(copied.status, 'blocked');
    assert.equal(copied.reason, 'artifact-approval-context-mismatch');
    const second = await approval(fixture.signer, { approval_id: 'approval-device-2', device_id: 'device-2' });
    assert.equal((await recordProviderRuntimeArtifactApproval({ stateStore: fixture.stateStore, approval: second, expected_revision: 3 })).status, 'recorded');
    const deviceOne = await readProviderRuntimeArtifactApproval({ stateStore: fixture.stateStore, expected: { network_id: 'network-1', node_id: 'node-1', device_id: 'device-1', manifest }, now: '2026-08-06T10:03:00.000Z' });
    const deviceTwo = await readProviderRuntimeArtifactApproval({ stateStore: fixture.stateStore, expected: { network_id: 'network-1', node_id: 'node-1', device_id: 'device-2', manifest }, now: '2026-08-06T10:03:00.000Z' });
    assert.equal(deviceOne.status, 'valid');
    assert.equal(deviceTwo.status, 'valid');
  } finally { await fixture.stateStore.close(); await rm(fixture.root, { recursive: true, force: true }); }
});

test('runtime artifact approval cannot be recorded by an inactive Human and cannot be resolved after revocation', async () => {
  const fixture = await setup();
  const replacement = createInMemoryHumanSigner({ human_id: 'human-replacement' });
  try {
    const unauthorized = createInMemoryHumanSigner({ human_id: 'human-other' });
    const blocked = await recordProviderRuntimeArtifactApproval({ stateStore: fixture.stateStore, approval: await approval(unauthorized), expected_revision: 2 });
    assert.equal(blocked.status, 'blocked');
    assert.equal(blocked.reason, 'human-identity-mismatch');
    assert.equal((await recordProviderRuntimeArtifactApproval({ stateStore: fixture.stateStore, approval: await approval(fixture.signer), expected_revision: 2 })).status, 'recorded');
    const mutation = await createHumanAuthoritySetMutationFromStore({ stateStore: fixture.stateStore, signer: fixture.signer, network_id: 'network-1', mutation_id: 'authority-rotate', action: 'rotate', authority: await fixture.signer.getPublicIdentity(), replacement: await replacement.getPublicIdentity(), expected_revision: 3, reason: 'rotate', occurred_at: '2026-08-06T10:04:00.000Z' });
    assert.equal(mutation.status, 'ready');
    assert.equal((await recordHumanAuthoritySetMutation({ stateStore: fixture.stateStore, mutation: mutation.mutation, expected_revision: 3 })).status, 'recorded');
    const resolved = await readProviderRuntimeArtifactApproval({ stateStore: fixture.stateStore, expected: { network_id: 'network-1', node_id: 'node-1', device_id: 'device-1', manifest }, now: '2026-08-06T10:05:00.000Z' });
    assert.equal(resolved.status, 'blocked');
    assert.equal(resolved.reason, 'artifact-approval-revoked');
  } finally { await fixture.stateStore.close(); await rm(fixture.root, { recursive: true, force: true }); }
});
