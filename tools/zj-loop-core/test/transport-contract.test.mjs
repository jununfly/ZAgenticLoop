import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTransportEnvelope, transportEnvelopeDigest, validateTransportEnvelope } from '../dist/transport-contract.js';

const digest = (value) => `sha256:${value.repeat(64)}`;
const envelope = (overrides = {}) => createTransportEnvelope({
  message_id: 'message-1', network_id: 'network-1', event_id: 'event-1', plan_id: 'plan-1', plan_revision: 1,
  task_id: 'task-1', from_node_id: 'node-1', target_node_id: 'node-2', notification_kind: 'evidence-available',
  state: 'available', artifact_refs: [{ artifact_id: digest('2'), content_sha256: digest('2'), kind: 'evidence' }],
  created_at: '2026-07-31T12:00:00.000Z', expires_at: '2026-07-31T12:05:00.000Z', ...overrides,
});

test('provider-neutral TransportEnvelope carries bounded references and validates its canonical digest', () => {
  const item = envelope();
  assert.equal(item.schema, 'zj-loop.transport_envelope.v1');
  assert.equal('payload' in item, false);
  assert.equal(item.side_effects_executed, false);
  assert.equal(transportEnvelopeDigest(item), item.envelope_digest);
  assert.equal(validateTransportEnvelope(item).status, 'valid');
});

test('TransportEnvelope rejects cross-scope, expired, and tampered messages', () => {
  const item = envelope();
  assert.equal(validateTransportEnvelope({ ...item, network_id: 'network-2' }).status, 'blocked');
  assert.equal(validateTransportEnvelope({ ...item, expires_at: '2026-07-31T11:59:00.000Z' }).status, 'blocked');
  assert.equal(validateTransportEnvelope({ ...item, envelope_digest: digest('9') }).status, 'blocked');
  assert.throws(() => createTransportEnvelope({ ...item, artifact_refs: [], envelope_digest: undefined }), { message: 'transport-envelope-invalid' });
});
