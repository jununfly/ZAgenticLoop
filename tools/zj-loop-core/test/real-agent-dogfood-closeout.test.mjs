import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { createInMemoryHumanSigner } from '../dist/human-signer.js';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';
import { createRealAgentDogfoodDraft, createRealAgentDogfoodTransition, appendRealAgentDogfoodEvent, projectRealAgentDogfoodLifecycle } from '../dist/real-agent-dogfood-lifecycle.js';
import { createRealAgentDogfoodCloseout, recordRealAgentDogfoodCloseout, recordRealAgentDogfoodDecisionCloseout } from '../dist/real-agent-dogfood-closeout.js';
import { runRealAgentDogfoodCloseoutCli } from '../dist/real-agent-dogfood-closeout-cli.js';

const execFile = promisify(execFileCallback);
const digest = (letter) => `sha256:${letter.repeat(64)}`;

async function git(cwd, ...args) { return (await execFile('git', args, { cwd })).stdout.trim(); }

async function fixture(status = 'accepted') {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-closeout-'));
  const repo = path.join(root, 'repo');
  const worktrees = path.join(root, 'worktrees');
  const statePath = path.join(root, 'state.db');
  const stateStore = createSqliteStateStore({ filename: statePath });
  await mkdir(repo);
  await git(repo, 'init', '-q');
  await git(repo, 'config', 'user.email', 'test@example.invalid');
  await git(repo, 'config', 'user.name', 'Test');
  await writeFile(path.join(repo, 'README.md'), 'fixture\n');
  await git(repo, 'add', 'README.md');
  await git(repo, 'commit', '-qm', 'fixture');
  await mkdir(worktrees);
  const worktree = path.join(worktrees, 'execution-1');
  await git(repo, 'worktree', 'add', '-q', '-b', 'zj-loop/real-agent-dogfood/execution-1', worktree, 'HEAD');
  await stateStore.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2026-08-01T12:00:00.000Z' });
  const draft = createRealAgentDogfoodDraft({ network_id: 'network-1', dogfood_id: 'dogfood-1', execution_id: 'execution-1', attempt: 1, provider_id: 'provider-1', adapter_version: 'adapter-1', created_at: '2026-08-01T12:00:00.000Z' });
  const review = createRealAgentDogfoodTransition({ lifecycle: draft.lifecycle, to: 'preflight-ready', event_id: 'ready', occurred_at: '2026-08-01T12:00:01.000Z', fact_digest: digest('a'), next_action: 'human-approval' });
  const awaiting = createRealAgentDogfoodTransition({ lifecycle: review.lifecycle, to: 'awaiting-human-approval', event_id: 'awaiting', occurred_at: '2026-08-01T12:00:02.000Z', fact_digest: digest('a'), next_action: 'human-approval' });
  const running = createRealAgentDogfoodTransition({ lifecycle: awaiting.lifecycle, to: 'running', event_id: 'running', occurred_at: '2026-08-01T12:00:03.000Z', approval_digest: digest('b'), next_action: 'provider-execution' });
  const pending = createRealAgentDogfoodTransition({ lifecycle: running.lifecycle, to: 'verification-pending', event_id: 'pending', occurred_at: '2026-08-01T12:00:04.000Z', fact_digest: digest('c'), next_action: 'run-independent-verifier' });
  const ready = createRealAgentDogfoodTransition({ lifecycle: pending.lifecycle, to: 'review-pending', event_id: 'review', occurred_at: '2026-08-01T12:00:05.000Z', fact_digest: digest('d'), next_action: 'human-review' });
  const terminal = status === 'review-pending' ? ready : status === 'accepted' ? createRealAgentDogfoodTransition({ lifecycle: ready.lifecycle, to: 'accepted', event_id: 'accepted', occurred_at: '2026-08-01T12:00:06.000Z', fact_digest: digest('e'), next_action: 'closeout' }) : createRealAgentDogfoodTransition({ lifecycle: ready.lifecycle, to: 'rejected', event_id: 'rejected', occurred_at: '2026-08-01T12:00:06.000Z', fact_digest: digest('e'), reason_code: 'human-reject', next_action: 'closeout' });
  let revision = 1;
  for (const event of [draft.event, review.event, awaiting.event, running.event, pending.event, ready.event, terminal.event]) await appendRealAgentDogfoodEvent({ stateStore, expected_revision: revision++, event });
  return { root, repo, worktree, statePath, stateStore, lifecycle: terminal.lifecycle, revision: await stateStore.getRevision('network-1') };
}

test('Human closeout removes only a clean isolated worktree and records an independent closeout fact', async () => {
  const f = await fixture();
  try {
    const signer = createInMemoryHumanSigner({ human_id: 'human-1' });
    const closeout = await createRealAgentDogfoodCloseout({ signer, lifecycle: f.lifecycle, worktree_path: f.worktree, reason: 'review complete', closed_at: '2026-08-01T12:01:00.000Z' });
    const recorded = await recordRealAgentDogfoodCloseout({ stateStore: f.stateStore, lifecycle: f.lifecycle, closeout, identity: await signer.getPublicIdentity(), expected_revision: f.revision, repo_root: f.repo, worktree_path: f.worktree, now: '2026-08-01T12:01:00.000Z' });
    assert.equal(recorded.status, 'closed');
    const repeated = await recordRealAgentDogfoodCloseout({ stateStore: f.stateStore, lifecycle: f.lifecycle, closeout, identity: await signer.getPublicIdentity(), expected_revision: recorded.revision, repo_root: f.repo, worktree_path: f.worktree, now: '2026-08-01T12:01:01.000Z' });
    assert.equal(repeated.revision, recorded.revision);
    await assert.rejects(() => git(f.worktree, 'status'), /ENOENT|not exist|cannot change directory/);
    const events = await f.stateStore.readEvents({ network_id: 'network-1', aggregate_type: 'real-agent-dogfood-closeout', aggregate_id: 'dogfood-1' });
    assert.equal(events.events.at(-1).event_type, 'real-agent-dogfood-closeout.closed');
    assert.equal(projectRealAgentDogfoodLifecycle((await f.stateStore.readEvents({ network_id: 'network-1', aggregate_type: 'real-agent-dogfood', aggregate_id: 'dogfood-1' })).events).status, 'accepted');
  } finally { await f.stateStore.close(); await rm(f.root, { recursive: true, force: true }); }
});

