import assert from 'node:assert/strict';
import test from 'node:test';
import { runProviderAuthAuthorityCli } from '../dist/provider-auth-authority-cli.js';

const binding = { service_id: 'provider-auth-authority:network-1', pid: 42, socket_path: '/tmp/authority.sock' };
function io() { const output = []; return { output, io: { stdout: (value) => output.push(JSON.parse(value)), stderr: () => {} } }; }

test('Authority CLI status is read-only and returns lifecycle projection', async () => {
  const capture = io();
  const code = await runProviderAuthAuthorityCli(['status', '--binding', '/tmp/authority-binding.json', '--json'], capture.io, { read_binding: async () => binding, lifecycle: { status: async () => ({ status: 'ready', service_id: binding.service_id, pid: binding.pid, socket_path: binding.socket_path }), stop: async () => ({ status: 'stopped', service_id: binding.service_id, pid: binding.pid }) } });
  assert.equal(code, 0);
  assert.deepEqual(capture.output[0], { schema: 'zj-loop.provider_auth_authority_cli.v1', status: 'ready', service_id: binding.service_id, pid: 42, socket_path: binding.socket_path, side_effects_executed: false });
});

test('Authority CLI stop never terminates when process identity is unavailable', async () => {
  const capture = io();
  let terminated = false;
  const code = await runProviderAuthAuthorityCli(['stop', '--binding', '/tmp/authority-binding.json', '--json'], capture.io, { read_binding: async () => binding, lifecycle: { status: async () => ({ status: 'outcome-uncertain', service_id: binding.service_id, pid: binding.pid, socket_path: binding.socket_path }), stop: async () => ({ status: 'blocked', reason: 'provider-auth-authority-process-identity-unavailable' }) }, terminate: async () => { terminated = true; } });
  assert.equal(code, 2);
  assert.equal(terminated, false);
  assert.deepEqual(capture.output[0], { schema: 'zj-loop.provider_auth_authority_cli.v1', status: 'blocked', reason: 'provider-auth-authority-process-identity-unavailable', side_effects_executed: false });
});

test('Authority CLI stop maps binding residue to outcome-uncertain and never deletes it', async () => {
  const capture = io();
  const code = await runProviderAuthAuthorityCli(['stop', '--binding', '/tmp/authority-binding.json', '--json'], capture.io, { read_binding: async () => binding, lifecycle: { status: async () => ({ status: 'ready', service_id: binding.service_id, pid: binding.pid, socket_path: binding.socket_path }), stop: async () => ({ status: 'stopped', service_id: binding.service_id, pid: binding.pid }) }, binding_exists: async () => true });
  assert.equal(code, 2);
  assert.deepEqual(capture.output[0], { schema: 'zj-loop.provider_auth_authority_cli.v1', status: 'outcome-uncertain', reason: 'provider-auth-authority-binding-residue', side_effects_executed: false });
});

test('Authority CLI start stays foreground and stops exactly once on the first signal', async () => {
  const capture = io();
  const signalTarget = {
    listeners: new Map(),
    on(signal, listener) { this.listeners.set(signal, listener); },
    off(signal, listener) { if (this.listeners.get(signal) === listener) this.listeners.delete(signal); },
  };
  let stopCalls = 0;
  const controller = {
    async start() { return { status: 'started', binding }; },
    async stop() { stopCalls += 1; return { status: 'stopped' }; },
  };
  const run = runProviderAuthAuthorityCli(['start', '--config', '/tmp/authority-config.json', '--json'], capture.io, {
    create_controller: async () => controller,
    signal_target: signalTarget,
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(capture.output[0].status, 'started');
  assert.equal(stopCalls, 0);
  const onSigterm = signalTarget.listeners.get('SIGTERM');
  onSigterm();
  onSigterm();
  const code = await run;
  assert.equal(code, 0);
  assert.equal(stopCalls, 1);
  assert.deepEqual(capture.output[1], { schema: 'zj-loop.provider_auth_authority_cli.v1', status: 'stopped', signal: 'SIGTERM', side_effects_executed: true });
});

test('Authority CLI start reports stop uncertainty and returns nonzero', async () => {
  const capture = io();
  const signalTarget = {
    listeners: new Map(),
    on(signal, listener) { this.listeners.set(signal, listener); },
    off(signal, listener) { if (this.listeners.get(signal) === listener) this.listeners.delete(signal); },
  };
  const controller = {
    async start() { return { status: 'started', binding }; },
    async stop() { return { status: 'outcome-uncertain', reason: 'provider-auth-authority-binding-residue' }; },
  };
  const run = runProviderAuthAuthorityCli(['start', '--config', '/tmp/authority-config.json', '--json'], capture.io, {
    create_controller: async () => controller,
    signal_target: signalTarget,
  });
  await new Promise((resolve) => setImmediate(resolve));
  await signalTarget.listeners.get('SIGINT')();
  assert.equal(await run, 2);
  assert.deepEqual(capture.output[1], { schema: 'zj-loop.provider_auth_authority_cli.v1', status: 'outcome-uncertain', signal: 'SIGINT', reason: 'provider-auth-authority-binding-residue', side_effects_executed: false });
});

test('Authority CLI start converts an unexpected stop error to uncertainty', async () => {
  const capture = io();
  const signalTarget = {
    listeners: new Map(),
    on(signal, listener) { this.listeners.set(signal, listener); },
    off(signal, listener) { if (this.listeners.get(signal) === listener) this.listeners.delete(signal); },
  };
  const controller = {
    async start() { return { status: 'started', binding }; },
    async stop() { throw new Error('close failed'); },
  };
  const run = runProviderAuthAuthorityCli(['start', '--config', '/tmp/authority-config.json', '--json'], capture.io, {
    create_controller: async () => controller,
    signal_target: signalTarget,
  });
  await new Promise((resolve) => setImmediate(resolve));
  signalTarget.listeners.get('SIGTERM')();
  assert.equal(await run, 2);
  assert.deepEqual(capture.output[1], { schema: 'zj-loop.provider_auth_authority_cli.v1', status: 'outcome-uncertain', signal: 'SIGTERM', reason: 'provider-auth-authority-cli-stop-failed', side_effects_executed: false });
});

test('Authority CLI start maps controller startup failure to blocked', async () => {
  const capture = io();
  const code = await runProviderAuthAuthorityCli(['start', '--config', '/tmp/authority-config.json', '--json'], capture.io, {
    create_controller: async () => { throw new Error('provider-auth-authority-binding-mismatch'); },
  });
  assert.equal(code, 2);
  assert.deepEqual(capture.output[0], { schema: 'zj-loop.provider_auth_authority_cli.v1', status: 'blocked', reason: 'provider-auth-authority-binding-mismatch', side_effects_executed: false });
});
