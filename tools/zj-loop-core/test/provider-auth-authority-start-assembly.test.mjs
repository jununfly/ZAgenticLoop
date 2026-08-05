import assert from 'node:assert/strict';
import { access, mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createProviderAuthAuthorityStartAssembly } from '../dist/provider-auth-authority-start-assembly.js';
import { revokeProviderAuthRefOverIpc } from '../dist/provider-auth-authority-ipc.js';

const digest = (value) => `sha256:${Buffer.from(value).toString('hex').padEnd(64, '0').slice(0, 64)}`;

test('Authority start assembly starts StateStore-backed IPC, persists binding, and stops cleanly', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-authority-start-assembly-'));
  const assembly = createProviderAuthAuthorityStartAssembly({
    socket_path: path.join(root, 'authority.sock'),
    correlation_id: 'authority-correlation',
    authority_contract_digest: digest('contract'),
    network_id: 'network-1',
    authority_identity_digest: digest('authority'),
    state_store_identity_digest: digest('state-store'),
    state_store_path: path.join(root, 'state.db'),
    binding_path: path.join(root, 'authority-binding.json'),
    process_identity_digest: digest('process'),
    verify_peer: () => true,
    process_id: 4321,
    now: () => '2026-08-05T23:00:00.000Z',
  });
  await assembly.state_store.createNetwork({ network_id: 'network-1', owner_id: 'human-1' });
  const started = await assembly.service.start();
  assert.equal(started.status, 'started');
  assert.equal(started.binding.network_id, 'network-1');
  assert.equal(started.binding.state_store_identity_digest, digest('state-store'));
  assert.equal((await revokeProviderAuthRefOverIpc({ socket_path: path.join(root, 'authority.sock'), correlation_id: 'authority-correlation', request_id: 'request-1', network_id: 'network-1', runtime_id: 'runtime-1', runtime_binding: { runtime_identity_fingerprint: digest('identity'), runtime_manifest_digest: digest('manifest'), provider_capabilities_digest: digest('capabilities') }, auth_ref_id: 'auth-ref-1', auth_ref_digest: digest('ref'), authority_contract_digest: digest('contract'), revoke_reason: 'cleanup' })).status, 'revoked');
  await access(path.join(root, 'authority-binding.json'));
  assert.deepEqual(await assembly.service.stop(), { status: 'stopped' });
  await assert.rejects(() => access(path.join(root, 'authority-binding.json')));
  await assembly.close();
});
