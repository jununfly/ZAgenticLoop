import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { test } from 'node:test';
import {
  createRealAgentDogfoodVerificationPlan,
  prepareDisposableRealAgentDogfoodVerifierWorktree,
  verifyDisposableRealAgentDogfoodWorktreeCleanup,
} from '../dist/real-agent-dogfood-independent-verification.js';

const execFile = promisify(execFileCallback);

async function git(cwd, ...args) {
  await execFile('git', args, { cwd });
}

test('creates a frozen independent verification plan with fixed commands', () => {
  const plan = createRealAgentDogfoodVerificationPlan({
    execution_id: 'execution-1',
    attempt: 1,
    verifier_id: 'verifier-process-1',
    input_commit: 'a'.repeat(40),
    repo_root: '/repo',
    verifier_worktree_root: '/tmp/verifiers',
    commands: [
      { id: 'manifest', executable: 'git', args: ['diff', '--exit-code'], timeout_ms: 10_000 },
      { id: 'tests', executable: 'npm', args: ['test'], timeout_ms: 60_000 },
    ],
  });
  assert.equal(plan.schema, 'zj-loop.real_agent_dogfood_verification_plan.v1');
  assert.equal(plan.verifier.identity, 'verifier-process-1');
  assert.match(plan.plan_digest, /^sha256:[0-9a-f]{64}$/);
  assert.throws(() => createRealAgentDogfoodVerificationPlan({
    ...plan,
    commands: [...plan.commands, { id: 'agent-status', executable: 'git', args: ['status'], timeout_ms: 10_000 }],
  }), /verification-plan-input-invalid/);
});

test('prepares and removes a disposable verifier worktree with cleanup proof', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'zj-verifier-'));
  const repo = path.join(root, 'repo');
  const worktrees = path.join(root, 'worktrees');
  await mkdir(repo);
  await git(repo, 'init', '-q');
  await git(repo, 'config', 'user.email', 'test@example.invalid');
  await git(repo, 'config', 'user.name', 'test');
  await writeFile(path.join(repo, 'README.md'), 'fixture\n');
  await git(repo, 'add', 'README.md');
  await git(repo, 'commit', '-qm', 'fixture');
  const commit = (await execFile('git', ['rev-parse', 'HEAD'], { cwd: repo })).stdout.trim();
  const prepared = await prepareDisposableRealAgentDogfoodVerifierWorktree({ repo_root: repo, worktree_root: worktrees, execution_id: 'execution-1', attempt: 1, input_commit: commit, verifier_id: 'verifier-1' });
  assert.equal(prepared.status, 'prepared');
  assert.equal(prepared.verifier_id, 'verifier-1');
  assert.equal((await verifyDisposableRealAgentDogfoodWorktreeCleanup({ worktree_path: prepared.worktree_path, repo_root: repo })).status, 'clean');
});
