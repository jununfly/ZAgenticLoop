import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  closeoutWorkspaceReview,
  WORKSPACE_CLOSEOUT_CONFIRMATION_PHRASE,
} from '../dist/index.js';

test('Workspace closeout remains resumable until review acceptance then archives the local carrier idempotently', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'zj-loop-workspace-closeout-'));
  const orchestrationId = 'orch_workspace_1';
  try {
    await mkdir(path.join(root, 'zj-loop', 'requests'), { recursive: true });
    await mkdir(path.join(root, 'zj-loop', 'reviews', orchestrationId), { recursive: true });
    await writeFile(path.join(root, 'zj-loop', 'requests', `${orchestrationId}.json`), '{"status":"requested"}\n');
    await writeFile(path.join(root, 'zj-loop', 'reviews', orchestrationId, 'changed-files.json'), '{"changed_files":["README.md"]}\n');

    const pending = await closeoutWorkspaceReview({
      root,
      orchestrationId,
      now: '2026-07-14T00:00:00.000Z',
    });
    assert.equal(pending.status, 'resumable');
    assert.equal(pending.reason, 'workspace-review-acceptance-required');
    assert.deepEqual(pending.resume_command, [
      'zj-loop-workspace-closeout',
      '--orchestration',
      orchestrationId,
      '--confirm',
      WORKSPACE_CLOSEOUT_CONFIRMATION_PHRASE,
    ]);
    await readFile(path.join(root, pending.carrier_path), 'utf8');

    const completed = await closeoutWorkspaceReview({
      root,
      orchestrationId,
      confirmation: WORKSPACE_CLOSEOUT_CONFIRMATION_PHRASE,
      now: '2026-07-14T00:01:00.000Z',
    });
    assert.equal(completed.status, 'completed');
    assert.equal(completed.reason, 'workspace-review-accepted-and-carrier-archived');
    await readFile(path.join(root, completed.archive_path), 'utf8');
    await assert.rejects(readFile(path.join(root, completed.carrier_path), 'utf8'));

    const repeated = await closeoutWorkspaceReview({
      root,
      orchestrationId,
      now: '2026-07-14T00:02:00.000Z',
    });
    assert.equal(repeated.status, 'completed');
    assert.equal(repeated.reason, 'workspace-closeout-already-completed');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
