import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';
import { createProviderAuthAuthorityRevokeRequest } from '../dist/provider-auth-authority-ipc-protocol.js';
import { createProviderAuthStateStoreAuthorityIpcServer, createProviderAuthStateStoreRevocationAuthority } from '../dist/provider-auth-revocation-authority.js';
import { revokeProviderAuthRefOverIpc } from '../dist/provider-auth-authority-ipc.js';

const digest = (value) => `sha256:${Buffer.from(value).toString('hex').padEnd(64, '0').slice(0, 64)}`;
function request() { return createProviderAuthAuthorityRevokeRequest({ request_id: 'request-1', network_id: 'network-1', runtime_id: 'runtime-1', runtime_binding: { runtime_identity_fingerprint: digest('identity'), runtime_manifest_digest: digest('manifest'), provider_capabilities_digest: digest('capabilities') }, auth_ref_id: 'auth-ref-1', auth_ref_digest: digest('ref'), authority_contract_digest: digest('authority-contract'), revoke_reason: 'cleanup' }); }

test('StateStore revocation authority records an append-only fact and returns duplicate on retry', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-revocation-authority-'));
  const store = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  await store.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2026-08-05T12:00:00.000Z' });
  const authority = createProviderAuthStateStoreRevocationAuthority({ state_store: store, network_id: 'network-1', authority_identity_digest: digest('authority'), now: () => '2026-08-05T12:01:00.000Z' });
  assert.equal((await authority.revoke(request())).status, 'revoked');
  assert.equal((await authority.revoke(request())).status, 'duplicate');
  const events = await store.readEvents({ network_id: 'network-1', aggregate_type: 'provider-auth-ref', aggregate_id: 'auth-ref-1' });
  assert.equal(events.events.length, 1);
  assert.equal(events.events[0].payload.secret, undefined);
  await store.close();
});

test('StateStore revocation authority blocks network drift and reports unavailable store uncertainty', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-revocation-authority-blocked-'));
  const store = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  const authority = createProviderAuthStateStoreRevocationAuthority({ state_store: store, network_id: 'network-1', authority_identity_digest: digest('authority') });
  assert.equal((await authority.revoke({ ...request(), network_id: 'network-2' })).status, 'blocked');
  await store.close();
  assert.equal((await authority.revoke(request())).status, 'outcome-uncertain');
});

test('Authority IPC server projects Runtime revoke into one network-scoped StateStore fact', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-revocation-authority-ipc-'));
  const socketPath = path.join(root, 'authority.sock');
  const store = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  await store.createNetwork({ network_id: 'network-1', owner_id: 'human-1' });
  const current = { ...request(), socket_path: socketPath, correlation_id: 'authority-corr', timeout_ms: 1_000 };
  const { server } = createProviderAuthStateStoreAuthorityIpcServer({ socket_path: socketPath, correlation_id: current.correlation_id, expected_authority_contract_digest: current.authority_contract_digest, verify_peer: () => true, state_store: store, network_id: 'network-1', authority_identity_digest: digest('authority') });
  await server.start();
  assert.equal((await revokeProviderAuthRefOverIpc(current)).status, 'revoked');
  assert.equal((await revokeProviderAuthRefOverIpc(current)).status, 'duplicate');
  const events = await store.readEvents({ network_id: 'network-1', aggregate_type: 'provider-auth-ref' });
  assert.equal(events.events.length, 1);
  await server.close();
  await store.close();
});
