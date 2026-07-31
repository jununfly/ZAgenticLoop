import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInMemoryHumanSigner } from '../dist/human-signer.js';
import { createProviderOutcome } from '../dist/provider-outcome.js';
import { createProviderOutcomeVerification } from '../dist/provider-outcome-verification.js';
import { createReviewHandoff } from '../dist/review-handoff.js';
import { createHumanAcceptance, validateHumanAcceptance } from '../dist/human-acceptance.js';

const digest = (value) => `sha256:${value.repeat(64)}`;
const outcome = createProviderOutcome({
  network_id: 'network-1', event_id: 'event-1', plan_id: 'plan-1', plan_revision: 3,
  execution_id: 'execution-1', task_id: 'task-1', provider_id: 'agent-1', provider_kind: 'fixture',
  provider_request_id: 'request-1', request_digest: digest('1'), response_digest: digest('2'),
  resource_scope: ['resource:1'], observed_at: '2026-07-31T08:00:00.000Z', outcome: 'confirmed-success',
  side_effects_executed: true, evidence: { kind: 'receipt', receipt_id: 'receipt-1', receipt_digest: digest('3') },
});
const verification = createProviderOutcomeVerification({
  outcome, verifier_id: 'verifier-1', verification_conditions: ['present'], satisfied_conditions: ['present'],
  failed_conditions: [], evidence_digest: digest('4'), checked_at: '2026-07-31T08:01:00.000Z',
});
const handoff = createReviewHandoff({
  verification, dependencies_closed: true, remaining_risks: [],
  external_resource_states: [{ resource_id: 'resource:1', last_known_status: 'updated', responsible_party: 'human-1' }],
  responsible_party: 'human-1', accepted_at: '2026-07-31T08:02:00.000Z',
});

test('Human Acceptance signs and validates the exact review-ready handoff scope', async () => {
  const signer = createInMemoryHumanSigner({ human_id: 'human-1' });
  const identity = await signer.getPublicIdentity();
  const acceptance = await createHumanAcceptance({
    signer,
    handoff,
    plan_digest: digest('5'),
    accepted_at: '2026-07-31T08:03:00.000Z',
  });

  assert.equal(acceptance.schema, 'zj-loop.human_acceptance.v1');
  assert.equal(acceptance.network_id, 'network-1');
  assert.equal(acceptance.event_id, 'event-1');
  assert.equal(acceptance.plan_revision, 3);
  assert.equal(acceptance.plan_digest, digest('5'));
  assert.equal(acceptance.review_handoff_digest, handoff.handoff_digest);
  assert.equal(acceptance.verification_digest, verification.verification_digest);
  assert.equal(acceptance.human_id, 'human-1');
  assert.equal(acceptance.signer_fingerprint, identity.public_key_fingerprint);
  assert.equal(acceptance.decision, 'accepted');
  assert.equal(acceptance.side_effects_executed, false);
  assert.equal(validateHumanAcceptance({ acceptance, identity, handoff }).status, 'valid');
});

test('Human Acceptance refuses a blocked Review Handoff', async () => {
  const signer = createInMemoryHumanSigner({ human_id: 'human-1' });
  const blockedHandoff = createReviewHandoff({
    verification, dependencies_closed: false, remaining_risks: [],
    external_resource_states: [{ resource_id: 'resource:1', last_known_status: 'updated', responsible_party: 'human-1' }],
    responsible_party: 'human-1', accepted_at: '2026-07-31T08:02:00.000Z',
  });

  await assert.rejects(
    createHumanAcceptance({ signer, handoff: blockedHandoff, plan_digest: digest('5'), accepted_at: '2026-07-31T08:03:00.000Z' }),
    { message: 'human-acceptance-review-not-ready' },
  );
});

test('Human Acceptance fails closed when any signed binding is changed', async () => {
  const signer = createInMemoryHumanSigner({ human_id: 'human-1' });
  const identity = await signer.getPublicIdentity();
  const acceptance = await createHumanAcceptance({ signer, handoff, plan_digest: digest('5'), accepted_at: '2026-07-31T08:03:00.000Z' });

  assert.equal(validateHumanAcceptance({ acceptance: { ...acceptance, plan_digest: digest('6') }, identity, handoff }).status, 'blocked');
  assert.equal(validateHumanAcceptance({ acceptance: { ...acceptance, review_handoff_digest: digest('6') }, identity, handoff }).status, 'blocked');
  assert.equal(validateHumanAcceptance({ acceptance: { ...acceptance, signature: { ...acceptance.signature, signature_base64: Buffer.from('tampered').toString('base64') } }, identity, handoff }).status, 'blocked');
  assert.doesNotThrow(() => validateHumanAcceptance({ acceptance: { ...acceptance, signature: undefined }, identity, handoff }));
  assert.equal(validateHumanAcceptance({ acceptance: { ...acceptance, signature: undefined }, identity, handoff }).status, 'blocked');
});
