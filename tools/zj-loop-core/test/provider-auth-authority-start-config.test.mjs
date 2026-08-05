import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { validateProviderAuthAuthorityStartConfig } from '../dist/provider-auth-authority-start-config.js';
import { readProviderAuthAuthorityStartConfig } from '../dist/provider-auth-authority-start-config-store.js';

const digest = (value) => `sha256:${Buffer.from(value).toString('hex').padEnd(64, '0').slice(0, 64)}`;
const config = (root) => ({ schema: 'zj-loop.provider_auth_authority_start_config.v1', network_id: 'network-1', socket_path: path.join(root, 'authority.sock'), correlation_id: 'authority-correlation', expected_peer_identity_digest: 'a'.repeat(64), authority_contract_digest: digest('contract'), authority_identity_digest: digest('authority'), state_store_identity_digest: digest('state-store'), state_store_path: path.join(root, 'state.db'), binding_path: path.join(root, 'binding.json'), process_identity_digest: digest('process') });

test('Authority start config validates a secret-free absolute-path contract and loads it', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-authority-config-'));
  const value = config(root);
  assert.deepEqual(validateProviderAuthAuthorityStartConfig(value), { status: 'valid', config: value });
  const file = path.join(root, 'config.json');
  await writeFile(file, JSON.stringify(value));
  assert.deepEqual(await readProviderAuthAuthorityStartConfig(file), value);
});

test('Authority start config rejects secrets, unknown fields, relative paths, and malformed JSON', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-authority-config-invalid-'));
  const value = config(root);
  assert.equal(validateProviderAuthAuthorityStartConfig({ ...value, token: 'secret' }).status, 'blocked');
  assert.equal(validateProviderAuthAuthorityStartConfig({ ...value, unexpected: true }).status, 'blocked');
  assert.equal(validateProviderAuthAuthorityStartConfig({ ...value, state_store_path: 'state.db' }).status, 'blocked');
  const file = path.join(root, 'bad.json');
  await writeFile(file, '{');
  await assert.rejects(() => readProviderAuthAuthorityStartConfig(file), /read-failed/);
});

test('Authority start config requires macOS helper path and digest as a pair', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-authority-config-helper-'));
  const value = config(root);
  assert.equal(validateProviderAuthAuthorityStartConfig({ ...value, macos_helper_path: path.join(root, 'helper') }).status, 'blocked');
  assert.equal(validateProviderAuthAuthorityStartConfig({ ...value, macos_helper_digest: digest('helper') }).status, 'blocked');
  assert.equal(validateProviderAuthAuthorityStartConfig({ ...value, macos_helper_path: path.join(root, 'helper'), macos_helper_digest: digest('helper') }).status, 'valid');
});
