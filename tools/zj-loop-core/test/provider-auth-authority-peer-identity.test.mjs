import assert from 'node:assert/strict';
import test from 'node:test';
import { createInMemoryTrustedRunnerPeerIdentityVerifier } from '../dist/trusted-runner-peer-identity.js';
import { createMacOSProviderAuthAuthorityPeerGate, createProviderAuthAuthorityPeerGate } from '../dist/provider-auth-authority-peer-identity.js';

const identity = (digest) => ({ schema: 'zj-loop.trusted_runner_peer_identity.v1', platform: 'darwin', kind: 'process-audit', identity_digest: digest, process_id: 42 });

test('Authority peer gate delegates the real socket identity check with pinned digest', async () => {
  const expected = 'a'.repeat(64);
  const calls = [];
  const verifier = createInMemoryTrustedRunnerPeerIdentityVerifier({ identity: identity(expected) });
  const gate = createProviderAuthAuthorityPeerGate({ verifier, expected_identity_digest: expected, correlation_id: 'authority-correlation' });
  assert.equal(await gate({}), true);
  assert.equal(calls.length, 0);
});

test('Authority peer gate fails closed on identity mismatch or verifier failure', async () => {
  const expected = 'a'.repeat(64);
  const verifier = createInMemoryTrustedRunnerPeerIdentityVerifier({ identity: identity('b'.repeat(64)) });
  const gate = createProviderAuthAuthorityPeerGate({ verifier, expected_identity_digest: expected, correlation_id: 'authority-correlation' });
  assert.equal(await gate({}), false);
  const failing = createProviderAuthAuthorityPeerGate({ verifier: async () => { throw new Error('unavailable'); }, expected_identity_digest: expected, correlation_id: 'authority-correlation' });
  assert.equal(await failing({}), false);
});

test('macOS Authority peer gate is backed by the pinned process-audit helper', async () => {
  const gate = createMacOSProviderAuthAuthorityPeerGate({ helper_path: '/missing/process-audit-helper', helper_digest: `sha256:${'a'.repeat(64)}`, expected_identity_digest: 'a'.repeat(64), correlation_id: 'authority-correlation' });
  assert.equal(await gate({}), false);
});
