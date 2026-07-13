import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGitLabApiUrl,
  buildGitLabAuthHeaders,
  buildGitLabBranchApiUrl,
  buildGitLabIssueApiUrl,
  buildGitLabMergeRequestApiUrl,
  buildProviderIssueUrl,
  buildProviderAuditMetadata,
  detectProviderKind,
  gitLabFailureReason,
  parseGitRemoteRepository,
  parseProviderIssueUrl,
  parseProviderReviewUrl,
} from '../dist/index.js';

test('detectProviderKind keeps provider detection policy shared', () => {
  assert.equal(detectProviderKind({ remote: 'git@github.com:jununfly/ZAgenticLoop.git' }), 'github');
  assert.equal(detectProviderKind({ githubActions: true }), 'github');
  assert.equal(detectProviderKind({ remote: 'https://gitlab.com/group/project.git' }), 'gitlab');
  assert.equal(detectProviderKind({ gitlabCi: true }), 'gitlab');
  assert.equal(detectProviderKind({ glabMentioned: true }), 'gitlab');
  assert.equal(detectProviderKind({ remote: 'https://example.com/group/project.git' }), 'manual');
});

test('parseGitRemoteRepository normalizes GitHub, GitLab, and self-managed GitLab remotes', () => {
  assert.deepEqual(
    parseGitRemoteRepository('git@github.com:jununfly/ZAgenticLoop.git'),
    {
      provider: 'github',
      host: 'github.com',
      ownerPath: 'jununfly',
      name: 'ZAgenticLoop',
      slug: 'jununfly/ZAgenticLoop',
      remoteUrl: 'git@github.com:jununfly/ZAgenticLoop.git',
    },
  );

  assert.deepEqual(
    parseGitRemoteRepository('https://gitlab.com/group/subgroup/project.git'),
    {
      provider: 'gitlab',
      host: 'gitlab.com',
      ownerPath: 'group/subgroup',
      name: 'project',
      slug: 'group/subgroup/project',
      remoteUrl: 'https://gitlab.com/group/subgroup/project.git',
    },
  );

  assert.deepEqual(
    parseGitRemoteRepository('ssh://git@git.bilibili.co/team/platform/project.git', { providerHint: 'gitlab' }),
    {
      provider: 'gitlab',
      host: 'git.bilibili.co',
      ownerPath: 'team/platform',
      name: 'project',
      slug: 'team/platform/project',
      remoteUrl: 'ssh://git@git.bilibili.co/team/platform/project.git',
    },
  );
});

test('parseProviderIssueUrl normalizes provider issue carriers', () => {
  assert.deepEqual(parseProviderIssueUrl('https://github.com/jununfly/ZAgenticLoop/issues/87'), {
    provider: 'github',
    host: 'github.com',
    projectPath: 'jununfly/ZAgenticLoop',
    issue: 87,
    url: 'https://github.com/jununfly/ZAgenticLoop/issues/87',
  });

  assert.deepEqual(parseProviderIssueUrl('https://gitlab.com/group/subgroup/project/-/issues/42'), {
    provider: 'gitlab',
    host: 'gitlab.com',
    projectPath: 'group/subgroup/project',
    issue: 42,
    url: 'https://gitlab.com/group/subgroup/project/-/issues/42',
  });
});

test('buildProviderIssueUrl formats GitHub, GitLab, and self-managed GitLab issue URLs', () => {
  assert.equal(
    buildProviderIssueUrl({ provider: 'github', repo: 'jununfly/ZAgenticLoop', issue: 87 }),
    'https://github.com/jununfly/ZAgenticLoop/issues/87',
  );
  assert.equal(
    buildProviderIssueUrl({ provider: 'gitlab', repo: 'group/subgroup/project', issue: 42 }),
    'https://gitlab.com/group/subgroup/project/-/issues/42',
  );
  assert.equal(
    buildProviderIssueUrl({ provider: 'gitlab', host: 'git.example.test', projectPath: 'team/project', issue: '9' }),
    'https://git.example.test/team/project/-/issues/9',
  );
  assert.equal(buildProviderIssueUrl({ provider: 'manual', repo: 'team/project', issue: 9 }), '');
});

