import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createNativeOpnTracerRelayEnvelope, createNativeOpnTracerRelayInbox } from '../dist/native-opn-tracer-relay.js';

const digest = (digit) => `sha256:${digit.repeat(64)}`;
const envelope = (overrides = {}) => createNativeOpnTracerRelayEnvelope({
  message_id: 'message-1',
  network_id: 'network-1',
  event_id: 'event-1',
  plan_id: 'plan-1',
  plan_revision: 1,
  from_node_id: 'agent-1',
  target_node_id: 'agent-2',
  notification_kind: 'execution-evidence-available',
  state: 'available',
  artifact_refs: [{ artifact_id: digest('2'), content_sha256: digest('2'), kind: 'execution-evidence' }],
  created_at: '2026-07-31T11:00:00.000Z',
  expires_at: '2026-07-31T11:05:00.000Z',
  ...overrides,
});

test('Native OPN Relay envelope carries only scoped references and Inbox is at-least-once idempotent', () => {
  const item = envelope();
  assert.equal('payload' in item, false);
  assert.equal(item.side_effects_executed, false);
  const inbox = createNativeOpnTracerRelayInbox({ network_id: 'network-1', node_id: 'agent-2', now: '2026-07-31T11:01:00.000Z' });
  assert.equal(inbox.accept(item).status, 'accepted');
  assert.equal(inbox.accept(item).status, 'duplicate');
  assert.equal(inbox.accept(envelope({ artifact_refs: [{ artifact_id: digest('3'), content_sha256: digest('3'), kind: 'execution-evidence' }] })).status, 'conflict');
});

test('Native OPN Relay Inbox blocks cross-scope and expired notifications', () => {
  const inbox = createNativeOpnTracerRelayInbox({ network_id: 'network-1', node_id: 'agent-2', now: '2026-07-31T11:06:00.000Z' });
  assert.equal(inbox.accept(envelope()).reason, 'relay-envelope-expired');
  assert.equal(inbox.accept(envelope({ message_id: 'message-2', network_id: 'network-2' })).reason, 'relay-envelope-network-mismatch');
  assert.equal(inbox.accept(envelope({ message_id: 'message-3', target_node_id: 'agent-3' })).reason, 'relay-envelope-target-mismatch');
});
