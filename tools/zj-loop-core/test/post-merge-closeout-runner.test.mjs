import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  buildDryRunEvidenceComment,
  buildGitLabMergeRequestApiUrl,
  buildPostMergeRoadmapCloseoutExecutionPlan,
  collectCloseoutInputFromGitHub,
  collectCloseoutInputFromGitLab,
  executePostMergeRoadmapCloseout,
  LIVE_CLEANUP_CONFIRMATION_PHRASE,
  normalizeGitLabMrView,
  parseRepositoryFromGitRemote,
} from '../dist/index.js';

const POST_MERGE_CLOSEOUT_CLI = fileURLToPath(new URL('../dist/post-merge-closeout-cli.js', import.meta.url));

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
  assert.equal(plan.confirmation.required, false);
  assert.equal(plan.confirmation.authorization_source, 'merged-pr-contract');
  assert.equal(plan.confirmation.required_phrase, LIVE_CLEANUP_CONFIRMATION_PHRASE);
  assert.deepEqual(plan.refusals, []);
  assert.deepEqual(
    plan.actions.map((action) => action.name),
    [
      'fetch_origin',
      'switch_target_branch',
      'fast_forward_target_branch',
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

test('post-merge closeout normalizes GitLab MR metadata into closeout plans', () => {
  const mr = normalizeGitLabMrView({
    iid: 9,
    web_url: 'https://gitlab.com/group/project/-/merge_requests/9',
    description: VALID_BODY,
    state: 'merged',
    source_branch: 'zjal/post-merge-closeout-executor',
    target_branch: 'main',
    project_path: 'group/project',
  }, { expectedRepo: 'group/project' });
  const plan = buildPostMergeRoadmapCloseoutExecutionPlan({
    pr: mr,
    prBody: mr.body,
    expectedRepo: 'group/project',
    currentRepo: 'group/project',
    gitStatus: '',
    expectedCarrierIssue: 39,
  });

  assert.equal(plan.status, 'dry-run');
  assert.equal(plan.review.provider, 'gitlab');
  assert.equal(plan.review.kind, 'merge-request');
  assert.equal(plan.review.number, 9);
  assert.equal(plan.pr.provider, 'gitlab');
  assert.equal(plan.pr.reviewKind, 'merge-request');
  assert.deepEqual(plan.refusals, []);
});

test('post-merge closeout fetches GitLab MR metadata by IID', async () => {
  const calls = [];
  const input = await collectCloseoutInputFromGitLab({
    iid: 9,
    expectedRepo: 'group/subgroup/project',
    apiBaseUrl: 'https://gitlab.example.test/api/v4/',
    jobToken: 'job-token-1',
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            iid: 9,
            web_url: 'https://gitlab.example.test/group/subgroup/project/-/merge_requests/9',
            description: VALID_BODY,
            state: 'merged',
            merged_at: '2026-07-11T01:02:03Z',
            source_branch: 'zjal/post-merge-closeout-executor',
            target_branch: 'release/current',
            source_project_path: 'group/subgroup/project',
            target_project_path: 'group/subgroup/project',
          };
        },
      };
    },
  });

  assert.equal(calls[0].url, 'https://gitlab.example.test/api/v4/projects/group%2Fsubgroup%2Fproject/merge_requests/9');
  assert.equal(calls[0].init.headers['JOB-TOKEN'], 'job-token-1');
  assert.equal(input.pr.provider, 'gitlab');
  assert.equal(input.pr.reviewKind, 'merge-request');
  assert.equal(input.pr.number, 9);
  assert.equal(input.pr.merged, true);
  assert.equal(input.pr.baseRefName, 'release/current');
  assert.equal(input.pr.headRefName, 'zjal/post-merge-closeout-executor');
  assert.equal(input.prBody, VALID_BODY);
});

