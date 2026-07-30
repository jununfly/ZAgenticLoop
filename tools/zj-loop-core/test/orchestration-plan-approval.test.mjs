import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInMemoryHumanSigner } from '../dist/human-signer.js';
import {
  createOrchestrationPlanApproval,
  verifyOrchestrationPlanApproval,
} from '../dist/orchestration-plan-approval.js';

const base = {
  network_id: 'network-1',
  plan_id: 'plan-1',
  plan_revision: 3,
  plan_digest: 'sha256:' + 'a'.repeat(64),
  request_id: 'approval-request-1',
  approved_capabilities: ['artifact.read', 'artifact.write'],
  issued_at: '2026-07-30T00:00:00.000Z',
  expires_at: '2026-07-30T01:00:00.000Z',
  device_key_id: 'device-key-1',
  device_fingerprint: 'b'.repeat(64),
};

test('Graph plan approval signs and verifies structured plan binding', async () => {
  const signer = createInMemoryHumanSigner({ human_id: 'human-1' });
  const identity = await signer.getPublicIdentity();
  const approval = await createOrchestrationPlanApproval({ signer, ...base });
  assert.equal(approval.schema, 'zj-loop.orchestration_plan_approval.v1');
  assert.equal(verifyOrchestrationPlanApproval({ approval, identity, now: '2026-07-30T00:30:00.000Z', expected: base }).status, 'accepted');
});

test('Graph plan approval blocks identity, digest, revision, and expiry drift', async () => {
  const signer = createInMemoryHumanSigner({ human_id: 'human-1' });
  const identity = await signer.getPublicIdentity();
  const approval = await createOrchestrationPlanApproval({ signer, ...base });
  assert.equal(verifyOrchestrationPlanApproval({ approval, identity, now: '2026-07-30T00:30:00.000Z', expected: { ...base, plan_revision: 4 } }).reason, 'plan-revision-mismatch');
  assert.equal(verifyOrchestrationPlanApproval({ approval, identity, now: '2026-07-30T00:30:00.000Z', expected: { ...base, plan_digest: 'sha256:' + 'c'.repeat(64) } }).reason, 'plan-digest-mismatch');
  assert.equal(verifyOrchestrationPlanApproval({ approval, identity, now: '2026-07-30T01:00:00.000Z', expected: base }).reason, 'approval-expired');
  const other = await createInMemoryHumanSigner({ human_id: 'human-2' });
  assert.equal(verifyOrchestrationPlanApproval({ approval, identity: await other.getPublicIdentity(), now: '2026-07-30T00:30:00.000Z', expected: base }).reason, 'human-identity-mismatch');
});
