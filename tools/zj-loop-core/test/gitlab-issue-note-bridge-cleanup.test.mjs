import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PURGE_GITLAB_ISSUE_NOTE_BRIDGE_RECEIPTS, purgeGitLabIssueNoteBridgeReceipts } from '../dist/index.js';

test('receipt cleanup is dry-run by default and excludes recovery-pending records', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'zj-loop-cleanup-'));
  try {
    const directory = path.join(root, 'zj-loop/evidence/gitlab-issue-note-bridge/receipts/aaaaaaaaaaaaaaaa');
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'bbbbbbbbbbbbbbbb.json'), JSON.stringify({
      status: 'triggered',
      updated_at: '2026-01-01T00:00:00.000Z',
      envelope: { dedupe_key: 'gln_old' },
    }));
    const result = await purgeGitLabIssueNoteBridgeReceipts({ root, now: '2026-07-17T00:00:00.000Z' });
    assert.equal(result.status, 'dry-run');
    assert.equal(result.candidates.length, 1);
    const blocked = await purgeGitLabIssueNoteBridgeReceipts({ root, now: '2026-07-17T00:00:00.000Z', dryRun: false });
    assert.equal(blocked.status, 'blocked');
    assert.equal(blocked.reason, 'purge-confirmation-required');
    assert.equal(PURGE_GITLAB_ISSUE_NOTE_BRIDGE_RECEIPTS, 'PURGE_GITLAB_ISSUE_NOTE_BRIDGE_RECEIPTS');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
