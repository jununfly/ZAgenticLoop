import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDryRunEvidenceComment,
  buildPostMergeRoadmapCloseoutExecutionPlan,
  collectCloseoutInputFromGitHub,
  executePostMergeRoadmapCloseout,
  LIVE_CLEANUP_CONFIRMATION_PHRASE,
  parseRepositoryFromGitRemote,
} from './post-merge-roadmap-closeout.mjs';

const VALID_BODY = [
  '## Summary',
  '',
  'Fixes #99',
  '',
  '## Post-Merge Contract',
  '',
  '```yaml',
  'kind: zj-loop.post-merge-contract',
  'version: 1',
  'consumer: post-merge-cleanup',
  'mode: roadmap-closeout',
  'roadmap:',
  '  id: post-merge-closeout-executor',
  '  branch: zjal/post-merge-closeout-executor',
  'carrier:',
  '  issue: 39',
  'cleanup:',
  '  delete_merged_branch: true',
  '  close_carrier_issue: true',
  'safety:',
  '  require_pr_merged: true',
  '  require_branch_merged: true',
  '  no_pending_followups: true',
  '  missing_contract_behavior: report-only',
  '```',
].join('\n');

const MERGED_PR = {
  number: 41,
  url: 'https://github.com/jununfly/ZAgenticLoop/pull/41',
  body: VALID_BODY,
  merged: true,
  headRefName: 'zjal/post-merge-closeout-executor',
  baseRefName: 'main',
  headRepositoryOwner: 'jununfly',
  baseRepositoryOwner: 'jununfly',
};

function buildPlan(overrides = {}) {
  return buildPostMergeRoadmapCloseoutExecutionPlan({
    pr: overrides.pr ?? MERGED_PR,
    prBody: overrides.prBody ?? VALID_BODY,
    expectedRepo: 'jununfly/ZAgenticLoop',
    currentRepo: overrides.currentRepo ?? 'jununfly/ZAgenticLoop',
    gitStatus: overrides.gitStatus ?? '',
    expectedCarrierIssue: overrides.expectedCarrierIssue ?? 39,
    live: overrides.live ?? false,
  });
}

test('dry-run plan is executable only after contract and executor guards pass', () => {
  const plan = buildPlan();

  assert.equal(plan.status, 'dry-run');
  assert.equal(plan.side_effects_executed, false);
  assert.deepEqual(plan.refusals, []);
  assert.deepEqual(
    plan.actions.map((action) => action.name),
    [
      'fetch_origin',
      'switch_main',
      'fast_forward_main',
      'delete_local_branch_if_present_and_merged',
      'delete_remote_branch_if_present',
      'comment_carrier_issue',
      'close_carrier_issue',
    ],
  );
});

test('live execution runs guarded cleanup and closes only the contract carrier issue', async () => {
  const calls = [];
  const runner = async (command, args) => {
    calls.push([command, ...args]);
    const text = [command, ...args].join(' ');
    if (text === 'git branch --merged main') {
      return { exitCode: 0, stdout: '* main\n  zjal/post-merge-closeout-executor\n', stderr: '' };
    }
    if (text === 'git ls-remote --exit-code --heads origin zjal/post-merge-closeout-executor') {
      return { exitCode: 0, stdout: 'abc\trefs/heads/zjal/post-merge-closeout-executor\n', stderr: '' };
    }
    return { exitCode: 0, stdout: '', stderr: '' };
  };
  const plan = buildPlan({ live: true });
  const result = await executePostMergeRoadmapCloseout(plan, { runner });

  assert.equal(result.status, 'executed');
  assert.equal(result.side_effects_executed, true);
  assert.equal(result.runner_evidence.schema, 'zj-loop.live_runner_evidence.v1');
  assert.equal(result.runner_evidence.completion_form, 'cleanup-done');
  assert.equal(result.runner_evidence.status, 'completed');
  assert.deepEqual(calls.map((call) => call.slice(0, 4)), [
    ['git', 'fetch', 'origin'],
    ['git', 'switch', 'main'],
    ['git', 'merge', '--ff-only', 'origin/main'],
    ['git', 'show-ref', '--verify', '--quiet'],
    ['git', 'branch', '--merged', 'main'],
    ['git', 'branch', '-d', 'zjal/post-merge-closeout-executor'],
    ['git', 'ls-remote', '--exit-code', '--heads'],
    ['git', 'push', 'origin', '--delete'],
    ['gh', 'issue', 'comment', '39'],
    ['gh', 'issue', 'close', '39'],
  ]);
  assert.equal(calls.some((call) => call.includes('99')), false);
});

test('live execution skips absent local and remote branches but still records closeout', async () => {
  const calls = [];
  const runner = async (command, args) => {
    calls.push([command, ...args]);
    const text = [command, ...args].join(' ');
    if (text === 'git show-ref --verify --quiet refs/heads/zjal/post-merge-closeout-executor') {
      return { exitCode: 1, stdout: '', stderr: '' };
    }
    if (text === 'git ls-remote --exit-code --heads origin zjal/post-merge-closeout-executor') {
      return { exitCode: 2, stdout: '', stderr: '' };
    }
    return { exitCode: 0, stdout: '', stderr: '' };
  };
  const result = await executePostMergeRoadmapCloseout(buildPlan({ live: true }), { runner });

  assert.equal(result.status, 'executed');
  assert.equal(result.runner_evidence.side_effects.executed, true);
  assert.equal(calls.some((call) => call.join(' ') === 'git branch -d zjal/post-merge-closeout-executor'), false);
  assert.equal(calls.some((call) => call.join(' ') === 'git push origin --delete zjal/post-merge-closeout-executor'), false);
  assert.ok(result.execution.steps.some((step) => step.name === 'delete-local-branch' && step.status === 'skipped'));
  assert.ok(result.execution.steps.some((step) => step.name === 'delete-remote-branch' && step.status === 'skipped'));
});

