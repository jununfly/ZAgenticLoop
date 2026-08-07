import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOpnConnectionReadModel } from '../dist/opn-connection-read-model.js';

const local = { node_id: 'mac-node', display_name: 'Mac Agent', agent_kind: 'agent', agent_version: 'dev' };
const peer = { request_id: 'win-request', network_id: 'network-1', node_id: 'win-node', request_digest: 'a'.repeat(64), expires_at: '2026-08-07T10:30:00.000Z', requested_capabilities: ['event.consume'], approved_capabilities: ['event.consume'], status: 'approved', human_id: 'human-1', reason: null, endpoint: 'tailscale://100.97.251.67' };

test('OPN connection read model projects an approved peer as connected without side effects', () => {
  assert.deepEqual(createOpnConnectionReadModel({ network_id: 'network-1', local_node: local, peers: [peer] }), {
    schema: 'zj-loop.opn_connection_read_model.v1',
    network_id: 'network-1',
    status: 'connected',
    local_node: local,
    peers: [{ request_id: 'win-request', node_id: 'win-node', status: 'approved', capabilities: ['event.consume'], endpoint: 'tailscale://100.97.251.67', expires_at: '2026-08-07T10:30:00.000Z', next_action: 'ready-for-co-work' }],
    side_effects_executed: false,
  });
});

test('OPN connection read model keeps pending and blocked next actions explicit', () => {
  const pending = { ...peer, status: 'pending', approved_capabilities: [] };
  const blocked = { ...peer, request_id: 'bad-request', status: 'projection-conflict' };
  assert.equal(createOpnConnectionReadModel({ network_id: 'network-1', local_node: local, peers: [pending] }).status, 'pending');
  assert.equal(createOpnConnectionReadModel({ network_id: 'network-1', local_node: local, peers: [blocked] }).status, 'blocked');
});