test('post-merge closeout builds encoded GitLab MR API URLs', () => {
  assert.equal(
    buildGitLabMergeRequestApiUrl({
      apiBaseUrl: 'https://gitlab.com/api/v4',
      projectPath: 'group/subgroup/project',
      iid: 12,
    }),
    'https://gitlab.com/api/v4/projects/group%2Fsubgroup%2Fproject/merge_requests/12',
  );
});

for (const targetBranch of ['main', 'master', 'release/current']) {
  test(`post-merge closeout accepts GitLab target branch ${targetBranch}`, () => {
    const mr = normalizeGitLabMrView({
      iid: 10,
      web_url: 'https://gitlab.com/group/project/-/merge_requests/10',
      description: VALID_BODY,
      state: 'merged',
      source_branch: 'zjal/post-merge-closeout-executor',
      target_branch: targetBranch,
      project_path: 'group/project',
    }, { expectedRepo: 'group/project' });
    const plan = buildPostMergeRoadmapCloseoutExecutionPlan({
      pr: mr,
      prBody: mr.body,
      expectedRepo: 'group/project',
      currentRepo: 'group/project',
      gitStatus: '',
      expectedCarrierIssue: 39,
    });

    assert.equal(plan.status, 'dry-run');
    assert.equal(plan.review.targetRefName, targetBranch);
    assert.equal(plan.roadmap.targetBranch, targetBranch);
    assert.deepEqual(plan.refusals, []);
    assert.deepEqual(
      plan.actions.filter((action) => action.command).map((action) => action.command),
      [
        ['git', 'fetch', 'origin'],
        ['git', 'switch', targetBranch],
        ['git', 'merge', '--ff-only', `origin/${targetBranch}`],
      ],
    );
  });
}

test('post-merge closeout live execution deletes only contract branch and closes only carrier issue', async () => {
  const calls = [];
  const runner = async (command, args) => {
    calls.push([command, ...args]);
    const text = [command, ...args].join(' ');
    if (text === 'git branch --merged main') {
      return { command, args, exitCode: 0, stdout: '* main\n  zjal/post-merge-closeout-executor\n', stderr: '' };
    }
    if (text === 'git ls-remote --exit-code --heads origin zjal/post-merge-closeout-executor') {
      return { command, args, exitCode: 0, stdout: 'abc\trefs/heads/zjal/post-merge-closeout-executor\n', stderr: '' };
    }
    return { command, args, exitCode: 0, stdout: '', stderr: '' };
  };
  const result = await executePostMergeRoadmapCloseout(buildPlan({ live: true }), { runner });

  assert.equal(result.status, 'executed');
  assert.equal(result.side_effects_executed, true);
  assert.equal(result.runner_evidence.schema, 'zj-loop.live_runner_evidence.v1');
  assert.equal(result.runner_evidence.completion_form, 'cleanup-done');
  assert.equal(calls.some((call) => call.join(' ') === 'git branch -d zjal/post-merge-closeout-executor'), true);
  assert.equal(calls.some((call) => call.join(' ') === 'git push origin --delete zjal/post-merge-closeout-executor'), true);
  assert.equal(calls.some((call) => call.join(' ') === 'gh issue close 39 --comment Closing this Roadmap-Sliced Development activation carrier after post-merge closeout.\n\n- Review: PR #41\n- Roadmap branch: `zjal/post-merge-closeout-executor`\n- Contract guard: valid `zj-loop.post-merge-contract` with `no_pending_followups: true`.'), true);
  assert.equal(calls.some((call) => call.includes('99')), false);
});

