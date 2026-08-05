import assert from 'node:assert/strict';
import { access, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createProviderAuthAuthorityBinding, persistProviderAuthAuthorityBinding } from '../dist/provider-auth-authority-binding.js';
import { createProviderAuthAuthorityExternalStartController } from '../dist/provider-auth-authority-external-start-controller.js';

const digest = (value) => `sha256:${Buffer.from(value).toString('hex').padEnd(64, '0').slice(0, 64)}`;

async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-authority-controller-'));
  const config = { schema: 'zj-loop.provider_auth_authority_start_config.v1', network_id: 'network-1', socket_path: path.join(root, 'authority.sock'), correlation_id: 'authority-controller', expected_peer_identity_digest: 'a'.repeat(64), authority_contract_digest: digest('contract'), authority_identity_digest: digest('authority'), state_store_identity_digest: digest('state-store'), state_store_path: path.join(root, 'state.db'), binding_path: path.join(root, 'binding.json'), process_identity_digest: digest('process') };
  const configPath = path.join(root, 'config.json');
  await writeFile(configPath, JSON.stringify(config));
  return { root, config, configPath };
}

test('Authority start controller waits for and validates persisted binding, then confirms cleanup', async () => {
  const { root, config, configPath } = await setup();
  const binding = createProviderAuthAuthorityBinding({ service_id: 'provider-auth-authority:network-1', network_id: config.network_id, socket_path: config.socket_path, authority_contract_digest: config.authority_contract_digest, state_store_identity_digest: config.state_store_identity_digest, state_store_path: config.state_store_path, process_identity_digest: config.process_identity_digest, pid: 4242, started_at: '2026-08-06T00:00:00.000Z' });
  let running = false;
  const launcher = { async start() { running = true; await persistProviderAuthAuthorityBinding(config.binding_path, binding); }, async readiness() { return { status: 'ready', socket_path: config.socket_path }; }, async close() { running = false; await import('node:fs/promises').then(({ unlink }) => unlink(config.binding_path)); } };
  const controller = await createProviderAuthAuthorityExternalStartController({ config_path: configPath, create_launcher: async () => launcher });
  const started = await controller.start();
  assert.equal(started.status, 'started');
  assert.equal(started.binding.pid, 4242);
  assert.equal(running, true);
  assert.deepEqual(await controller.stop(), { status: 'stopped' });
  assert.equal(running, false);
  await assert.rejects(() => access(config.binding_path));
  void root;
});

test('Authority start controller rejects stale binding and reports cleanup residue as uncertainty', async () => {
  const { config, configPath } = await setup();
  const stale = createProviderAuthAuthorityBinding({ service_id: 'provider-auth-authority:network-1', network_id: 'network-other', socket_path: config.socket_path, authority_contract_digest: config.authority_contract_digest, state_store_identity_digest: config.state_store_identity_digest, state_store_path: config.state_store_path, process_identity_digest: config.process_identity_digest, pid: 4242, started_at: '2026-08-06T00:00:00.000Z' });
  await persistProviderAuthAuthorityBinding(config.binding_path, stale);
  const launcher = { async start() {}, async readiness() { return { status: 'ready', socket_path: config.socket_path }; }, async close() {} };
  const controller = await createProviderAuthAuthorityExternalStartController({ config_path: configPath, create_launcher: async () => launcher });
  await assert.rejects(() => controller.start(), /binding-already-exists/);

  const fresh = await setup();
  const residue = createProviderAuthAuthorityBinding({ service_id: 'provider-auth-authority:network-1', network_id: fresh.config.network_id, socket_path: fresh.config.socket_path, authority_contract_digest: fresh.config.authority_contract_digest, state_store_identity_digest: fresh.config.state_store_identity_digest, state_store_path: fresh.config.state_store_path, process_identity_digest: fresh.config.process_identity_digest, pid: 4242, started_at: '2026-08-06T00:00:00.000Z' });
  const residueLauncher = { async start() { await persistProviderAuthAuthorityBinding(fresh.config.binding_path, residue); }, async readiness() { return { status: 'ready', socket_path: fresh.config.socket_path }; }, async close() {} };
  const residueController = await createProviderAuthAuthorityExternalStartController({ config_path: fresh.configPath, create_launcher: async () => residueLauncher });
  await residueController.start();
  assert.deepEqual(await residueController.stop(), { status: 'outcome-uncertain', reason: 'provider-auth-authority-binding-residue' });
});
