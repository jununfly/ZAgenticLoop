import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOpnAgentWorker } from '../dist/opn-agent-worker.js';

test('OPN Agent worker keeps one session across polls and closes it on stop', async () => {
  const calls = [];
  let processed = 0;
  const worker = createOpnAgentWorker({
    network_id: 'network-1',
    node_id: 'agent-1',
    transport: {
      async openSession(input) { calls.push(['open', input]); return { session_id: 'session-1' }; },
      async closeSession(input) { calls.push(['close', input]); },
    },
    processNext: async (input) => { calls.push(['process', input]); processed += 1; return { status: 'empty', side_effects_executed: false }; },
  });

  assert.deepEqual(await worker.runOnce(), { status: 'empty', side_effects_executed: false });
  assert.deepEqual(await worker.runOnce(), { status: 'empty', side_effects_executed: false });
  await worker.stop();

  assert.equal(processed, 2);
  assert.deepEqual(calls, [
    ['open', { network_id: 'network-1', node_id: 'agent-1' }],
    ['process', { session_id: 'session-1' }],
    ['process', { session_id: 'session-1' }],
    ['close', { session_id: 'session-1' }],
  ]);
});

test('OPN Agent worker reconnects after a session processing failure', async () => {
  const calls = [];
  let attempt = 0;
  const worker = createOpnAgentWorker({
    network_id: 'network-1',
    node_id: 'agent-1',
    transport: {
      async openSession() { const session_id = `session-${attempt + 1}`; calls.push(['open', session_id]); return { session_id }; },
      async closeSession(input) { calls.push(['close', input.session_id]); },
    },
    processNext: async ({ session_id }) => {
      calls.push(['process', session_id]);
      attempt += 1;
      if (attempt === 1) throw new Error('transport-session-expired');
      return { status: 'empty', side_effects_executed: false };
    },
  });

  await assert.rejects(worker.runOnce(), /transport-session-expired/);
  assert.deepEqual(await worker.runOnce(), { status: 'empty', side_effects_executed: false });
  await worker.stop();

  assert.deepEqual(calls, [
    ['open', 'session-1'],
    ['process', 'session-1'],
    ['close', 'session-1'],
    ['open', 'session-2'],
    ['process', 'session-2'],
    ['close', 'session-2'],
  ]);
});

test('OPN Agent worker closes its session when a bounded run ends', async () => {
  const calls = [];
  const worker = createOpnAgentWorker({
    network_id: 'network-1',
    node_id: 'agent-1',
    transport: {
      async openSession() { calls.push('open'); return { session_id: 'session-1' }; },
      async closeSession() { calls.push('close'); },
    },
    processNext: async () => ({ status: 'empty', side_effects_executed: false }),
  });

  assert.deepEqual(await worker.run({ max_iterations: 1, idle_delay_ms: 0 }), { iterations: 1, stopped: true });
  assert.deepEqual(calls, ['open', 'close']);
});
