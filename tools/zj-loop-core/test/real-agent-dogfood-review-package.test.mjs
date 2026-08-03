import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createRealAgentDogfoodReviewPackage, validateRealAgentDogfoodReviewPackage, persistRealAgentDogfoodReviewPackage, readRealAgentDogfoodReviewPackage } from '../dist/real-agent-dogfood-review-package.js';
import { createContentAddressedEvidenceStore } from '../dist/content-addressed-evidence-store.js';

const digest = (letter) => `sha256:${letter.repeat(64)}`;

const input = {
  network_id: 'network-1',
  dogfood_id: 'dogfood-1',
  execution_id: 'execution-1',
  attempt: 1,
  lifecycle_revision: 12,
  lifecycle_digest: digest('a'),
  provider_id: 'codex',
  provider_fact_digest: digest('b'),
  verification_digest: digest('c'),
  worktree_path: '/tmp/worktree-1',
  base_commit: 'commit-1',
  branch: 'zj-loop/real-agent-dogfood/execution-1',
  risks: ['review required'],
  available_decisions: ['accept', 'reject', 'request-revision'],
  generated_at: '2026-08-01T12:00:00.000Z',
  goal: 'Audit the provider-neutral OPN contract.',
  success_criteria: ['All key claims are independently verified.'],
  input_manifest_digest: digest('f'),
  result_envelope_digest: digest('e'),
  receipt_digest: digest('f'),
  evidence_refs: [{ schema: 'zj-loop.real_agent_dogfood_scoped_evidence_ref.v1', digest: digest('a'), kind: 'result-envelope', execution_id: 'execution-1', attempt: 1, provenance: 'provider:fixture' }],
  findings: [{ finding_id: 'finding-1', severity: 'info', claim: 'The contract is present.', status: 'verified', key_claim: false, evidence_refs: [digest('a')], verification_refs: [digest('c')] }],
  decisionability: 'ready',
};

test('review package binds the immutable execution and verification facts', () => {
  const packageValue = createRealAgentDogfoodReviewPackage(input);
  assert.equal(packageValue.schema, 'zj-loop.real_agent_dogfood_review_package.v1');
  assert.match(packageValue.package_digest, /^sha256:/);
  assert.equal(validateRealAgentDogfoodReviewPackage(packageValue).status, 'valid');
  assert.deepEqual(packageValue.available_decisions, ['accept', 'reject', 'request-revision']);
});

test('review package validation fails closed on lifecycle or verification drift', () => {
  const packageValue = createRealAgentDogfoodReviewPackage(input);
  assert.equal(validateRealAgentDogfoodReviewPackage({ ...packageValue, verification_digest: digest('d') }).status, 'blocked');
  assert.equal(validateRealAgentDogfoodReviewPackage({ ...packageValue, available_decisions: ['accept'] }).status, 'blocked');
});

test('review package binds Core-projected findings and digest-only execution context', () => {
  const packageValue = createRealAgentDogfoodReviewPackage(input);
  assert.equal(packageValue.goal, input.goal);
  assert.deepEqual(packageValue.success_criteria, input.success_criteria);
  assert.equal(packageValue.decisionability, 'ready');
  assert.equal(packageValue.findings[0].key_claim, false);
  assert.equal(validateRealAgentDogfoodReviewPackage({ ...packageValue, result_envelope_digest: digest('z') }).status, 'blocked');
  const { goal: _, ...missingGoal } = input;
  assert.throws(() => createRealAgentDogfoodReviewPackage(missingGoal), /review-package-input-invalid/);
});

test('review package rejects a canonical payload at the StateStore size boundary', () => {
  assert.throws(() => createRealAgentDogfoodReviewPackage({ ...input, goal: 'x'.repeat(256 * 1024) }), /review-package-input-invalid/);
  const packageValue = createRealAgentDogfoodReviewPackage(input);
  assert.equal(validateRealAgentDogfoodReviewPackage({ ...packageValue, goal: 'x'.repeat(256 * 1024) }).status, 'blocked');
});

test('Core policy blocks unverified key claims but leaves ordinary warnings decisionable', () => {
  const warning = createRealAgentDogfoodReviewPackage({ ...input, findings: [{ finding_id: 'warning-1', severity: 'low', claim: 'A non-critical limitation remains.', status: 'warning', key_claim: false, evidence_refs: [digest('a')], verification_refs: [] }], decisionability: 'ready' });
  assert.equal(validateRealAgentDogfoodReviewPackage(warning).status, 'valid');
  assert.throws(() => createRealAgentDogfoodReviewPackage({ ...input, findings: [{ finding_id: 'critical-1', severity: 'critical', claim: 'The critical claim is unverified.', status: 'warning', key_claim: false, evidence_refs: [digest('a')], verification_refs: [] }], decisionability: 'ready' }), /review-package-input-invalid/);
});

test('review package persistence returns an evidence reference and rejects tampering', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-review-package-store-'));
  try {
    const evidenceStore = await createContentAddressedEvidenceStore({ root });
    const packageValue = createRealAgentDogfoodReviewPackage(input);
    const reference = await persistRealAgentDogfoodReviewPackage({ evidenceStore, review_package: packageValue });
    assert.equal(reference.package_digest, packageValue.package_digest);
    assert.match(reference.evidence_digest, /^sha256:/);
    assert.deepEqual(await readRealAgentDogfoodReviewPackage({ evidenceStore, evidence_digest: reference.evidence_digest, actor: 'reviewer:human-1' }), packageValue);
    await assert.rejects(() => readRealAgentDogfoodReviewPackage({ evidenceStore, evidence_digest: packageValue.package_digest, actor: 'reviewer:human-1' }), /evidence-not-found|review-package/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
