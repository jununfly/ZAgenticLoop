import assert from 'node:assert/strict';
import { access, mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createProviderAuthAuthorityForegroundService } from '../dist/provider-auth-authority-foreground-service.js';

const digest = (value) => `sha256:${Buffer.from(value).toString('hex').padEnd(64, '0').slice(0, 64)}`;
const binding = (root) => ({ service_id: 'authority-1', network_id: 'network-1', socket_path: path.join(root, 'authority.sock'), authority_contract_digest: digest('contract'), state_store_identity_digest: digest('state-store'), state_store_path: path.join(root, 'state.db'), process_identity_digest: digest('process') });

function launcher(readiness, close = async () => {}) {
  const calls = { start: 0, close: 0 };
  return { calls, value: { async start() { calls.start += 1; }, async readiness() { return readiness; }, async close() { calls.close += 1; await close(); } } };
}

test('Authority foreground start closes launcher and leaves no binding on readiness or socket mismatch', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-authority-foreground-failure-'));
  const blocked = launcher({ status: 'blocked', reason: 'peer-unavailable' });
  const first = createProviderAuthAuthorityForegroundService({ launcher: blocked.value, binding_path: path.join(root, 'blocked.json'), binding: binding(root) });
  await assert.rejects(() => first.start(), /peer-unavailable/);
  assert.deepEqual(blocked.calls, { start: 1, close: 1 });

  const mismatch = launcher({ status: 'ready', socket_path: path.join(root, 'other.sock') });
  const second = createProviderAuthAuthorityForegroundService({ launcher: mismatch.value, binding_path: path.join(root, 'mismatch.json'), binding: binding(root) });
  await assert.rejects(() => second.start(), /socket-binding-mismatch/);
  assert.deepEqual(mismatch.calls, { start: 1, close: 1 });

  const startFailure = launcher({ status: 'ready', socket_path: path.join(root, 'authority.sock') }, async () => {});
  startFailure.value.start = async () => { startFailure.calls.start += 1; throw new Error('start-failed'); };
  const third = createProviderAuthAuthorityForegroundService({ launcher: startFailure.value, binding_path: path.join(root, 'start-failed.json'), binding: binding(root) });
  await assert.rejects(() => third.start(), /start-failed/);
  assert.deepEqual(startFailure.calls, { start: 1, close: 1 });
});

test('Authority foreground binding persistence failure closes launcher and stop uncertainty preserves binding', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-authority-foreground-persist-'));
  const broken = launcher({ status: 'ready', socket_path: path.join(root, 'authority.sock') });
  const brokenService = createProviderAuthAuthorityForegroundService({ launcher: broken.value, binding_path: root, binding: binding(root), process_id: 1234, now: () => '2026-08-05T23:00:00.000Z' });
  await assert.rejects(() => brokenService.start());
  assert.deepEqual(broken.calls, { start: 1, close: 1 });

  const closeFailure = launcher({ status: 'ready', socket_path: path.join(root, 'authority.sock') }, async () => { throw new Error('close-failed'); });
  const file = path.join(root, 'binding.json');
  const service = createProviderAuthAuthorityForegroundService({ launcher: closeFailure.value, binding_path: file, binding: binding(root), process_id: 1234, now: () => '2026-08-05T23:00:00.000Z' });
  await service.start();
  assert.deepEqual(await service.stop(), { status: 'outcome-uncertain', reason: 'provider-auth-authority-close-failed' });
  await access(file);
});
