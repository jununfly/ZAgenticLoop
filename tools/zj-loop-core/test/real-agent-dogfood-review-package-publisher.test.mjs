import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';
import { createRealAgentDogfoodReviewPackage } from '../dist/real-agent-dogfood-review-package.js';
import { publishRealAgentDogfoodReviewPackage } from '../dist/real-agent-dogfood-review-package-publisher.js';

const digest = (letter) => `sha256:${letter.repeat(64)}`;

function packageValue() {
  return createRealAgentDogfoodReviewPackage({
    network_id: 'network-1', dogfood_id: 'dogfood-1', execution_id: 'execution-1', attempt: 1,
    lifecycle_revision: 12, lifecycle_digest: digest('a'), provider_id: 'provider-1',
    provider_fact_digest: digest('b'), verification_digest: digest('c'), worktree_path: '/tmp/worktree-1',
    base_commit: 'commit-1', branch: 'branch-1', risks: [],
    available_decisions: ['accept', 'reject', 'request-revision'], generated_at: '2026-08-01T12:00:00.000Z',
    goal: 'Audit the provider-neutral OPN contract.', success_criteria: ['All key claims are independently verified.'],
    input_manifest_digest: digest('d'), result_envelope_digest: digest('e'), receipt_digest: digest('f'),
    evidence_refs: [{ schema: 'zj-loop.real_agent_dogfood_scoped_evidence_ref.v1', digest: digest('a'), kind: 'result-envelope', execution_id: 'execution-1', attempt: 1, provenance: 'provider:fixture' }],
    findings: [{ finding_id: 'finding-1', severity: 'info', claim: 'The contract is present.', status: 'verified', key_claim: false, evidence_refs: [digest('a')], verification_refs: [digest('c')] }],
    decisionability: 'ready',
  });
}

test('review package publisher has one winner per immutable publication scope', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-review-package-publisher-'));
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  try {
    await stateStore.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2026-08-01T12:00:00.000Z' });
    const reviewPackage = packageValue();
    const first = await publishRealAgentDogfoodReviewPackage({ stateStore, review_package: reviewPackage, evidence_digest: digest('e'), expected_revision: 1, now: '2026-08-01T12:00:01.000Z' });
    assert.equal(first.status, 'recorded');
    const duplicate = await publishRealAgentDogfoodReviewPackage({ stateStore, review_package: reviewPackage, evidence_digest: digest('e'), expected_revision: 1, now: '2026-08-01T12:00:02.000Z' });
    assert.equal(duplicate.status, 'duplicate');
    const conflict = await publishRealAgentDogfoodReviewPackage({ stateStore, review_package: createRealAgentDogfoodReviewPackage({ ...reviewPackage, goal: 'A different immutable goal.' }), evidence_digest: digest('e'), expected_revision: 2, now: '2026-08-01T12:00:03.000Z' });
    assert.equal(conflict.status, 'conflict');
    assert.equal(conflict.reason, 'review-package-publication-conflict');
    const events = await stateStore.readEvents({ network_id: 'network-1', aggregate_type: 'real-agent-dogfood-review-package' });
    assert.equal(events.events.length, 1);
  } finally { await stateStore.close(); await rm(root, { recursive: true, force: true }); }
});

test('review package publisher serializes concurrent same-scope publication', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-review-package-publisher-concurrent-'));
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  try {
    await stateStore.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2026-08-01T12:00:00.000Z' });
    const reviewPackage = packageValue();
    const results = await Promise.all([
      publishRealAgentDogfoodReviewPackage({ stateStore, review_package: reviewPackage, evidence_digest: digest('e'), expected_revision: 1, now: '2026-08-01T12:00:01.000Z' }),
      publishRealAgentDogfoodReviewPackage({ stateStore, review_package: reviewPackage, evidence_digest: digest('e'), expected_revision: 1, now: '2026-08-01T12:00:01.000Z' }),
    ]);
    assert.deepEqual(new Set(results.map((result) => result.status)), new Set(['recorded', 'duplicate']));
    const events = await stateStore.readEvents({ network_id: 'network-1', aggregate_type: 'real-agent-dogfood-review-package' });
    assert.equal(events.events.length, 1);
  } finally { await stateStore.close(); await rm(root, { recursive: true, force: true }); }
});
