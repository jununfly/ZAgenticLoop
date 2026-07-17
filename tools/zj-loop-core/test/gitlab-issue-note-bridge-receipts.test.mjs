import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RESUME_GITLAB_ISSUE_NOTE_BRIDGE_TRIGGER,
  bridgeReceiptPaths,
  buildGitLabIssueNoteBridgeEnvelope,
  classifyGitLabIssueNoteBridgePending,
  persistGitLabIssueNoteBridgeReceipt,
  updateGitLabIssueNoteBridgeReceipt,
} from '../dist/index.js';

const envelope = buildGitLabIssueNoteBridgeEnvelope({
  headers: { event: 'Issue Hook', eventId: 'event-receipt-1', triggerToken: 'secret' },
  projectPath: 'mlive-dev/ai-studio',
  expectedProjectPath: 'mlive-dev/ai-studio',
  expectedTriggerToken: 'secret',
  route: { routeId: 'roadmap-activation-note', marker: '/zj-loop start roadmap-sliced-development', targetRoute: 'roadmap-sliced-development', targetRef: 'master' },
  receivedAt: '2026-07-17T00:00:00.000Z',
  payload: {
    object_kind: 'issue',
    project: { path_with_namespace: 'mlive-dev/ai-studio' },
    issue: { iid: 42 },
    object_attributes: { id: 99, note: '/zj-loop start roadmap-sliced-development', noteable_type: 'Issue', noteable_iid: 42, action: 'create' },
  },
}).envelope;

test('persists receipt and dedupe record with hashed paths and no payload copy', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'zj-loop-receipts-'));
  try {
    const result = await persistGitLabIssueNoteBridgeReceipt({ root, envelope, routeId: 'roadmap-activation-note', now: '2026-07-17T00:00:01.000Z' });
    assert.equal(result.status, 'created');
    assert.equal(result.receipt.status, 'deduplicated');
    assert.match(result.receipt_path, /^zj-loop\/evidence\/gitlab-issue-note-bridge\/receipts\/[a-f0-9]{16}\/[a-f0-9]{16}\.json$/);
    assert.match(result.dedupe_path, /^zj-loop\/evidence\/gitlab-issue-note-bridge\/dedupe\/[a-f0-9]{16}\/[a-f0-9]{16}\.json$/);
    const stored = await readFile(path.join(root, result.dedupe_path), 'utf8');
    assert.equal(stored.includes('roadmap-sliced-development'), false);
    assert.equal(stored.includes('secret'), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('returns duplicate for a replay and event-id-collision for a conflicting event', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'zj-loop-receipts-'));
  try {
    const input = { root, envelope, routeId: 'roadmap-activation-note', projectPath: envelope.project_path, eventId: envelope.event_id, dedupeKey: envelope.dedupe_key, now: '2026-07-17T00:00:01.000Z' };
    await persistGitLabIssueNoteBridgeReceipt(input);
    const duplicate = await persistGitLabIssueNoteBridgeReceipt({ ...input, now: '2026-07-17T00:00:02.000Z' });
    assert.equal(duplicate.status, 'duplicate');
    const collision = await persistGitLabIssueNoteBridgeReceipt({ ...input, envelope: { ...envelope, issue_iid: 43 } });
    assert.equal(collision.status, 'event-id-collision');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('updates trigger state and requires explicit bounded recovery', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'zj-loop-receipts-'));
  try {
    const input = { root, envelope, routeId: 'roadmap-activation-note', projectPath: envelope.project_path, eventId: envelope.event_id, dedupeKey: envelope.dedupe_key, now: '2026-07-17T00:00:01.000Z' };
    await persistGitLabIssueNoteBridgeReceipt(input);
    await updateGitLabIssueNoteBridgeReceipt({ ...input, status: 'trigger-pending', now: '2026-07-17T00:00:02.000Z' });
    const uncertain = await updateGitLabIssueNoteBridgeReceipt({ ...input, status: 'trigger-uncertain', now: '2026-07-17T00:11:00.000Z', recoveryReason: 'provider-state-unknown' });
    assert.equal(uncertain.status, 'trigger-uncertain');
    await assert.rejects(
      updateGitLabIssueNoteBridgeReceipt({ ...input, status: 'trigger-pending', now: '2026-07-17T00:12:00.000Z' }),
      /resume-confirmation-required/,
    );
    const resumed = await updateGitLabIssueNoteBridgeReceipt({ ...input, status: 'trigger-pending', now: '2026-07-17T00:12:00.000Z', confirm: RESUME_GITLAB_ISSUE_NOTE_BRIDGE_TRIGGER });
    assert.equal(resumed.recovery_attempts, 1);
    await updateGitLabIssueNoteBridgeReceipt({ ...input, status: 'trigger-uncertain', now: '2026-07-17T00:13:00.000Z' });
    await assert.rejects(
      updateGitLabIssueNoteBridgeReceipt({ ...input, status: 'trigger-pending', now: '2026-07-17T00:14:00.000Z', confirm: RESUME_GITLAB_ISSUE_NOTE_BRIDGE_TRIGGER }),
      /recovery-attempt-limit/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('classifies stale pending state without triggering or querying a provider', () => {
  assert.equal(classifyGitLabIssueNoteBridgePending({ status: 'trigger-pending', updatedAt: '2026-07-17T00:00:00.000Z', now: '2026-07-17T00:09:59.999Z' }), 'trigger-pending');
  assert.equal(classifyGitLabIssueNoteBridgePending({ status: 'trigger-pending', updatedAt: '2026-07-17T00:00:00.000Z', now: '2026-07-17T00:10:00.000Z' }), 'trigger-uncertain');
});
