import test from 'node:test';
import assert from 'node:assert/strict';
import { acquireOpnEndpointLock, classifyOpnEndpointStatus, createOpnEndpointBinding, opnEndpointConfigDigest, opnEndpointRuntimePaths, validateOpnEndpointBinding } from '../dist/opn-endpoint-supervisor.js';
import { mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const config = { bind: '127.0.0.1', port: 43123, network_id: 'network-1', state_store: '/tmp/state.db', server_key: '/tmp/server.key', server_cert: '/tmp/server.cert', client_ca: '/tmp/ca.cert', session_ttl_minutes: 50 };

test('endpoint config digest is stable across object key order', () => {
  assert.equal(opnEndpointConfigDigest(config), opnEndpointConfigDigest({ session_ttl_minutes: 50, client_ca: '/tmp/ca.cert', server_cert: '/tmp/server.cert', server_key: '/tmp/server.key', state_store: '/tmp/state.db', network_id: 'network-1', port: 43123, bind: '127.0.0.1' }));
});

test('binding records the exact config digest and command', () => {
  const binding = createOpnEndpointBinding({ pid: 1234, started_at: '2026-08-10T00:00:00.000Z', config, command: ['node', 'serve'] });
  assert.equal(binding.schema, 'zj-loop.opn_endpoint_binding.v1');
  assert.equal(binding.config_digest, opnEndpointConfigDigest(config));
  assert.deepEqual(validateOpnEndpointBinding(binding), binding);
});

test('status distinguishes stale, unreachable, starting and running', () => {
  const binding = createOpnEndpointBinding({ pid: 1234, config, command: ['node', 'serve'] });
  assert.equal(classifyOpnEndpointStatus({ binding, config: { ...config, port: 43124 }, process_alive: true, healthz: 'ok' }).status, 'stale');
  assert.equal(classifyOpnEndpointStatus({ binding, config, process_alive: true, healthz: 'failed' }).status, 'unreachable');
  assert.equal(classifyOpnEndpointStatus({ binding, config, process_alive: true, healthz: 'unknown' }).status, 'starting');
  assert.equal(classifyOpnEndpointStatus({ binding, config, process_alive: true, healthz: 'ok' }).status, 'running');
});

test('missing binding and dead process are explicit stopped states', () => {
  assert.deepEqual(classifyOpnEndpointStatus({ binding: null, config, process_alive: false, healthz: 'unknown' }), { status: 'stopped', reason: 'binding-missing' });
  const binding = createOpnEndpointBinding({ pid: 1234, config, command: ['node', 'serve'] });
  assert.deepEqual(classifyOpnEndpointStatus({ binding, config, process_alive: false, healthz: 'unknown' }), { status: 'stopped', reason: 'process-not-running' });
});

test('endpoint lock rejects a live owner and can recover a stale owner', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-opn-lock-'));
  const lockPath = opnEndpointRuntimePaths(root).lock;
  const first = await acquireOpnEndpointLock(lockPath);
  await assert.rejects(() => acquireOpnEndpointLock(lockPath), { message: 'opn-endpoint-already-running' });
  await first.release();
  const second = await acquireOpnEndpointLock(lockPath);
  await second.release();
});
