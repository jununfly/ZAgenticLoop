import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyGitLabPrStewardScope } from '../dist/index.js';
import { buildIssueFixRequestComment } from '../dist/issue-fix-request-contract.js';
import { buildGitLabLifecycleMarker } from '../dist/gitlab-request-lifecycle.js';

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const request = {
  schema: 'zj-loop.issue_fix_request.v1', request_id: 'ifr_scope_fixture', status: 'requested', created_at: '2026-07-19T00:00:00.000Z',
  source_signal: { signal_id: 'mr:317', source: 'merge_request', provider: 'gitlab', summary: 'fixture', source_url: 'https://git.example/group/project/-/merge_requests/317' },
  subject: { type: 'merge_request', provider: 'gitlab', repo: 'group/project', mr_iid: 317, head_sha: 'abc123', base_branch: 'master', source_url: 'https://git.example/group/project/-/merge_requests/317' },
  route_decision: { route_id: 'pr-steward-fix-request', request_kind: 'issue-fix-request', target_consumer: 'pr-steward', dedupe_key: 'pr:group/project:317:head:abc123:checks:failure' },
  dedupe_key: 'pr:group/project:317:head:abc123:checks:failure', requested_consumer: { consumer_id: 'pr-steward', capability: 'pr-review-and-readiness-fix' },
  fix_scope: { repo: 'group/project', files_or_areas: ['pull-request-checks'], non_goals: ['source MR mutation'] }, acceptance_criteria: ['append escalation evidence'],
  verification_gate: { commands: [{ id: 'check', command: 'read', args: [] }] }, failure_policy: { on_failure: 'failed_requires_new_request', retry: 'new_request_only' }, lifecycle: { linked_pr: null, consumed_by: null, closed_at: null },
};

function makeFetch(calls) {
  return async (url, options = {}) => {
    calls.push([url, options]);
    if (url.endsWith('/issues/190')) return response(200, { iid: 190, description: buildIssueFixRequestComment(request) });
    if (url.endsWith('/merge_requests/317')) return response(200, { iid: 317, sha: 'abc123' });
    return response(200, [{ body: buildGitLabLifecycleMarker('pr-steward-claim', { request_id: 'ifr_scope_fixture', claim_id: 'claim-317-abc123', consumer_id: 'pr-steward' }) }]);
  };
}

test('GitLab PR Steward verifier blocks an out-of-scope request before writes', async () => {
  const calls = [];
  const result = await verifyGitLabPrStewardScope({
    projectPath: 'group/project', issueIid: 190, mergeRequestIid: 317, requestId: 'ifr_scope_fixture', claimId: 'claim-317-abc123', currentHeadSha: 'abc123',
    requestedScope: 'source-mr-write', requestedVerifier: 'request-claim', token: 'secret', fetchImpl: makeFetch(calls),
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'verifier-scope-mismatch');
  assert.equal(result.side_effects_executed, false);
  assert.equal(calls.every(([, options]) => options.method === undefined), true);
});

test('GitLab PR Steward verifier accepts the allowlisted scope and verifier read-only', async () => {
  const result = await verifyGitLabPrStewardScope({
    projectPath: 'group/project', issueIid: 190, mergeRequestIid: 317, requestId: 'ifr_scope_fixture', claimId: 'claim-317-abc123', currentHeadSha: 'abc123',
    requestedScope: 'failed-check-rollup', requestedVerifier: 'request-claim', token: 'secret', fetchImpl: makeFetch([]),
  });
  assert.equal(result.status, 'completed');
  assert.equal(result.outcome, 'verified');
  assert.equal(result.side_effects_executed, false);
});
