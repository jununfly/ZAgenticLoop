import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGitLabDependencySweeperRepairMr,
  validateGitLabDependencySweeperCommitActions,
} from '../dist/index.js';

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function request() {
  return {
    request_id: 'ifr_dependency_gitlab_1',
    dedupe_key: 'group/project:dependency-sweeper:yaml:2.8.1',
    status: 'consumed',
    source_signal: { provider: 'gitlab' },
    subject: { repo: 'group/project' },
    route_decision: { target_consumer: 'dependency-sweeper' },
  };
}

function actions() {
  return [
    { action: 'update', file_path: 'package.json', content: '{"dependencies":{"yaml":"2.8.1"}}\n' },
    { action: 'update', file_path: 'package-lock.json', content: '{"lockfileVersion":3}\n' },
  ];
}

test('GitLab Dependency Sweeper adapter creates branch, API commit, and MR only', async () => {
  const calls = [];
  const result = await createGitLabDependencySweeperRepairMr({
    projectPath: 'group/project',
    token: 'secret',
    request: request(),
    requestId: 'ifr_dependency_gitlab_1',
    branch: 'automated/dependency-sweeper-gitlab-yaml-2-8-1-ab12cd34',
    targetBranch: 'main',
    commitMessage: 'Update yaml to 2.8.1',
    title: 'Update yaml to 2.8.1',
    description: 'Source Issue Fix Request: ifr_dependency_gitlab_1',
    actions: actions(),
    fetchImpl: async (url, options = {}) => {
      calls.push([url, options]);
      if (url.includes('/merge_requests?')) return response(200, []);
      if (url.includes('/repository/branches/')) return response(200, { name: 'branch' });
      if (url.endsWith('/repository/branches')) return response(201, { name: 'branch' });
      if (url.endsWith('/repository/commits')) return response(201, { id: 'commit-1' });
      if (url.endsWith('/merge_requests')) return response(201, {
        iid: 12,
        web_url: 'https://git.example/group/project/-/merge_requests/12',
        source_branch: 'automated/dependency-sweeper-gitlab-yaml-2-8-1-ab12cd34',
        target_branch: 'main',
      });
      return response(404, {});
    },
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.outcome, 'created');
  assert.equal(result.merge_request.iid, 12);
  assert.deepEqual(calls.map(([url, options]) => `${options.method ?? 'GET'} ${url.split('/api/v4')[1]}`), [
    'GET /projects/group%2Fproject/merge_requests?state=opened&source_branch=automated%2Fdependency-sweeper-gitlab-yaml-2-8-1-ab12cd34&per_page=100',
    'POST /projects/group%2Fproject/repository/branches',
    'GET /projects/group%2Fproject/repository/branches/automated%2Fdependency-sweeper-gitlab-yaml-2-8-1-ab12cd34',
    'POST /projects/group%2Fproject/repository/commits',
    'POST /projects/group%2Fproject/merge_requests',
  ]);
  assert.equal(calls.some(([, options]) => JSON.stringify(options.body ?? '').includes('gh')), false);
  assert.deepEqual(JSON.parse(calls[3][1].body).actions, actions());
});

test('GitLab Dependency Sweeper adapter fails closed before API writes on source or action mismatch', async () => {
  let writes = 0;
  const fetchImpl = async (_url, options = {}) => {
    if (options.method && options.method !== 'GET') writes += 1;
    return response(200, []);
  };
  const mismatch = await createGitLabDependencySweeperRepairMr({
    projectPath: 'group/project', token: 'secret', request: { ...request(), subject: { repo: 'other/project' } },
    requestId: 'ifr_dependency_gitlab_1', branch: 'automated/dependency-sweeper-gitlab-yaml-2-8-1-ab12cd34',
    targetBranch: 'main', commitMessage: 'x', title: 'x', description: 'x', actions: actions(), fetchImpl,
  });
  assert.equal(mismatch.reason, 'request-source-mismatch');
  assert.equal(writes, 0);

  assert.equal(validateGitLabDependencySweeperCommitActions([{ action: 'update', file_path: 'README.md', content: 'x' }]).ok, false);
});
