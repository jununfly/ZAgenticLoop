import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';
import { runOpnTransportCli } from '../dist/opn-transport-cli.js';

test('transport CLI local-send writes a structured offered fact without exposing payload secrets', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-opn-transport-cli-'));
  const output = [];
  const statePath = path.join(root, 'state.db');
  const stateStore = createSqliteStateStore({ filename: statePath });
  await stateStore.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2026-08-07T10:00:00.000Z' });
  await stateStore.close();
  try {
    assert.equal(await runOpnTransportCli(['local-send', '--state-store', statePath, '--network-id', 'network-1', '--node-id', 'endpoint:network-1', '--target-node-id', 'agent-1', '--message-id', 'cli-message-1'], { stdout: (value) => output.push(value), stderr: () => {} }), 0);
    const result = JSON.parse(output[0]);
    assert.equal(result.status, 'sent');
    assert.equal('token' in result, false);
    const reopened = createSqliteStateStore({ filename: statePath });
    const events = await reopened.readEvents({ network_id: 'network-1', aggregate_type: 'opn-transport-message', aggregate_id: 'cli-message-1' });
    assert.equal(events.events[0].event_type, 'opn.transport.message.offered');
    await reopened.close();
  } finally { await rm(root, { recursive: true, force: true }); }
});
