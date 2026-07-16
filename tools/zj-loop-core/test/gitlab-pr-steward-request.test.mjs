import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONFIRM_PR_STEWARD_ISSUE_FIX_REQUEST,
  createGitLabPrStewardIssueFixRequest,
} from '../dist/index.js';

const report = {
  schema: 'zj-loop.gitlab_pr_steward_report.v1',
  status: 'completed',
  report: {
    status: 'candidate-fix-request',
    source_review: {
      provider: 'gitlab', mr_iid: 313, repo: 'group/project', head_sha: 'abc123',
      target_branch: 'master', url: 'https://git.example/group/project/-/merge_requests/313',
    },
    observations: {
      checks: 'failure', pipeline_id: 99, pipeline_url: 'https://git.example/group/project/-/pipelines/99',
      failed_jobs: [{ id: 100, name: 'fixture_failure', status: 'failed', url: 'https://git.example/group/project/-/jobs/100' }],
  },
  },
  audit: { signal_id: '313' },
};

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test('GitLab PR Steward request refuses without fixed confirmation before any write', async () => {
  let writes = 0;
  const result = await createGitLabPrStewardIssueFixRequest({
    projectPath: 'group/project', report, token: 'secret', confirmationPhrase: '',
    fetchImpl: async (_url, options = {}) => { if (options.method) writes += 1; return response(200, []); },
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'confirmation-required');
  assert.equal(writes, 0);
});

test('GitLab PR Steward request creates one deduplicated carrier from failed MR report', async () => {
  const calls = [];
  const result = await createGitLabPrStewardIssueFixRequest({
    projectPath: 'group/project', report, token: 'secret', confirmationPhrase: CONFIRM_PR_STEWARD_ISSUE_FIX_REQUEST,
    fetchImpl: async (url, options = {}) => {
      calls.push([url, options]);
      if (url.includes('/issues?')) return response(200, []);
      return response(201, { iid: 42, web_url: 'https://git.example/group/project/-/issues/42' });
    },
  });
  assert.equal(result.status, 'completed');
  assert.equal(result.outcome, 'created');
  assert.equal(result.issue.iid, 42);
  const body = JSON.parse(calls.find(([, options]) => options.method === 'POST')[1].body);
  assert.match(body.description, /CONFIRM_PR_STEWARD_ISSUE_FIX_REQUEST/);
  assert.match(body.description, /"mr_iid": 313/);
  assert.equal(calls.filter(([, options]) => options.method === 'POST').length, 1);
});

test('GitLab PR Steward request refuses report/project mismatch without writes', async () => {
  let calls = 0;
  const result = await createGitLabPrStewardIssueFixRequest({
    projectPath: 'other/project', report, token: 'secret', confirmationPhrase: CONFIRM_PR_STEWARD_ISSUE_FIX_REQUEST,
    fetchImpl: async () => { calls += 1; return response(200, []); },
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'request-source-mismatch');
  assert.equal(calls, 0);
});