test('parseProviderReviewUrl distinguishes GitHub PRs and GitLab MRs', () => {
  assert.deepEqual(parseProviderReviewUrl('https://github.com/jununfly/ZAgenticLoop/pull/64'), {
    provider: 'github',
    host: 'github.com',
    projectPath: 'jununfly/ZAgenticLoop',
    number: 64,
    kind: 'pull-request',
    url: 'https://github.com/jununfly/ZAgenticLoop/pull/64',
  });

  assert.deepEqual(parseProviderReviewUrl('https://gitlab.com/group/subgroup/project/-/merge_requests/9'), {
    provider: 'gitlab',
    host: 'gitlab.com',
    projectPath: 'group/subgroup/project',
    number: 9,
    kind: 'merge-request',
    url: 'https://gitlab.com/group/subgroup/project/-/merge_requests/9',
  });
});

test('GitLab provider API helpers normalize URLs without creating a generic Git provider abstraction', () => {
  assert.equal(
    buildGitLabApiUrl({ projectPath: 'group/subgroup/project', path: 'merge_requests' }),
    'https://gitlab.com/api/v4/projects/group%2Fsubgroup%2Fproject/merge_requests',
  );
  assert.equal(
    buildGitLabApiUrl({ apiBaseUrl: 'https://git.example.test/api/v4/', projectPath: 'team/project', path: ['repository', 'branches'] }),
    'https://git.example.test/api/v4/projects/team%2Fproject/repository/branches',
  );
  assert.equal(
    buildGitLabMergeRequestApiUrl({ projectPath: 'group/subgroup/project', iid: 9 }),
    'https://gitlab.com/api/v4/projects/group%2Fsubgroup%2Fproject/merge_requests/9',
  );
  assert.equal(
    buildGitLabBranchApiUrl({ projectPath: 'group/subgroup/project', branch: 'zjal-act-1' }),
    'https://gitlab.com/api/v4/projects/group%2Fsubgroup%2Fproject/repository/branches/zjal-act-1',
  );
  assert.equal(
    buildGitLabIssueApiUrl({ projectPath: 'group/subgroup/project', issue: 42 }),
    'https://gitlab.com/api/v4/projects/group%2Fsubgroup%2Fproject/issues/42',
  );
});

test('GitLab provider auth and failure helpers keep low-cost deterministic shapes', async () => {
  assert.deepEqual(buildGitLabAuthHeaders({ token: 'private-token', jobToken: 'job-token' }), {
    'PRIVATE-TOKEN': 'private-token',
  });
  assert.deepEqual(buildGitLabAuthHeaders({ jobToken: 'job-token' }), {
    'JOB-TOKEN': 'job-token',
  });
  assert.deepEqual(buildGitLabAuthHeaders({}), {});

  assert.equal(
    await gitLabFailureReason('gitlab-branch-delete-failed', {
      status: 409,
      text: async () => 'Branch cannot be deleted',
    }),
    'gitlab-branch-delete-failed:409:Branch cannot be deleted',
  );
});

test('provider audit metadata stores stable carrier fields without full provider responses', () => {
  assert.deepEqual(
    buildProviderAuditMetadata({ url: 'https://github.com/jununfly/ZAgenticLoop/issues/87' }),
    {
      provider: 'github',
      host: 'github.com',
      project_path: 'jununfly/ZAgenticLoop',
      carrier_kind: 'issue',
      carrier_url: 'https://github.com/jununfly/ZAgenticLoop/issues/87',
      issue: 87,
    },
  );

  assert.deepEqual(
    buildProviderAuditMetadata({ url: 'https://gitlab.com/group/subgroup/project/-/merge_requests/9' }),
    {
      provider: 'gitlab',
      host: 'gitlab.com',
      project_path: 'group/subgroup/project',
      carrier_kind: 'review',
      carrier_url: 'https://gitlab.com/group/subgroup/project/-/merge_requests/9',
      review_kind: 'merge-request',
      review_number: 9,
    },
  );

  assert.deepEqual(
    buildProviderAuditMetadata({
      provider: 'gitlab',
      host: 'git.example.test',
      projectPath: 'team/project',
      carrierKind: 'branch',
      branch: 'zjal-act-1',
    }),
    {
      provider: 'gitlab',
      host: 'git.example.test',
      project_path: 'team/project',
      carrier_kind: 'branch',
      branch: 'zjal-act-1',
    },
  );
});
