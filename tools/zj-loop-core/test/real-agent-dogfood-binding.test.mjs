import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createRealAgentDogfoodExecutionBinding, validateRealAgentDogfoodExecutionBinding } from '../dist/real-agent-dogfood-binding.js';

test('worker execution binding accepts unchanged executable/argv/worktree and blocks drift', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-binding-'));
  const executable = path.join(root, 'provider');
  const worktree = path.join(root, 'worktree');
  await writeFile(executable, '#!/bin/sh\n');
  try {
    const binding = await createRealAgentDogfoodExecutionBinding({ executable, args: ['exec', '--json'], cwd: worktree, worktree_path: worktree, lease_id: 'lease-1' });
    assert.deepEqual(await validateRealAgentDogfoodExecutionBinding({ binding, executable, args: ['exec', '--json'], cwd: worktree, worktree_path: worktree, lease_id: 'lease-1' }), { status: 'accepted' });
    assert.deepEqual(await validateRealAgentDogfoodExecutionBinding({ binding, executable, args: ['exec', '--json', '--changed'], cwd: worktree, worktree_path: worktree, lease_id: 'lease-1' }), { status: 'blocked', reason: 'argv-digest-mismatch' });
    assert.deepEqual(await validateRealAgentDogfoodExecutionBinding({ binding, executable, args: ['exec', '--json'], cwd: worktree, worktree_path: path.join(root, 'other'), lease_id: 'lease-1' }), { status: 'blocked', reason: 'worktree-binding-mismatch' });
    await writeFile(executable, '#!/bin/sh\necho drift\n');
    assert.deepEqual(await validateRealAgentDogfoodExecutionBinding({ binding, executable, args: ['exec', '--json'], cwd: worktree, worktree_path: worktree, lease_id: 'lease-1' }), { status: 'blocked', reason: 'executable-digest-mismatch' });
  } finally { await rm(root, { recursive: true, force: true }); }
});
