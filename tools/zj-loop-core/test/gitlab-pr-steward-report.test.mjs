import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchGitLabPrStewardReport } from '../dist/index.js';

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test('GitLab PR Steward report reads MR and head pipeline without writes', async () => {
  const calls = [];
  const result = await fetchGitLabPrStewardReport({
    projectPath: 'group/project', mergeRequestIid: 12, token: 'secret', signalId: 'mr:12:head:abc',
    fetchImpl: async (url, options = {}) => {
      calls.push([url, options]);
      if (url.endsWith('/pipelines/99/jobs')) return response(200, [
        { id: 100, name: 'fixture_failure', status: 'failed', web_url: 'https://git.example/group/project/-/jobs/100' },
      ]);
      return response(200, {
        iid: 12,
        title: 'dogfood fixture',
        state: 'opened',
        source_branch: 'fixture/pr-steward-failure',
        target_branch: 'master',
        sha: 'abc',
        web_url: 'https://git.example/group/project/-/merge_requests/12',
        head_pipeline: {
          id: 99, status: 'manual', sha: 'abc',
          web_url: 'https://git.example/group/project/-/pipelines/99',
        },
      });
    },
  });
  assert.equal(result.status, 'completed');
  assert.equal(result.outcome, 'report-evidence');
  assert.equal(result.report.source_review.mr_iid, 12);
  assert.equal(result.report.observations.checks, 'failure');
  assert.equal(result.report.next_action, 'candidate-fix-request');
  assert.equal(result.report.side_effects_executed, false);
  assert.equal(calls.length, 2);
  assert.equal(calls[0][1].method, undefined);
});

test('GitLab PR Steward report refuses missing token before API access', async () => {
  let calls = 0;
  const result = await fetchGitLabPrStewardReport({
    projectPath: 'group/project', mergeRequestIid: 12, signalId: 'mr:12',
    fetchImpl: async () => { calls += 1; return response(200, {}); },
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'gitlab-token-required');
  assert.equal(calls, 0);
});
