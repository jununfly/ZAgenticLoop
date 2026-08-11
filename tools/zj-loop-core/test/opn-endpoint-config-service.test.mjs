import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { loadOpnEndpointConfig, opnEndpointConfigPath, writeOpnEndpointConfig } from '../dist/opn-endpoint-config.js';
import { createMacOsLaunchdPlist, createWindowsTaskSchedulerCommand, opnEndpointServiceLabel } from '../dist/opn-endpoint-service.js';
import { opnAgentWorkerServiceLabel } from '../dist/opn-agent-worker-service.js';

const config = (root) => ({ bind: '100.119.216.26', port: 43123, network_id: 'network-1', state_store: path.join(root, 'state.db'), server_key: path.join(root, 'server.key'), server_cert: path.join(root, 'server.cert'), client_ca: path.join(root, 'ca.cert'), session_ttl_minutes: 50 });

test('endpoint config is colocated with identity directory and resolves relative paths', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-opn-config-'));
  await writeFile(opnEndpointConfigPath(root), JSON.stringify({ schema: 'zj-loop.opn_endpoint_config.v1', ...config(root), state_store: 'state.db', server_key: 'server.key', server_cert: 'server.cert', client_ca: 'ca.cert' }));
  const loaded = await loadOpnEndpointConfig(root);
  assert.equal(loaded.state_store, path.join(root, 'state.db'));
  assert.equal(await writeOpnEndpointConfig(root, loaded), opnEndpointConfigPath(root));
  assert.equal(JSON.parse(await readFile(opnEndpointConfigPath(root), 'utf8')).schema, 'zj-loop.opn_endpoint_config.v1');
});

test('service definitions are deterministic and keep endpoint in foreground serve mode', () => {
  const spec = { label: opnEndpointServiceLabel('network-1'), executable: '/usr/local/bin/node', script: '/opt/opn-endpoint-cli.js', args: ['serve', '--identity-dir', '/Users/me/.zj-loop/identity'], runtime_dir: '/tmp/opn-runtime', working_directory: '/opt' };
  const plist = createMacOsLaunchdPlist(spec);
  assert.match(plist, /KeepAlive/);
  assert.match(plist, /<string>serve<\/string>/);
  const task = createWindowsTaskSchedulerCommand(spec);
  assert.equal(task.create[0], 'schtasks.exe');
  assert.ok(task.create.includes('/TR'));
});

test('worker service label is stable and scoped to network and node', () => {
  assert.equal(opnAgentWorkerServiceLabel('network-1', 'abcdef0123456789abcdef'), 'ZAgenticLoop-OPN-Agent-network-1-abcdef0123456789');
});

test('Windows service installation returns a short wrapper command instead of embedding the worker command', () => {
  const spec = { label: opnAgentWorkerServiceLabel('network-1', 'abcdef0123456789abcdef'), executable: 'C:\\Program Files\\nodejs\\node.exe', script: 'C:\\workspace\\tools\\opn-agent-runner-cli.js', args: ['worker', '--endpoint', 'https://100.119.216.26:43123', '--credential-token-file', 'C:\\zj-loop\\identity\\join-session.json.credential-token'], runtime_dir: 'C:\\zj-loop\\identity\\worker-runtime', working_directory: 'C:\\workspace\\repo' };
  assert.ok(spec.runtime_dir.length < 261);
});
