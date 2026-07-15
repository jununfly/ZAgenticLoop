import assert from 'node:assert/strict';
import test from 'node:test';

import { scanGitLabIssueBacklog } from '../dist/issue-backlog-runner.js';

test('GitLab backlog scan emits report-only recommendations with no tracker mutations', async () => {
  const result = await scanGitLabIssueBacklog({
    projectPath: 'group/project',
    apiBaseUrl: 'https://gitlab.example/api/v4',
    token: 'token',
    pipelineUrl: 'https://gitlab.example/group/project/-/pipelines/1',
    fetchImpl: async (url, options) => {
      assert.match(String(url), /projects\/group%2Fproject\/issues\?state=opened/);
      assert.equal(options.headers['PRIVATE-TOKEN'], 'token');
      return {
        ok: true,
        status: 200,
        async json() {
          return [
            { iid: 8, title: 'bounded', web_url: 'https://gitlab.example/group/project/-/issues/8', labels: ['ready-for-agent'], assignees: [], description: '' },
            { iid: 9, title: 'owned', web_url: 'https://gitlab.example/group/project/-/issues/9', labels: [], assignees: [{ username: 'owner' }], description: '' },
          ];
        },
      };
    },
  });

  assert.equal(result.schema, 'zj-loop.issue_recommendations.v1');
  assert.equal(result.issue_count, 2);
  assert.equal(result.recommendations[0].recommendation, 'agent-ready-request');
  assert.equal(result.recommendations[1].recommendation, 'human-owned');
  assert.deepEqual(result.side_effects, { labels: false, comments: false, state: false, requests: false });
});