test('closeout CLI exposes the signed Human action and retains EvidenceStore by contract', async () => {
  const f = await fixture('rejected');
  try {
    const output = [];
    const signer = createInMemoryHumanSigner({ human_id: 'human-1' });
    assert.equal(await runRealAgentDogfoodCloseoutCli(['closeout', '--state-store', f.statePath, '--network-id', 'network-1', '--dogfood-id', 'dogfood-1', '--repo-root', f.repo, '--worktree-path', f.worktree, '--reason', 'rejected attempt closed'], { stdout: (value) => output.push(value), stderr: () => {} }, { signer, now: () => '2026-08-01T12:02:00.000Z' }), 0);
    const result = JSON.parse(output[0]);
    assert.equal(result.status, 'closed');
    assert.equal(result.evidence_retained, true);
  } finally { await f.stateStore.close(); await rm(f.root, { recursive: true, force: true }); }
});

test('closeout refuses a dirty worktree and a non-terminal lifecycle', async () => {
  const dirty = await fixture();
  try {
    await writeFile(path.join(dirty.worktree, 'untracked.txt'), 'do not delete\n');
    const signer = createInMemoryHumanSigner({ human_id: 'human-1' });
    const closeout = await createRealAgentDogfoodCloseout({ signer, lifecycle: dirty.lifecycle, worktree_path: dirty.worktree, reason: 'review complete', closed_at: '2026-08-01T12:01:00.000Z' });
    const identity = await signer.getPublicIdentity();
    await assert.rejects(() => recordRealAgentDogfoodCloseout({ stateStore: dirty.stateStore, lifecycle: dirty.lifecycle, closeout, identity, expected_revision: dirty.revision, repo_root: dirty.repo, worktree_path: dirty.worktree, now: '2026-08-01T12:01:00.000Z' }), /worktree-not-clean/);
  } finally { await dirty.stateStore.close(); await rm(dirty.root, { recursive: true, force: true }); }
  const nonTerminal = await fixture('review-pending');
  try {
    const signer = createInMemoryHumanSigner({ human_id: 'human-1' });
    await assert.rejects(() => createRealAgentDogfoodCloseout({ signer, lifecycle: nonTerminal.lifecycle, worktree_path: nonTerminal.worktree, reason: 'too early', closed_at: '2026-08-01T12:01:00.000Z' }), /lifecycle-not-terminal/);
  } finally { await nonTerminal.stateStore.close(); await rm(nonTerminal.root, { recursive: true, force: true }); }
});

test('decision closeout reuses the recorded Human decision without a second signature', async () => {
  const f = await fixture('accepted');
  try {
    const result = await recordRealAgentDogfoodDecisionCloseout({ stateStore: f.stateStore, lifecycle: f.lifecycle, decision_digest: digest('e'), package_digest: digest('f'), repo_root: f.repo, worktree_path: f.worktree, expected_revision: f.revision, now: '2026-08-01T12:03:00.000Z' });
    assert.equal(result.status, 'closed');
    const events = await f.stateStore.readEvents({ network_id: 'network-1', aggregate_type: 'real-agent-dogfood-closeout', aggregate_id: 'dogfood-1:attempt-1' });
    assert.deepEqual(events.events.map((event) => event.payload.status), ['cleanup-pending', 'closed']);
    const repeated = await recordRealAgentDogfoodDecisionCloseout({ stateStore: f.stateStore, lifecycle: f.lifecycle, decision_digest: digest('e'), package_digest: digest('f'), repo_root: f.repo, worktree_path: f.worktree, expected_revision: result.revision, now: '2026-08-01T12:03:01.000Z' });
    assert.equal(repeated.status, 'closed');
    assert.equal((await f.stateStore.readEvents({ network_id: 'network-1', aggregate_type: 'real-agent-dogfood-closeout', aggregate_id: 'dogfood-1:attempt-1' })).events.length, 2);
  } finally { await f.stateStore.close(); await rm(f.root, { recursive: true, force: true }); }
});

test('decision closeout records outcome-uncertain when Core cannot prove cleanup', async () => {
  const f = await fixture('rejected');
  try {
    await writeFile(path.join(f.worktree, 'untracked.txt'), 'must remain\n');
    const result = await recordRealAgentDogfoodDecisionCloseout({ stateStore: f.stateStore, lifecycle: f.lifecycle, decision_digest: digest('e'), package_digest: digest('f'), repo_root: f.repo, worktree_path: f.worktree, expected_revision: f.revision, now: '2026-08-01T12:03:00.000Z' });
    assert.equal(result.status, 'outcome-uncertain');
    const events = await f.stateStore.readEvents({ network_id: 'network-1', aggregate_type: 'real-agent-dogfood-closeout', aggregate_id: 'dogfood-1:attempt-1' });
    assert.deepEqual(events.events.map((event) => event.payload.status), ['cleanup-pending', 'outcome-uncertain']);
  } finally { await f.stateStore.close(); await rm(f.root, { recursive: true, force: true }); }
});
