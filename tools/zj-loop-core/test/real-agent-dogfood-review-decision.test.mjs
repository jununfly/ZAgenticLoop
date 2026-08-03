import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createInMemoryHumanSigner } from '../dist/human-signer.js';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';
import { createRealAgentDogfoodDraft, createRealAgentDogfoodTransition, appendRealAgentDogfoodEvent, projectRealAgentDogfoodLifecycle } from '../dist/real-agent-dogfood-lifecycle.js';
import { createRealAgentDogfoodReviewPackage } from '../dist/real-agent-dogfood-review-package.js';
import { createRealAgentDogfoodReviewDecision, validateRealAgentDogfoodReviewDecision, recordRealAgentDogfoodReviewDecision } from '../dist/real-agent-dogfood-review-decision.js';

const digest = (letter) => `sha256:${letter.repeat(64)}`;
const packageValue = createRealAgentDogfoodReviewPackage({ network_id: 'network-1', dogfood_id: 'dogfood-1', execution_id: 'execution-1', attempt: 1, lifecycle_revision: 12, lifecycle_digest: digest('a'), provider_id: 'codex', provider_fact_digest: digest('b'), verification_digest: digest('c'), worktree_path: '/tmp/worktree-1', base_commit: 'commit-1', branch: 'branch-1', risks: [], available_decisions: ['accept', 'reject', 'request-revision'], generated_at: '2026-08-01T12:00:00.000Z', goal: 'Audit the provider-neutral OPN contract.', success_criteria: ['All key claims are independently verified.'], input_manifest_digest: digest('d'), result_envelope_digest: digest('e'), receipt_digest: digest('f'), evidence_refs: [{ schema: 'zj-loop.real_agent_dogfood_scoped_evidence_ref.v1', digest: digest('a'), kind: 'result-envelope', execution_id: 'execution-1', attempt: 1, provenance: 'provider:fixture' }], findings: [{ finding_id: 'finding-1', severity: 'info', claim: 'The contract is present.', status: 'verified', key_claim: false, evidence_refs: [digest('a')], verification_refs: [digest('c')] }], decisionability: 'ready' });

test('Human review decision signs the exact review package binding', async () => {
  const signer = createInMemoryHumanSigner({ human_id: 'human-1' });
  const decision = await createRealAgentDogfoodReviewDecision({ signer, review_package: packageValue, decision: 'accept', comment: 'verified', decided_at: '2026-08-01T12:01:00.000Z' });
  const identity = await signer.getPublicIdentity();
  assert.equal(decision.decision, 'accept');
  assert.equal(decision.package_digest, packageValue.package_digest);
  assert.equal(validateRealAgentDogfoodReviewDecision({ decision, identity, review_package: packageValue }).status, 'valid');
});

test('Human review decision rejects package and lifecycle drift', async () => {
  const signer = createInMemoryHumanSigner({ human_id: 'human-1' });
  const decision = await createRealAgentDogfoodReviewDecision({ signer, review_package: packageValue, decision: 'reject', comment: 'not ready', decided_at: '2026-08-01T12:01:00.000Z' });
  const identity = await signer.getPublicIdentity();
  assert.equal(validateRealAgentDogfoodReviewDecision({ decision: { ...decision, package_digest: digest('d') }, identity, review_package: packageValue }).status, 'blocked');
});

