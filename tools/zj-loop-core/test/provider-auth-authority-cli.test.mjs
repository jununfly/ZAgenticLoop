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

test('Authority CLI keeps start blocked until supervisor ownership is configured', async () => {
  const capture = io();
  const code = await runProviderAuthAuthorityCli(['start', '--config', '/tmp/authority-config.json', '--json'], capture.io);
  assert.equal(code, 2);
  assert.deepEqual(capture.output[0], { schema: 'zj-loop.provider_auth_authority_cli.v1', status: 'blocked', reason: 'provider-auth-authority-start-supervisor-not-configured', side_effects_executed: false });
});
