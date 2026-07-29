import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectPairingRequests } from '../dist/pairing-projection.js';

const request = { request_id: 'pair-1', network_id: 'network-1', node_id: 'node-1', request_digest: 'a'.repeat(64), expires_at: '2026-07-29T00:10:00.000Z', requested_capabilities: ['event.consume'] };

test('Pairing projection reconstructs a pending request from append-only records', () => {
  const result = projectPairingRequests({ network_id: 'network-1', now: '2026-07-29T00:05:00.000Z', records: [{ type: 'pairing-requested', event_id: 'evt-1', occurred_at: '2026-07-29T00:00:00.000Z', request, request_digest: request.request_digest }] });
  assert.deepEqual(result, [{ ...request, status: 'pending', human_id: null, approved_capabilities: [], reason: null }]);
});

test('Pairing projection derives expiry without mutating canonical records', () => {
  const result = projectPairingRequests({ network_id: 'network-1', now: '2026-07-29T00:11:00.000Z', records: [{ type: 'pairing-requested', event_id: 'evt-1', occurred_at: '2026-07-29T00:00:00.000Z', request, request_digest: request.request_digest }] });
  assert.equal(result[0].status, 'expired');
  assert.equal(result[0].request_id, 'pair-1');
});

test('Pairing projection rejects illegal lifecycle transitions', () => {
  assert.throws(() => projectPairingRequests({ network_id: 'network-1', records: [
    { type: 'pairing-requested', event_id: 'evt-1', occurred_at: '2026-07-29T00:00:00.000Z', request, request_digest: request.request_digest },
    { type: 'pairing-rejected', event_id: 'evt-2', occurred_at: '2026-07-29T00:01:00.000Z', request_id: 'pair-1', request_digest: request.request_digest, reason: 'not-needed' },
    { type: 'human-approved', event_id: 'evt-3', occurred_at: '2026-07-29T00:02:00.000Z', request_id: 'pair-1', request_digest: request.request_digest, human_id: 'human-1', approved_capabilities: ['event.consume'] },
  ] }), { message: 'pairing-projection-conflict' });
});

test('Pairing projection does not expose records without a base request', () => {
  const result = projectPairingRequests({ network_id: 'network-1', records: [{ type: 'human-approved', event_id: 'evt-2', occurred_at: '2026-07-29T00:02:00.000Z', request_id: 'missing', request_digest: 'b'.repeat(64), human_id: 'human-1', approved_capabilities: [] }] });
  assert.deepEqual(result, []);
});