test('refused live execution returns escalation-shaped runner evidence', async () => {
  const result = await executePostMergeRoadmapCloseout(buildPlan({ pr: { ...MERGED_PR, merged: false } }));

  assert.equal(result.execution.status, 'refused');
  assert.equal(result.runner_evidence.completion_form, 'escalation-issue');
  assert.equal(result.runner_evidence.status, 'escalated');
  assert.equal(result.runner_evidence.side_effects.executed, false);
});

test('refuses unmerged PR, dirty worktree, repository mismatch, and carrier mismatch before side effects', () => {
  const unmerged = buildPlan({ pr: { ...MERGED_PR, merged: false } });
  const dirty = buildPlan({ gitStatus: ' M README.md\n' });
  const wrongRepo = buildPlan({ currentRepo: 'other/repo' });
  const wrongCarrier = buildPlan({ expectedCarrierIssue: 40 });

  assert.equal(unmerged.status, 'refused');
  assert.ok(unmerged.refusals.some((refusal) => refusal.reason === 'PR must be merged'));
  assert.equal(dirty.status, 'refused');
  assert.ok(dirty.refusals.some((refusal) => refusal.guard === 'clean-worktree'));
  assert.equal(wrongRepo.status, 'refused');
  assert.ok(wrongRepo.refusals.some((refusal) => refusal.guard === 'current-repository'));
  assert.equal(wrongCarrier.status, 'refused');
  assert.ok(wrongCarrier.refusals.some((refusal) => refusal.guard === 'expected-carrier-issue'));
});

test('refuses local branch deletion when branch is not merged into main', async () => {
  const runner = async (command, args) => {
    const text = [command, ...args].join(' ');
    if (text === 'git branch --merged main') {
      return { exitCode: 0, stdout: '* main\n', stderr: '' };
    }
    return { exitCode: 0, stdout: '', stderr: '' };
  };

  await assert.rejects(
    executePostMergeRoadmapCloseout(buildPlan({ live: true }), { runner }),
    /not listed in git branch --merged main/,
  );
});

test('parses common GitHub remote URL shapes into repo names', () => {
  assert.equal(parseRepositoryFromGitRemote('git@github.com:jununfly/ZAgenticLoop.git'), 'jununfly/ZAgenticLoop');
  assert.equal(parseRepositoryFromGitRemote('https://github.com/jununfly/ZAgenticLoop.git'), 'jununfly/ZAgenticLoop');
  assert.equal(parseRepositoryFromGitRemote('https://x-access-token:TOKEN@github.com/jununfly/ZAgenticLoop.git'), 'jununfly/ZAgenticLoop');
});

test('collects GitHub CLI PR fields and normalizes merged and repository owners', async () => {
  const runner = async (command, args) => {
    const text = [command, ...args].join(' ');
    if (text.startsWith('gh pr view 41 --json ')) {
      assert.match(text, /mergedAt/);
      assert.doesNotMatch(text, /\bmerged,/);
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          number: 41,
          body: VALID_BODY,
          mergedAt: '2026-07-07T00:00:00Z',
          baseRefName: 'main',
          headRefName: 'zjal/post-merge-closeout-executor',
          headRepositoryOwner: { login: 'jununfly' },
          isCrossRepository: false,
        }),
        stderr: '',
      };
    }
    if (text === 'git remote get-url origin') {
      return { exitCode: 0, stdout: 'git@github.com:jununfly/ZAgenticLoop.git\n', stderr: '' };
    }
    if (text === 'git status --porcelain') {
      return { exitCode: 0, stdout: '', stderr: '' };
    }
    throw new Error(`unexpected command: ${text}`);
  };

  const input = await collectCloseoutInputFromGitHub({
    prNumber: 41,
    expectedRepo: 'jununfly/ZAgenticLoop',
    runner,
  });

  assert.equal(input.pr.merged, true);
  assert.equal(input.pr.headRepositoryOwner, 'jununfly');
  assert.equal(input.pr.baseRepositoryOwner, 'jununfly');
  assert.equal(input.currentRepo, 'jununfly/ZAgenticLoop');
});

test('dry-run evidence comment is generated by the executor with a structured block and live command', () => {
  const plan = buildPlan();
  const comment = buildDryRunEvidenceComment(plan, {
    artifactName: 'post-merge-roadmap-closeout-plan-41',
  });

  assert.match(comment, /Post-merge roadmap closeout dry-run passed/);
  assert.match(comment, /kind: zj-loop.post-merge-closeout-dry-run/);
  assert.match(comment, /side_effects_executed: false/);
  assert.match(comment, /artifact: post-merge-roadmap-closeout-plan-41/);
  assert.match(comment, /npm run post-merge-closeout -- --pr 41 --repo jununfly\/ZAgenticLoop --carrier-issue 39 --live/);
});

test('dry-run evidence comment records refusals instead of suggesting live cleanup', () => {
  const plan = buildPlan({ gitStatus: ' M README.md\n' });
  const comment = buildDryRunEvidenceComment(plan);

  assert.match(comment, /dry-run recorded a refusal/);
  assert.match(comment, /Refusal: executor\/clean-worktree/);
  assert.match(comment, /Live cleanup is not available/);
});

test('live workflow confirmation phrase is fixed and explicit', () => {
  assert.equal(LIVE_CLEANUP_CONFIRMATION_PHRASE, 'DELETE_MERGED_ROADMAP_BRANCH_AND_CLOSE_CARRIER');
});