test('Human accept must acknowledge every warning and revision must carry structured requirements', async () => {
  const warningPackage = createRealAgentDogfoodReviewPackage({ ...packageValue, findings: [{ finding_id: 'warning-1', severity: 'low', claim: 'A non-critical limitation remains.', status: 'warning', key_claim: false, evidence_refs: [digest('a')], verification_refs: [] }], decisionability: 'ready' });
  const signer = createInMemoryHumanSigner({ human_id: 'human-1' });
  await assert.rejects(() => createRealAgentDogfoodReviewDecision({ signer, review_package: warningPackage, decision: 'accept', comment: 'verified', decided_at: '2026-08-01T12:01:00.000Z' }), /warning-acknowledgement-required/);
  const accepted = await createRealAgentDogfoodReviewDecision({ signer, review_package: warningPackage, decision: 'accept', comment: 'verified', acknowledged_warning_ids: ['warning-1'], decided_at: '2026-08-01T12:01:00.000Z' });
  assert.deepEqual(accepted.acknowledged_warning_ids, ['warning-1']);
  const revised = await createRealAgentDogfoodReviewDecision({ signer, review_package: packageValue, decision: 'request-revision', comment: 'tighten the proof', revision_requirements: [{ requirement_id: 'req-1', description: 'Add verifier evidence for the result.', evidence_refs: [digest('c')] }], decided_at: '2026-08-01T12:01:00.000Z' });
  assert.equal(revised.revision_requirements[0].requirement_id, 'req-1');
});

test('recorded Human accept passes the lifecycle CAS gate', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-review-decision-record-'));
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  try {
    await stateStore.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2026-08-01T12:00:00.000Z' });
    const draft = createRealAgentDogfoodDraft({ network_id: 'network-1', dogfood_id: 'dogfood-1', execution_id: 'execution-1', attempt: 1, provider_id: 'codex', adapter_version: 'codex-agent-provider.v1', created_at: '2026-08-01T12:00:00.000Z' });
    const ready = createRealAgentDogfoodTransition({ lifecycle: draft.lifecycle, to: 'preflight-ready', event_id: 'ready-record', occurred_at: '2026-08-01T12:00:01.000Z', fact_digest: digest('a'), next_action: 'human-approval' });
    const awaiting = createRealAgentDogfoodTransition({ lifecycle: ready.lifecycle, to: 'awaiting-human-approval', event_id: 'awaiting-record', occurred_at: '2026-08-01T12:00:02.000Z', fact_digest: digest('a'), next_action: 'human-approval' });
    const running = createRealAgentDogfoodTransition({ lifecycle: awaiting.lifecycle, to: 'running', event_id: 'running-record', occurred_at: '2026-08-01T12:00:03.000Z', approval_digest: digest('b'), next_action: 'provider-execution' });
    const pending = createRealAgentDogfoodTransition({ lifecycle: running.lifecycle, to: 'verification-pending', event_id: 'pending-record', occurred_at: '2026-08-01T12:00:04.000Z', fact_digest: digest('c'), next_action: 'run-independent-verifier' });
    const review = createRealAgentDogfoodTransition({ lifecycle: pending.lifecycle, to: 'review-pending', event_id: 'review-record', occurred_at: '2026-08-01T12:00:05.000Z', fact_digest: digest('d'), next_action: 'human-review' });
    let revision = 1;
    for (const event of [draft.event, ready.event, awaiting.event, running.event, pending.event, review.event]) await appendRealAgentDogfoodEvent({ stateStore, expected_revision: revision++, event });
    const { package_digest: _, ...packageInput } = packageValue;
    const packageForReview = createRealAgentDogfoodReviewPackage({ ...packageInput, lifecycle_revision: await stateStore.getRevision('network-1'), lifecycle_digest: review.lifecycle.lifecycle_digest });
    const signer = createInMemoryHumanSigner({ human_id: 'human-1' });
    const decision = await createRealAgentDogfoodReviewDecision({ signer, review_package: packageForReview, decision: 'accept', comment: 'verified', decided_at: '2026-08-01T12:00:06.000Z' });
    const identity = await signer.getPublicIdentity();
    const recorded = await recordRealAgentDogfoodReviewDecision({ stateStore, lifecycle: review.lifecycle, review_package: packageForReview, decision, identity, expected_revision: await stateStore.getRevision('network-1'), now: '2026-08-01T12:00:06.000Z' });
    assert.equal(recorded.status, 'accepted');
    const events = await stateStore.readEvents({ network_id: 'network-1', aggregate_type: 'real-agent-dogfood', aggregate_id: 'dogfood-1' });
    assert.equal(projectRealAgentDogfoodLifecycle(events.events).status, 'accepted');
  } finally { await stateStore.close(); await rm(root, { recursive: true, force: true }); }
});

