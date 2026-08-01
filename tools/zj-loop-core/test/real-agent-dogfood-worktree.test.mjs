import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { prepareRealAgentDogfoodWorktree } from '../dist/real-agent-dogfood-worktree.js';

const git = promisify(execFile);

test('worktree preparation requires a clean repo and creates an execution-bound branch outside it', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-real-agent-worktree-'));
  const repo = path.join(root, 'repo');
  const worktrees = path.join(root, 'worktrees');
  await mkdir(repo);
  try {
    await git('git', ['init', '-b', 'master'], { cwd: repo });
    await git('git', ['config', 'user.email', 'test@example.com'], { cwd: repo });
    await git('git', ['config', 'user.name', 'Test'], { cwd: repo });
    await writeFile(path.join(repo, 'README.md'), 'atom\n');
    await git('git', ['add', 'README.md'], { cwd: repo });
    await git('git', ['commit', '-m', 'initial'], { cwd: repo });
    const prepared = await prepareRealAgentDogfoodWorktree({ repo_root: repo, worktree_root: worktrees, execution_id: 'execution-1' });
    assert.equal(prepared.status, 'prepared');
    assert.equal(prepared.branch, 'zj-loop/real-agent-dogfood/execution-1');
    assert.match(prepared.base_commit, /^[0-9a-f]{40}$/);
    assert.equal(prepared.worktree_path, path.join(await realpath(worktrees), 'execution-1'));
    await writeFile(path.join(repo, 'README.md'), 'dirty\n');
    const blocked = await prepareRealAgentDogfoodWorktree({ repo_root: repo, worktree_root: worktrees, execution_id: 'execution-2' });
    assert.deepEqual(blocked, { status: 'blocked', reason: 'repo-not-clean' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
