import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectProviderKind,
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