test('request-revision generates a fresh execution id inside the orchestrator', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-review-revision-record-'));
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  try {
    await stateStore.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2026-08-01T12:00:00.000Z' });
    const draft = createRealAgentDogfoodDraft({ network_id: 'network-1', dogfood_id: 'dogfood-2', execution_id: 'execution-old', attempt: 1, provider_id: 'codex', adapter_version: 'codex-agent-provider.v1', created_at: '2026-08-01T12:00:00.000Z' });
    const ready = createRealAgentDogfoodTransition({ lifecycle: draft.lifecycle, to: 'preflight-ready', event_id: 'ready-revision', occurred_at: '2026-08-01T12:00:01.000Z', fact_digest: digest('a'), next_action: 'human-approval' });
    const awaiting = createRealAgentDogfoodTransition({ lifecycle: ready.lifecycle, to: 'awaiting-human-approval', event_id: 'awaiting-revision', occurred_at: '2026-08-01T12:00:02.000Z', fact_digest: digest('a'), next_action: 'human-approval' });
    const running = createRealAgentDogfoodTransition({ lifecycle: awaiting.lifecycle, to: 'running', event_id: 'running-revision', occurred_at: '2026-08-01T12:00:03.000Z', approval_digest: digest('b'), next_action: 'provider-execution' });
    const pending = createRealAgentDogfoodTransition({ lifecycle: running.lifecycle, to: 'verification-pending', event_id: 'pending-revision', occurred_at: '2026-08-01T12:00:04.000Z', fact_digest: digest('c'), next_action: 'run-independent-verifier' });
    const review = createRealAgentDogfoodTransition({ lifecycle: pending.lifecycle, to: 'review-pending', event_id: 'review-revision', occurred_at: '2026-08-01T12:00:05.000Z', fact_digest: digest('d'), next_action: 'human-review' });
    let revision = 1;
    for (const event of [draft.event, ready.event, awaiting.event, running.event, pending.event, review.event]) await appendRealAgentDogfoodEvent({ stateStore, expected_revision: revision++, event });
    const { package_digest: _, ...packageInput } = packageValue;
    const reviewPackage = createRealAgentDogfoodReviewPackage({ ...packageInput, dogfood_id: 'dogfood-2', execution_id: 'execution-old', lifecycle_revision: await stateStore.getRevision('network-1'), lifecycle_digest: review.lifecycle.lifecycle_digest, evidence_refs: packageInput.evidence_refs.map((ref) => ({ ...ref, execution_id: 'execution-old' })) });
    const signer = createInMemoryHumanSigner({ human_id: 'human-1' });
    const decision = await createRealAgentDogfoodReviewDecision({ signer, review_package: reviewPackage, decision: 'request-revision', comment: 'tighten the proof', revision_requirements: [{ requirement_id: 'req-1', description: 'Add verifier evidence for the result.', evidence_refs: [digest('c')] }], decided_at: '2026-08-01T12:00:06.000Z' });
    const recorded = await recordRealAgentDogfoodReviewDecision({ stateStore, lifecycle: review.lifecycle, review_package: reviewPackage, decision, identity: await signer.getPublicIdentity(), expected_revision: await stateStore.getRevision('network-1'), now: '2026-08-01T12:00:06.000Z' });
    assert.equal(recorded.status, 'request-revision');
    assert.notEqual(recorded.event.payload.execution_id, 'execution-old');
    assert.match(recorded.event.payload.execution_id, /^execution-/);
    assert.equal(recorded.event.payload.attempt, 2);
  } finally { await stateStore.close(); await rm(root, { recursive: true, force: true }); }
});
