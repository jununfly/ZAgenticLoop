import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { observeRealAgentDogfoodGitScope } from '../dist/real-agent-dogfood-git-scope.js';

const run = promisify(execFile);

async function initRepo() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-git-scope-'));
  await mkdir(root, { recursive: true });
  await run('git', ['init', '-b', 'master'], { cwd: root });
  await run('git', ['config', 'user.email', 'test@example.com'], { cwd: root });
  await run('git', ['config', 'user.name', 'Test'], { cwd: root });
  await writeFile(path.join(root, 'README.md'), 'base\n');
  await run('git', ['add', 'README.md'], { cwd: root });
  await run('git', ['commit', '-m', 'base'], { cwd: root });
  const { stdout } = await run('git', ['rev-parse', 'HEAD'], { cwd: root });
  return { root, baseline: stdout.trim() };
}

test('Git scope observation proves the exact allowed committed file and clean baseline parent', async () => {
  const { root, baseline } = await initRepo();
  try {
    await writeFile(path.join(root, 'allowed.txt'), 'dogfood\n');
    await run('git', ['add', 'allowed.txt'], { cwd: root });
    await run('git', ['commit', '-m', 'dogfood test'], { cwd: root });
    const observed = await observeRealAgentDogfoodGitScope({ repo_root: root, baseline_commit: baseline, allowed_files: ['allowed.txt'] });
    assert.equal(observed.schema, 'zj-loop.real_agent_dogfood_git_scope_observation.v1');
    assert.equal(observed.scope.status, 'valid');
    assert.deepEqual(observed.changed_files, ['allowed.txt']);
    assert.deepEqual(observed.uncommitted_files, []);
    assert.equal(observed.commit_parent, baseline);
    assert.equal(observed.diff_check_passed, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('Git scope observation blocks an extra file and leaves the raw facts visible', async () => {
  const { root, baseline } = await initRepo();
  try {
    await writeFile(path.join(root, 'allowed.txt'), 'dogfood\n');
    await writeFile(path.join(root, 'extra.txt'), 'out of scope\n');
    await run('git', ['add', 'allowed.txt', 'extra.txt'], { cwd: root });
    await run('git', ['commit', '-m', 'scope drift'], { cwd: root });
    await writeFile(path.join(root, 'dirty.txt'), 'uncommitted\n');
    const observed = await observeRealAgentDogfoodGitScope({ repo_root: root, baseline_commit: baseline, allowed_files: ['allowed.txt'] });
    assert.deepEqual(observed.changed_files, ['allowed.txt', 'extra.txt']);
    assert.deepEqual(observed.uncommitted_files, ['dirty.txt']);
    assert.deepEqual(observed.scope, { status: 'blocked', reason: 'write-scope-file-drift' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
