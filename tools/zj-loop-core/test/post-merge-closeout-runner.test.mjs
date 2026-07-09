import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDryRunEvidenceComment,
  buildPostMergeRoadmapCloseoutExecutionPlan,
  collectCloseoutInputFromGitHub,
  LIVE_CLEANUP_CONFIRMATION_PHRASE,
  parseRepositoryFromGitRemote,
} from '../dist/index.js';

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

test('post-merge closeout dry-run plan requires contract and executor guards', () => {
  const plan = buildPlan();

  assert.equal(plan.kind, 'zj-loop.post-merge-roadmap-closeout-executor');
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

test('post-merge closeout plan refuses unsafe executor contexts', () => {
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

test('post-merge dry-run evidence comment uses packaged command names', () => {
  const comment = buildDryRunEvidenceComment(buildPlan(), {
    artifactName: 'post-merge-roadmap-closeout-plan-41',
  });

  assert.match(comment, /Post-merge roadmap closeout dry-run passed/);
  assert.match(comment, /kind: zj-loop.post-merge-closeout-dry-run/);
  assert.match(comment, /side_effects_executed: false/);
  assert.match(comment, /artifact: post-merge-roadmap-closeout-plan-41/);
  assert.match(comment, /zj-loop-post-merge-closeout live-closeout --pr 41 --repo jununfly\/ZAgenticLoop --carrier-issue 39/);
  assert.match(comment, new RegExp(LIVE_CLEANUP_CONFIRMATION_PHRASE));
});

test('post-merge GitHub input collection normalizes PR and repository evidence', async () => {
  const runner = async (command, args) => {
    const text = [command, ...args].join(' ');
    if (text.startsWith('gh pr view 41 --json ')) {
      assert.match(text, /mergedAt/);
      return {
        command,
        args,
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
      return { command, args, exitCode: 0, stdout: 'git@github.com:jununfly/ZAgenticLoop.git\n', stderr: '' };
    }
    if (text === 'git status --porcelain') {
      return { command, args, exitCode: 0, stdout: '', stderr: '' };
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

test('post-merge repository URL parser handles common GitHub remotes', () => {
  assert.equal(parseRepositoryFromGitRemote('git@github.com:jununfly/ZAgenticLoop.git'), 'jununfly/ZAgenticLoop');
  assert.equal(parseRepositoryFromGitRemote('https://github.com/jununfly/ZAgenticLoop.git'), 'jununfly/ZAgenticLoop');
  assert.equal(parseRepositoryFromGitRemote('https://x-access-token:TOKEN@github.com/jununfly/ZAgenticLoop.git'), 'jununfly/ZAgenticLoop');
});
