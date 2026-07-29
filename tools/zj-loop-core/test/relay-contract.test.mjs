import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acknowledgeDelivery, createRelaySession, scheduleDeliveryRetry, startDeliveryLease, transitionDelivery } from '../dist/relay-contract.js';

const baseDelivery = { delivery_id: 'delivery-1', attempt_id: 'attempt-0', network_id: 'network-1', event_id: 'event-1', task_id: 'task-1', target_node_id: 'node-1', state: 'offered', retry_count: 0 };

test('Relay contract bounds a session by credential expiry and keeps it authority-free', () => {
  const session = createRelaySession({ session_id: 'session-1', network_id: 'network-1', node_id: 'node-1', credential_id: 'credential-1', protocol_version: 'relay.v1', created_at: '2026-07-29T03:00:00.000Z', credential_expires_at: '2026-07-29T03:10:00.000Z', max_ttl_ms: 15 * 60 * 1000 });
  assert.equal(session.expires_at, '2026-07-29T03:10:00.000Z');
  assert.equal(session.status, 'active');
  assert.throws(() => createRelaySession({ session_id: 'session-2', network_id: 'network-1', node_id: 'node-1', credential_id: 'credential-1', protocol_version: 'relay.v1', created_at: '2026-07-29T03:00:00.000Z', credential_expires_at: '2026-07-29T03:00:00.000Z', max_ttl_ms: 15 * 60 * 1000 }), { message: 'session-expired' });
});

test('Relay contract requires accepted-before-ack and rejects stale or expired leases', () => {
  const leased = startDeliveryLease({ delivery: baseDelivery, attempt_id: 'attempt-1', now: '2026-07-29T03:00:00.000Z', lease_ms: 30_000 });
  assert.throws(() => acknowledgeDelivery({ delivery: leased, attempt_id: 'attempt-1', now: '2026-07-29T03:00:01.000Z' }), { message: 'delivery-not-accepted' });
  const accepted = transitionDelivery(leased, { state: 'accepted' });
  const acknowledged = acknowledgeDelivery({ delivery: accepted, attempt_id: 'attempt-1', now: '2026-07-29T03:00:01.000Z' });
  assert.equal(acknowledged.state, 'acknowledged');
  assert.throws(() => acknowledgeDelivery({ delivery: accepted, attempt_id: 'attempt-0', now: '2026-07-29T03:00:01.000Z' }), { message: 'delivery-attempt-stale' });
  assert.throws(() => acknowledgeDelivery({ delivery: accepted, attempt_id: 'attempt-1', now: '2026-07-29T03:00:31.000Z' }), { message: 'delivery-lease-expired' });
});

test('Relay contract makes retries bounded and prevents terminal state rollback', () => {
  const retry = scheduleDeliveryRetry({ delivery: baseDelivery, now: '2026-07-29T03:00:31.000Z', max_retries: 1, reason: 'connection-timeout' });
  assert.equal(retry.state, 'retry_scheduled');
  assert.equal(retry.retry_count, 1);
  const blocked = scheduleDeliveryRetry({ delivery: retry, now: '2026-07-29T03:00:32.000Z', max_retries: 1, reason: 'connection-timeout' });
  assert.equal(blocked.state, 'blocked');
  assert.throws(() => transitionDelivery(blocked, { state: 'offered' }), { message: 'delivery-state-conflict' });
});
