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
