import test from 'node:test';
import assert from 'node:assert/strict';
import { createInMemoryHumanSigner } from '../dist/human-signer.js';
import {
  createHumanActionRequest,
  createHumanActionDecision,
  verifyHumanActionDecision,
} from '../dist/human-action.js';

const base = {
  network_id: 'opn-dogfood-20260806',
  request_id: 'human-action-1',
  action_type: 'agent.result.review',
  reason: 'Agent produced a result that needs human confirmation.',
  context: { task_id: 'task-1', execution_id: 'execution-1' },
  evidence_refs: [{ artifact_id: `sha256:${'a'.repeat(64)}`, kind: 'artifact' }],
  requester_node_id: 'agent-1',
  created_at: '2026-08-07T10:00:00.000Z',
  expires_at: '2026-08-07T11:00:00.000Z',
};

test('human action request has a stable digest over reason, context, and evidence', () => {
  const request = createHumanActionRequest(base);
  assert.equal(request.schema, 'zj-loop.human_action_request.v1');
  assert.match(request.request_digest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(request.status, 'pending');
  assert.equal(request.side_effects_executed, false);
  assert.equal(createHumanActionRequest({ ...base }).request_digest, request.request_digest);
});

test('signed human decision verifies and is bound to the exact request', async () => {
  const signer = createInMemoryHumanSigner({ human_id: 'human-1' });
  const request = createHumanActionRequest(base);
  const decision = await createHumanActionDecision({ signer, request, decision: 'approved', decided_at: '2026-08-07T10:05:00.000Z', reason: 'Reviewed the evidence.' });
  assert.equal(decision.schema, 'zj-loop.human_action_decision.v1');
  assert.equal(verifyHumanActionDecision({ request, decision, now: '2026-08-07T10:06:00.000Z' }).status, 'valid');
  assert.equal(verifyHumanActionDecision({ request: { ...request, reason: 'tampered' }, decision, now: '2026-08-07T10:06:00.000Z' }).status, 'blocked');
});

test('an expired or agent-authored decision is blocked', async () => {
  const signer = createInMemoryHumanSigner({ human_id: 'human-1' });
  const request = createHumanActionRequest(base);
  const decision = await createHumanActionDecision({ signer, request, decision: 'rejected', decided_at: '2026-08-07T10:05:00.000Z', reason: 'Insufficient evidence.' });
  assert.deepEqual(verifyHumanActionDecision({ request, decision, now: '2026-08-07T11:00:00.000Z' }), { status: 'blocked', reason: 'human-action-decision-expired' });
  assert.deepEqual(verifyHumanActionDecision({ request, decision: { ...decision, human_id: 'agent-1' }, now: '2026-08-07T10:06:00.000Z' }), { status: 'blocked', reason: 'human-action-decision-signature-invalid' });
});

