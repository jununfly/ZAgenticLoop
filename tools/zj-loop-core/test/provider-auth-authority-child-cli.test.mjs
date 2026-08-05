import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, mkdtemp, readFile, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { test } from 'node:test';

const digest = (value) => `sha256:${Buffer.from(value).toString('hex').padEnd(64, '0').slice(0, 64)}`;
const fileDigest = async (file) => `sha256:${createHash('sha256').update(await readFile(file)).digest('hex')}`;

test('Authority child CLI starts as a real foreground process and removes binding on SIGTERM', { skip: process.platform !== 'darwin' }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-authority-child-'));
  const helper = '/bin/echo';
  const configPath = path.join(root, 'authority-config.json');
  const bindingPath = path.join(root, 'authority-binding.json');
  const socketPath = path.join(root, 'authority.sock');
  await writeFile(configPath, JSON.stringify({ schema: 'zj-loop.provider_auth_authority_start_config.v1', network_id: 'network-1', socket_path: socketPath, correlation_id: 'authority-child', expected_peer_identity_digest: 'a'.repeat(64), authority_contract_digest: digest('contract'), authority_identity_digest: digest('authority'), state_store_identity_digest: digest('state-store'), state_store_path: path.join(root, 'state.db'), binding_path: bindingPath, process_identity_digest: digest('process'), macos_helper_path: helper, macos_helper_digest: await fileDigest(helper) }));
  const child = spawn(process.execPath, ['../dist/provider-auth-authority-child-cli.js', '--config', configPath], { cwd: path.dirname(new URL(import.meta.url).pathname), stdio: ['ignore', 'pipe', 'pipe'] });
  const output = [];
  child.stdout.on('data', (chunk) => output.push(chunk.toString()));
  child.stderr.on('data', (chunk) => output.push(chunk.toString()));
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { await access(bindingPath); break; } catch { await new Promise((resolve) => setTimeout(resolve, 20)); }
  }
  await access(bindingPath);
  child.kill('SIGTERM');
  const exit = await new Promise((resolve) => child.once('close', (code, signal) => resolve({ code, signal })));
  assert.deepEqual(exit, { code: 0, signal: null }, output.join(''));
  await assert.rejects(() => access(bindingPath));
  await assert.rejects(() => access(socketPath));
  await unlink(configPath);
});
