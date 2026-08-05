import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createProviderAuthAuthorityIpcServer, revokeProviderAuthRefOverIpc } from '../dist/provider-auth-authority-ipc.js';

const digest = (value) => `sha256:${Buffer.from(value).toString('hex').padEnd(64, '0').slice(0, 64)}`;
const input = (socketPath) => ({ socket_path: socketPath, correlation_id: 'authority-corr', request_id: 'request-1', network_id: 'network-1', runtime_id: 'runtime-1', runtime_binding: { runtime_identity_fingerprint: digest('identity'), runtime_manifest_digest: digest('manifest'), provider_capabilities_digest: digest('capabilities') }, auth_ref_id: 'auth-ref-1', auth_ref_digest: digest('ref'), authority_contract_digest: digest('authority-contract'), revoke_reason: 'cleanup', timeout_ms: 1_000 });

test('Authority IPC completes one authenticated challenge plus revoke request and returns bound response', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-authority-ipc-'));
  const current = input(path.join(root, 'authority.sock'));
  const server = createProviderAuthAuthorityIpcServer({ socket_path: current.socket_path, correlation_id: current.correlation_id, expected_authority_contract_digest: current.authority_contract_digest, verify_peer: () => true, handle_revoke: async (request) => ({ status: 'revoked', request_id: request.request_id, network_id: request.network_id, runtime_id: request.runtime_id, request_digest: request.request_digest, event_digest: digest('event') }) });
  await server.start();
  const result = await revokeProviderAuthRefOverIpc(current);
  assert.equal(result.status, 'revoked');
  assert.equal(result.request_id, current.request_id);
  await server.close();
});

test('Authority IPC blocks contract drift and maps unavailable authority to outcome-uncertain', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-authority-ipc-blocked-'));
  const current = input(path.join(root, 'authority.sock'));
  const server = createProviderAuthAuthorityIpcServer({ socket_path: current.socket_path, correlation_id: current.correlation_id, expected_authority_contract_digest: digest('different'), verify_peer: () => true, handle_revoke: async () => { throw new Error('must-not-run'); } });
  await server.start();
  assert.deepEqual(await revokeProviderAuthRefOverIpc(current), { status: 'blocked', reason: 'provider-auth-authority-contract-mismatch' });
  await server.close();
  assert.deepEqual(await revokeProviderAuthRefOverIpc(current), { status: 'outcome-uncertain', reason: 'provider-auth-authority-ipc-unavailable' });
});
