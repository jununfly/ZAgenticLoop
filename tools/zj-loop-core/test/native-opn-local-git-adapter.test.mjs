import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLocalGitNativeOpnGraphMergeAdapter } from '../dist/native-opn-graph-merge.js';

const authorization = {
  source_commit_sha: 'a'.repeat(40),
  target_ref: 'refs/heads/main',
  target_worktree_ref: 'worktree:graph-merge-target',
  strategy: 'fast-forward-only',
  scope_digest: `sha256:${'1'.repeat(64)}`,
  deterministic_gate_digest: `sha256:${'2'.repeat(64)}`,
};

test('local Git adapter observes a clean target and performs only the approved fast-forward command', async () => {
  const calls = [];
  let headReads = 0;
  const adapter = createLocalGitNativeOpnGraphMergeAdapter({
    repo_root: '/repo', target_worktree_ref: authorization.target_worktree_ref, authorization, scope_digest: authorization.scope_digest,
    runGit: async (args) => {
      calls.push(args);
      const command = args.join(' ');
      if (command === 'symbolic-ref --quiet --short HEAD') return { status: 0, stdout: 'main\n' };
      if (command === 'rev-parse HEAD') { headReads += 1; return { status: 0, stdout: `${headReads < 3 ? 'b'.repeat(40) : authorization.source_commit_sha}\n` }; }
      if (command === `rev-parse ${authorization.source_commit_sha}`) return { status: 0, stdout: `${authorization.source_commit_sha}\n` };
      if (command === `merge-base --is-ancestor ${'b'.repeat(40)} ${authorization.source_commit_sha}`) return { status: 0, stdout: '' };
      if (command === 'status --porcelain') return { status: 0, stdout: '' };
      if (command === `merge --ff-only ${authorization.source_commit_sha}`) return { status: 0, stdout: 'Fast-forward\n' };
      throw new Error(`unexpected git command: ${command}`);
    },
  });
  const observed = await adapter.observe();
  assert.deepEqual(observed, { target_ref: 'refs/heads/main', target_worktree_ref: authorization.target_worktree_ref, target_head: 'b'.repeat(40), source_commit_reachable: true, fast_forward_possible: true, target_clean: true, scope_digest: authorization.scope_digest });
  const result = await adapter.execute({ authorization, expected_target_head: 'b'.repeat(40) });
  assert.deepEqual(result, { status: 'merged', target_head: authorization.source_commit_sha, side_effects_executed: true });
  assert.deepEqual(calls.at(-2), ['merge', '--ff-only', authorization.source_commit_sha]);
});
