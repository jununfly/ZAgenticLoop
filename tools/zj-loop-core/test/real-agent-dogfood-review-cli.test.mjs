import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createInMemoryHumanSigner } from '../dist/human-signer.js';
import { createContentAddressedEvidenceStore } from '../dist/content-addressed-evidence-store.js';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';
import { createRealAgentDogfoodDraft, createRealAgentDogfoodTransition, appendRealAgentDogfoodEvent, projectRealAgentDogfoodLifecycle } from '../dist/real-agent-dogfood-lifecycle.js';
import { createRealAgentDogfoodReviewPackage, persistRealAgentDogfoodReviewPackage } from '../dist/real-agent-dogfood-review-package.js';
import { runRealAgentDogfoodReviewCli } from '../dist/real-agent-dogfood-review-cli.js';

const digest = (letter) => `sha256:${letter.repeat(64)}`;

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-review-cli-'));
  const statePath = path.join(root, 'state.db');
  const evidencePath = path.join(root, 'evidence');
  const stateStore = createSqliteStateStore({ filename: statePath });
  const evidenceStore = await createContentAddressedEvidenceStore({ root: evidencePath });
  await stateStore.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2026-08-01T12:00:00.000Z' });
  const draft = createRealAgentDogfoodDraft({ network_id: 'network-1', dogfood_id: 'dogfood-1', execution_id: 'execution-1', attempt: 1, provider_id: 'provider-1', adapter_version: 'adapter-1', created_at: '2026-08-01T12:00:00.000Z' });
  const ready = createRealAgentDogfoodTransition({ lifecycle: draft.lifecycle, to: 'preflight-ready', event_id: 'ready', occurred_at: '2026-08-01T12:00:01.000Z', fact_digest: digest('a'), next_action: 'human-approval' });
  const awaiting = createRealAgentDogfoodTransition({ lifecycle: ready.lifecycle, to: 'awaiting-human-approval', event_id: 'awaiting', occurred_at: '2026-08-01T12:00:02.000Z', fact_digest: digest('a'), next_action: 'human-approval' });
  const running = createRealAgentDogfoodTransition({ lifecycle: awaiting.lifecycle, to: 'running', event_id: 'running', occurred_at: '2026-08-01T12:00:03.000Z', approval_digest: digest('b'), next_action: 'provider-execution' });
  const pending = createRealAgentDogfoodTransition({ lifecycle: running.lifecycle, to: 'verification-pending', event_id: 'pending', occurred_at: '2026-08-01T12:00:04.000Z', fact_digest: digest('c'), next_action: 'run-independent-verifier' });
  const review = createRealAgentDogfoodTransition({ lifecycle: pending.lifecycle, to: 'review-pending', event_id: 'review', occurred_at: '2026-08-01T12:00:05.000Z', fact_digest: digest('d'), next_action: 'human-review' });
  let revision = 1;
  for (const event of [draft.event, ready.event, awaiting.event, running.event, pending.event, review.event]) await appendRealAgentDogfoodEvent({ stateStore, expected_revision: revision++, event });
  const packageValue = createRealAgentDogfoodReviewPackage({ network_id: 'network-1', dogfood_id: 'dogfood-1', execution_id: 'execution-1', attempt: 1, lifecycle_revision: await stateStore.getRevision('network-1'), lifecycle_digest: review.lifecycle.lifecycle_digest, provider_id: 'provider-1', provider_fact_digest: digest('e'), verification_digest: digest('d'), worktree_path: '/tmp/worktree-1', base_commit: 'commit-1', branch: 'branch-1', risks: [], available_decisions: ['accept', 'reject', 'request-revision'], generated_at: '2026-08-01T12:00:05.000Z' });
  const reference = await persistRealAgentDogfoodReviewPackage({ evidenceStore, review_package: packageValue });
  return { root, statePath, evidencePath, stateStore, evidenceStore, reference, packageValue, lifecycle: review.lifecycle };
}

test('review CLI shows a persisted package and signs an accept through the CAS API', async () => {
  const f = await fixture();
  try {
    const signer = createInMemoryHumanSigner({ human_id: 'human-1' });
    const shown = [];
    assert.equal(await runRealAgentDogfoodReviewCli(['show', '--evidence-store', f.evidencePath, '--package-evidence', f.reference.evidence_digest], { stdout: (x) => shown.push(x), stderr: () => {} }), 0);
    assert.equal(JSON.parse(shown[0]).status, 'review-pending');
    const output = [];
    assert.equal(await runRealAgentDogfoodReviewCli(['decide', '--state-store', f.statePath, '--evidence-store', f.evidencePath, '--network-id', 'network-1', '--dogfood-id', 'dogfood-1', '--package-evidence', f.reference.evidence_digest, '--decision', 'accept', '--comment', 'verified'], { stdout: (x) => output.push(x), stderr: () => {} }, { signer, now: () => '2026-08-01T12:00:06.000Z' }), 0);
    assert.equal(JSON.parse(output[0]).status, 'accepted');
    const events = await f.stateStore.readEvents({ network_id: 'network-1', aggregate_type: 'real-agent-dogfood', aggregate_id: 'dogfood-1' });
    assert.equal(projectRealAgentDogfoodLifecycle(events.events).status, 'accepted');
  } finally { await f.stateStore.close(); await rm(f.root, { recursive: true, force: true }); }
});

test('review CLI rejects a stale package before writing a decision', async () => {
  const f = await fixture();
  try {
    const output = [];
    const errors = [];
    const signer = createInMemoryHumanSigner({ human_id: 'human-1' });
    const stalePath = path.join(f.root, 'stale.json');
    await writeFile(stalePath, JSON.stringify({ ...f.packageValue, lifecycle_revision: f.packageValue.lifecycle_revision - 1 }));
    const staleEvidence = await f.evidenceStore.put({ content: await import('node:fs/promises').then(({ readFile }) => readFile(stalePath)), kind: 'real-agent-dogfood-review-package' });
    assert.equal(await runRealAgentDogfoodReviewCli(['decide', '--state-store', f.statePath, '--evidence-store', f.evidencePath, '--network-id', 'network-1', '--dogfood-id', 'dogfood-1', '--package-evidence', staleEvidence.digest, '--decision', 'accept', '--comment', 'stale'], { stdout: (x) => output.push(x), stderr: (x) => errors.push(x) }, { signer }), 1);
    assert.match(errors.join('\n'), /failed|lifecycle|package/);
    assert.equal(projectRealAgentDogfoodLifecycle((await f.stateStore.readEvents({ network_id: 'network-1', aggregate_type: 'real-agent-dogfood', aggregate_id: 'dogfood-1' })).events).status, 'review-pending');
  } finally { await f.stateStore.close(); await rm(f.root, { recursive: true, force: true }); }
});
