import test from 'node:test';
import assert from 'node:assert/strict';
import { runProviderRuntimeCli } from '../dist/provider-runtime-cli.js';

const binding = { service_id: 'service-cli', pid: 42, socket_path: '/tmp/runtime.sock' };
function io() { const output = []; return { output, io: { stdout: (value) => output.push(JSON.parse(value)), stderr: () => {} } }; }

test('Provider Runtime CLI status is read-only and returns the lifecycle projection', async () => {
  const capture = io();
  const code = await runProviderRuntimeCli(['status', '--binding', '/tmp/binding.json', '--json'], capture.io, {
    read_binding: async () => binding,
    lifecycle: { status: async () => ({ status: 'ready', service_id: 'service-cli', pid: 42, socket_path: '/tmp/runtime.sock' }), stop: async () => ({ status: 'stopped', service_id: 'service-cli', pid: 42 }) },
  });
  assert.equal(code, 0);
  assert.deepEqual(capture.output[0], { schema: 'zj-loop.provider_runtime_cli.v1', status: 'ready', service_id: 'service-cli', pid: 42, socket_path: '/tmp/runtime.sock', side_effects_executed: false });
});

test('Provider Runtime CLI stop remains blocked when process identity is unavailable', async () => {
  const capture = io();
  let terminated = false;
  const code = await runProviderRuntimeCli(['stop', '--binding', '/tmp/binding.json', '--json'], capture.io, {
    read_binding: async () => binding,
    lifecycle: { status: async () => ({ status: 'outcome-uncertain', service_id: 'service-cli', pid: 42, socket_path: '/tmp/runtime.sock' }), stop: async () => ({ status: 'blocked', reason: 'provider-runtime-process-identity-unavailable' }) },
    terminate: async () => { terminated = true; },
  });
  assert.equal(code, 2);
  assert.equal(terminated, false);
  assert.deepEqual(capture.output[0], { schema: 'zj-loop.provider_runtime_cli.v1', status: 'blocked', reason: 'provider-runtime-process-identity-unavailable', side_effects_executed: false });
});

test('Provider Runtime CLI does not claim start before foreground bootstrap is configured', async () => {
  const capture = io();
  const code = await runProviderRuntimeCli(['start', '--binding', '/tmp/binding.json', '--json'], capture.io, { read_binding: async () => binding });
  assert.equal(code, 2);
  assert.deepEqual(capture.output[0], { schema: 'zj-loop.provider_runtime_cli.v1', status: 'blocked', reason: 'provider-runtime-start-bootstrap-not-configured', side_effects_executed: false });
});