test('post-merge closeout live execution refuses unmerged branch deletion', async () => {
  const runner = async (command, args) => {
    const text = [command, ...args].join(' ');
    if (text === 'git branch --merged main') {
      return { command, args, exitCode: 0, stdout: '* main\n', stderr: '' };
    }
    return { command, args, exitCode: 0, stdout: '', stderr: '' };
  };

  await assert.rejects(
    executePostMergeRoadmapCloseout(buildPlan({ live: true }), { runner }),
    /not listed in git branch --merged main/,
  );
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
  assert.doesNotMatch(comment, /--confirm-live-cleanup/);
  assert.match(comment, /Live cleanup authorization/);
  assert.match(comment, /Authorization source: merged-pr-contract/);
  assert.match(comment, /Confirmation required: false/);
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

test('post-merge closeout-plan CLI accepts explicit GitLab MR metadata', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-post-merge-gitlab-'));
  const bodyPath = path.join(dir, 'mr-body.md');
  await writeFile(bodyPath, VALID_BODY);
  try {
    const result = spawnSync(process.execPath, [
      POST_MERGE_CLOSEOUT_CLI,
      'closeout-plan',
      '--provider',
      'gitlab',
      '--repo',
      'group/project',
      '--merge-request',
      '9',
      '--review-url',
      'https://gitlab.com/group/project/-/merge_requests/9',
      '--review-body-file',
      bodyPath,
      '--source-branch',
      'zjal/post-merge-closeout-executor',
      '--target-branch',
      'main',
      '--merged',
      '--carrier-issue',
      '39',
      '--json',
    ], { encoding: 'utf8' });

    assert.equal(result.status, 0);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.status, 'dry-run');
    assert.equal(parsed.review.provider, 'gitlab');
    assert.equal(parsed.review.kind, 'merge-request');
    assert.equal(parsed.repository.expected, 'group/project');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('post-merge GitLab dry-run comment uses MR and GitLab manual pipeline wording', () => {
  const mr = normalizeGitLabMrView({
    iid: 9,
    web_url: 'https://gitlab.com/group/project/-/merge_requests/9',
    description: VALID_BODY,
    state: 'merged',
    source_branch: 'zjal/post-merge-closeout-executor',
    target_branch: 'main',
    project_path: 'group/project',
  }, { expectedRepo: 'group/project' });
  const plan = buildPostMergeRoadmapCloseoutExecutionPlan({
    pr: mr,
    prBody: mr.body,
    expectedRepo: 'group/project',
    currentRepo: 'group/project',
    gitStatus: '',
    expectedCarrierIssue: 39,
  });
  const comment = buildDryRunEvidenceComment(plan, {
    artifactName: 'post-merge-roadmap-closeout-plan-9',
  });

  assert.match(comment, /Review: MR #9/);
  assert.match(comment, /Review GitLab artifact closeout-plan\.json/);
  assert.match(comment, /dry-run\/live-plan evidence only/);
  assert.doesNotMatch(comment, /ZJ_LOOP_LIVE_CLEANUP_CONFIRMATION/);
  assert.doesNotMatch(comment, /GitLab manual job zj_loop_post_merge_cleanup/);
  assert.doesNotMatch(comment, /ZJ_LOOP_MERGE_REQUEST_IID=9/);
  assert.doesNotMatch(comment, /workflow_dispatch/);
  assert.doesNotMatch(comment, /GitHub Actions/);
  assert.doesNotMatch(comment, /PR #9/);
});

test('post-merge repository URL parser handles common GitHub remotes', () => {
  assert.equal(parseRepositoryFromGitRemote('git@github.com:jununfly/ZAgenticLoop.git'), 'jununfly/ZAgenticLoop');
  assert.equal(parseRepositoryFromGitRemote('https://github.com/jununfly/ZAgenticLoop.git'), 'jununfly/ZAgenticLoop');
  assert.equal(parseRepositoryFromGitRemote('https://x-access-token:TOKEN@github.com/jununfly/ZAgenticLoop.git'), 'jununfly/ZAgenticLoop');
  assert.equal(parseRepositoryFromGitRemote('https://gitlab.com/group/subgroup/project.git'), 'group/subgroup/project');
  assert.equal(parseRepositoryFromGitRemote('ssh://git@gitlab.example.com/team/platform/project.git'), 'team/platform/project');
});
