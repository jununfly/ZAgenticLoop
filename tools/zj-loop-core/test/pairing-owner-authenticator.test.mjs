import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInMemoryHumanAuthorityProvider } from '../dist/human-authority.js';
import { createPairingOwnerAuthenticator } from '../dist/pairing-owner-authenticator.js';

test('development pairing owner authenticator accepts a signed Human approval bound to the mTLS device', async () => {
  const peerFingerprint = 'a'.repeat(64);
  const authority = createInMemoryHumanAuthorityProvider({
    human_id: 'human-1',
    protocol_version: 'v2',
    network_id: 'network-1',
    device_key_id: 'mac-device-1',
    device_fingerprint: peerFingerprint,
  });
  const context = await authority.signApprovalContext({
    action: 'pairing.approve',
    request_id: 'pair-1',
    request_digest: 'b'.repeat(64),
    network_id: 'network-1',
    device_key_id: 'mac-device-1',
    device_fingerprint: peerFingerprint,
    approved_capabilities: ['event.consume'],
    issued_at: '2026-08-07T00:00:00.000Z',
    expires_at: '2026-08-07T00:05:00.000Z',
  });
  const authenticator = createPairingOwnerAuthenticator({
    identity: authority.getPublicIdentity(),
    owner_token: 'dev-owner-token',
    now: () => '2026-08-07T00:01:00.000Z',
  });

  assert.deepEqual(await authenticator.authenticate({
    action: 'pairing.list',
    authorization: 'Bearer dev-owner-token',
  }), { status: 'allowed', human_id: 'human-1' });
  assert.deepEqual(await authenticator.authenticate({
    action: 'pairing.approve',
    authorization: 'Bearer dev-owner-token',
    request_id: 'pair-1',
    request_digest: 'b'.repeat(64),
    context,
    require_v2: true,
    peer_fingerprint: peerFingerprint,
  }), { status: 'allowed', human_id: 'human-1' });
});

test('development pairing owner authenticator blocks invalid token, stale context, and device drift', async () => {
  const peerFingerprint = 'a'.repeat(64);
  const authority = createInMemoryHumanAuthorityProvider({
    human_id: 'human-1',
    protocol_version: 'v2',
    network_id: 'network-1',
    device_key_id: 'mac-device-1',
    device_fingerprint: peerFingerprint,
  });
  const context = await authority.signApprovalContext({
    action: 'pairing.approve',
    request_id: 'pair-1',
    request_digest: 'b'.repeat(64),
    network_id: 'network-1',
    device_key_id: 'mac-device-1',
    device_fingerprint: peerFingerprint,
    approved_capabilities: ['event.consume'],
    issued_at: '2026-08-06T23:00:00.000Z',
    expires_at: '2026-08-07T00:00:30.000Z',
  });
  const authenticator = createPairingOwnerAuthenticator({
    identity: authority.getPublicIdentity(),
    owner_token: 'dev-owner-token',
    now: () => '2026-08-07T00:01:00.000Z',
  });

  assert.deepEqual(await authenticator.authenticate({
    action: 'pairing.list',
    authorization: 'Bearer wrong-token',
  }), { status: 'blocked', reason: 'owner-not-authorized' });
  assert.deepEqual(await authenticator.authenticate({
    action: 'pairing.approve',
    authorization: 'Bearer dev-owner-token',
    request_id: 'pair-1',
    request_digest: 'b'.repeat(64),
    context,
    require_v2: true,
    peer_fingerprint: peerFingerprint,
  }), { status: 'blocked', reason: 'owner-not-authorized' });
  assert.deepEqual(await authenticator.authenticate({
    action: 'pairing.approve',
    authorization: 'Bearer dev-owner-token',
    request_id: 'pair-1',
    request_digest: 'b'.repeat(64),
    context,
    require_v2: true,
    peer_fingerprint: 'c'.repeat(64),
  }), { status: 'blocked', reason: 'owner-not-authorized' });
});
