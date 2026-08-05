import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createProviderRuntimeStartAssembly } from '../dist/provider-runtime-start-assembly.js';

const digest = (value) => `sha256:${Buffer.from(value).toString('hex').padEnd(64, '0').slice(0, 64)}`;
const config = (root) => ({ schema: 'zj-loop.provider_runtime_start_config.v1', network_id: 'network-1', runtime_id: 'runtime-1', provider_ids: ['codex'], socket_path: path.join(root, 'runtime.sock'), correlation_id: 'correlation-1', expected_peer_identity_digest: 'a'.repeat(64), provider_executable: '/usr/bin/codex', working_directory: '/tmp', contract_digest: digest('contract'), adapter_contract_digest: digest('adapter'), runtime_binding: { runtime_identity_fingerprint: digest('identity'), runtime_manifest_digest: digest('manifest'), provider_capabilities_digest: digest('capabilities') }, state_store_path: path.join(root, 'state.db'), binding_path: path.join(root, 'binding.json') });

test('Runtime start assembly binds StateStore resolver to network and keeps issue/secret authority outside service', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-runtime-assembly-'));
  const current = config(root);
  const launcher = { start: async () => {}, readiness: async () => ({ status: 'ready', socket_path: current.socket_path }), close: async () => {} };
  let revokeCalls = 0;
  const assembly = createProviderRuntimeStartAssembly({ config: current, process_identity_digest: digest('process'), process_id: 4321, revoke_ref: async () => { revokeCalls += 1; return { status: 'revoked' }; }, create_launcher: ({ runtime }) => { assert.equal(typeof runtime.verify, 'function'); return launcher; } });
  assert.equal((await assembly.runtime.issueRef({ network_id: 'network-1', node_id: 'node-1', provider_id: 'codex', execution_id: 'execution-1', attempt: 1, audience: 'audience', scope: [], secret: 'secret', issued_at: '2026-08-05T12:00:00.000Z', expires_at: '2026-08-05T13:00:00.000Z', human_authorized: true })).reason, 'provider-auth-runtime-service-issue-not-permitted');
  assert.equal((await assembly.runtime.consumeSecret({ ref: {}, network_id: 'network-1', node_id: 'node-1', provider_id: 'codex', execution_id: 'execution-1', attempt: 1 })).reason, 'provider-auth-runtime-service-secret-not-permitted');
  assert.equal(revokeCalls, 0);
  await assembly.close();
});
