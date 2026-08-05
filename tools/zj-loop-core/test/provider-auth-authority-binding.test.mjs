import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  createProviderAuthAuthorityBinding,
  persistProviderAuthAuthorityBinding,
  readProviderAuthAuthorityBinding,
  validateProviderAuthAuthorityBinding,
} from '../dist/provider-auth-authority-binding.js';

const digest = (value) => `sha256:${Buffer.from(value).toString('hex').padEnd(64, '0').slice(0, 64)}`;

function binding(root) {
  return createProviderAuthAuthorityBinding({
    service_id: 'authority-1',
    network_id: 'network-1',
    socket_path: path.join(root, 'authority.sock'),
    authority_contract_digest: digest('authority-contract'),
    state_store_identity_digest: digest('state-store-identity'),
    state_store_path: path.join(root, 'state.db'),
    process_identity_digest: digest('process'),
    pid: 4321,
    started_at: '2026-08-05T22:00:00.000Z',
  });
}

test('Authority binding is digest-bound, secret-free, and persisted with private permissions', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-authority-binding-'));
  const value = binding(root);
  assert.equal(validateProviderAuthAuthorityBinding(value).status, 'valid');
  assert.equal(Object.hasOwn(value, 'secret'), false);

  const file = path.join(root, 'binding.json');
  await persistProviderAuthAuthorityBinding(file, value);
  assert.equal((await stat(file)).mode & 0o777, 0o600);
  assert.deepEqual(await readProviderAuthAuthorityBinding(file), value);
});

test('Authority binding rejects digest drift, relative paths, and undeclared secret fields', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-authority-binding-invalid-'));
  const value = binding(root);
  assert.equal(validateProviderAuthAuthorityBinding({ ...value, binding_digest: digest('drift') }).status, 'blocked');
  assert.equal(validateProviderAuthAuthorityBinding({ ...value, socket_path: 'authority.sock' }).status, 'blocked');
  assert.equal(validateProviderAuthAuthorityBinding({ ...value, secret: 'nope' }).status, 'blocked');
  await assert.rejects(() => readFile(path.join(root, 'missing.json')));
});
