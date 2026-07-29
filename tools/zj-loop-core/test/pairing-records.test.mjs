import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPairingRequestedRecord, createPairingApprovedRecord, createPairingRejectedRecord, createPairingExpiredRecord } from '../dist/pairing-records.js';

test('Pairing record builders derive deterministic lifecycle event IDs and bind request digest', () => {
  const request = { request_id: 'pair-1', network_id: 'network-1', node_id: 'node-1', identity: { certificate_sha256: 'a'.repeat(64) }, endpoint: 'loopback://127.0.0.1:1', requested_capabilities: ['event.consume'], expires_at: '2026-07-30T00:10:00.000Z' };
  const record = createPairingRequestedRecord({ request });
  assert.equal(record.type, 'pairing-requested');
  assert.equal(record.event_id, 'pairing-requested:pair-1');
  assert.match(record.request_digest, /^[0-9a-f]{64}$/);
  assert.equal(record.request.request_id, request.request_id);
});

test('Pairing decision records preserve the request digest and deterministic operation identity', () => {
  const request = { request_id: 'pair-2', network_id: 'network-1', node_id: 'node-1', request_digest: 'a'.repeat(64), expires_at: '2026-07-30T00:10:00.000Z', requested_capabilities: ['event.consume'] };
  const approval = { request_id: 'pair-2', network_id: 'network-1', node_id: 'node-1', human_id: 'human-1', approved_capabilities: ['event.consume'], approved_at: '2026-07-29T00:05:00.000Z' };
  assert.deepEqual(createPairingApprovedRecord({ request, approval }), { type: 'human-approved', event_id: 'pairing-approved:pair-2:human-1', occurred_at: approval.approved_at, network_id: request.network_id, request_id: request.request_id, request_digest: request.request_digest, human_id: approval.human_id, approved_capabilities: approval.approved_capabilities });
  assert.equal(createPairingRejectedRecord({ request, human_id: 'human-1', rejected_at: '2026-07-29T00:06:00.000Z', reason: 'not-needed' }).event_id, 'pairing-rejected:pair-2:human-1');
  assert.equal(createPairingExpiredRecord({ request, expired_at: '2026-07-30T00:10:00.000Z' }).event_id, 'pairing-expired:pair-2');
});
