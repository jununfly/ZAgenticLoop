import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInMemoryPairingRecordStore } from '../dist/pairing-record-store.js';

const record = { type: 'pairing-requested', event_id: 'pairing-requested:pair-1', occurred_at: '2026-07-29T00:00:00.000Z', network_id: 'network-1', request_digest: 'a'.repeat(64), request: { request_id: 'pair-1', network_id: 'network-1', node_id: 'node-1', endpoint: 'loopback://127.0.0.1:1', requested_capabilities: ['event.consume'], expires_at: '2026-07-30T00:00:00.000Z', identity: { certificate_sha256: 'b'.repeat(64) } } };

test('Pairing record store appends immutable records and makes identical retries idempotent', async () => {
  const store = createInMemoryPairingRecordStore();
  assert.equal((await store.append(record)).status, 'recorded');
  assert.equal((await store.append({ ...record, request: { ...record.request, requested_capabilities: [...record.request.requested_capabilities] } })).status, 'duplicate');
  assert.deepEqual(await store.list('network-1'), [record]);
});

test('Pairing record store rejects event ID reuse with different content', async () => {
  const store = createInMemoryPairingRecordStore();
  await store.append(record);
  await assert.rejects(() => store.append({ ...record, occurred_at: '2026-07-29T00:01:00.000Z' }), { message: 'pairing-event-conflict' });
});

test('Pairing record store never returns records from another network', async () => {
  const store = createInMemoryPairingRecordStore();
  await store.append(record);
  assert.deepEqual(await store.list('network-2'), []);
});

test('Pairing record store conditionally appends one lifecycle decision', async () => {
  const store = createInMemoryPairingRecordStore();
  await store.append(record);
  const decision = { type: 'pairing-rejected', event_id: 'pairing-rejected:pair-1:human-1', occurred_at: '2026-07-29T00:01:00.000Z', network_id: 'network-1', request_id: 'pair-1', request_digest: record.request_digest, reason: 'not-approved' };
  const now = '2026-07-29T00:01:00.000Z';
  assert.equal((await store.appendIfPending({ request_id: 'pair-1', request_digest: record.request_digest, record: decision, now })).status, 'recorded');
  await assert.rejects(() => store.appendIfPending({ request_id: 'pair-1', request_digest: record.request_digest, record: { ...decision, event_id: 'pairing-rejected:pair-1:human-2' }, now }), { message: 'pairing-state-conflict' });
  assert.equal((await store.appendIfPending({ request_id: 'pair-1', request_digest: record.request_digest, record: decision, now })).status, 'duplicate');
});
