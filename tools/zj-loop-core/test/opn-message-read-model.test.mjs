import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTransportEnvelope } from '../dist/transport-contract.js';
import { createOpnMessageReadModel } from '../dist/opn-message-read-model.js';

const digest = (value) => `sha256:${value.repeat(64)}`;
const envelope = createTransportEnvelope({ message_id: 'message-1', network_id: 'network-1', event_id: 'event-1', plan_id: 'plan-1', plan_revision: 1, task_id: 'task-1', from_node_id: 'Agent1', target_node_id: 'Agent2', notification_kind: 'evidence-available', state: 'available', artifact_refs: [{ artifact_id: digest('a'), content_sha256: digest('a'), kind: 'evidence' }], created_at: '2026-08-07T10:00:00.000Z', expires_at: '2026-08-07T11:00:00.000Z' });

test('OPN message read model preserves transport identity and points to artifact inspection', () => {
  const model = createOpnMessageReadModel({ envelope, delivery_state: 'accepted' });
  assert.equal(model.schema, 'zj-loop.opn_message_read_model.v1');
  assert.equal(model.envelope_digest, envelope.envelope_digest);
  assert.equal(model.next_action, 'inspect-artifact');
  assert.equal(model.side_effects_executed, false);
});

test('OPN message read model maps retry and terminal delivery states explicitly', () => {
  assert.equal(createOpnMessageReadModel({ envelope, delivery_state: 'retry_scheduled' }).next_action, 'retry-delivery');
  assert.equal(createOpnMessageReadModel({ envelope, delivery_state: 'blocked' }).next_action, 'blocked');
  assert.equal(createOpnMessageReadModel({ envelope, delivery_state: 'acknowledged' }).next_action, 'none');
});
