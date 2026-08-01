import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInMemoryHumanSigner } from '../dist/human-signer.js';
import {
  createTrustedRunnerRegistryMutation,
  applyTrustedRunnerRegistryMutation,
  validateTrustedRunnerRegistryMutation,
} from '../dist/trusted-runner-registry.js';

test('trusted runner registry mutation is Human-signed and validates its append-only intent', async () => {
  const signer = createInMemoryHumanSigner({ human_id: 'human-1' });
  const mutation = await createTrustedRunnerRegistryMutation({
    signer,
    network_id: 'network-1',
    mutation_id: 'mutation-1',
    action: 'register',
    runner_id: 'runner-1',
    new_public_key_fingerprint: 'a'.repeat(64),
    reason: 'enroll trusted sandbox',
    occurred_at: '2026-08-01T12:00:00.000Z',
  });

  const identity = await signer.getPublicIdentity();
  assert.equal(validateTrustedRunnerRegistryMutation({ mutation, identity }).status, 'valid');
  assert.equal(mutation.side_effects_executed, false);
});

test('trusted runner registry rejects tampering and unsigned mutations', async () => {
  const signer = createInMemoryHumanSigner({ human_id: 'human-1' });
  const mutation = await createTrustedRunnerRegistryMutation({
    signer,
    network_id: 'network-1',
    mutation_id: 'mutation-2',
    action: 'revoke',
    runner_id: 'runner-1',
    old_public_key_fingerprint: 'a'.repeat(64),
    reason: 'runner retired',
    occurred_at: '2026-08-01T12:00:00.000Z',
  });
  const identity = await signer.getPublicIdentity();
  assert.equal(validateTrustedRunnerRegistryMutation({ mutation: { ...mutation, reason: 'tampered' }, identity }).status, 'blocked');
  assert.equal(validateTrustedRunnerRegistryMutation({ mutation: { ...mutation, signature: undefined }, identity }).status, 'blocked');
});

test('trusted runner registry applies only valid state transitions and makes replay idempotent', async () => {
  const signer = createInMemoryHumanSigner({ human_id: 'human-1' });
  const identity = await signer.getPublicIdentity();
  const register = await createTrustedRunnerRegistryMutation({ signer, network_id: 'network-1', mutation_id: 'mutation-3', action: 'register', runner_id: 'runner-1', new_public_key_fingerprint: 'a'.repeat(64), reason: 'enroll', occurred_at: '2026-08-01T12:00:00.000Z' });
  const first = applyTrustedRunnerRegistryMutation({ registry: [], history: [], mutation: register, identity });
  assert.equal(first.status, 'recorded');
  assert.equal(first.registry[0].status, 'active');
  const replay = applyTrustedRunnerRegistryMutation({ registry: first.registry, history: [register], mutation: register, identity });
  assert.equal(replay.status, 'duplicate');

  const invalidRotate = await createTrustedRunnerRegistryMutation({ signer, network_id: 'network-1', mutation_id: 'mutation-4', action: 'rotate', runner_id: 'runner-1', old_public_key_fingerprint: 'b'.repeat(64), new_public_key_fingerprint: 'c'.repeat(64), reason: 'wrong old key', occurred_at: '2026-08-01T12:01:00.000Z' });
  const blocked = applyTrustedRunnerRegistryMutation({ registry: first.registry, history: [register], mutation: invalidRotate, identity });
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.reason, 'registry-current-fingerprint-mismatch');
});
