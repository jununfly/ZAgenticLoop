import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claimGitLabPrStewardIssueFixRequest } from '../dist/index.js';

const request = {
  schema: 'zj-loop.issue_fix_request.v1', request_id: 'ifr_1', status: 'requested',
  created_at: '2026-01-01T00:00:00Z', source_signal: { provider: 'gitlab', source: 'merge_request' },
  subject: { type: 'merge_request', provider: 'gitlab', repo: 'group/project', mr_iid: 313, head_sha: 'abc123', base_branch: 'master' },
  route_decision: { route_id: 'pr-steward-fix-request', request_kind: 'issue-fix-request', target_consumer: 'pr-steward', dedupe_key: 'pr:group/project:313:head:abc123:checks:failure' },
  dedupe_key: 'pr:group/project:313:head:abc123:checks:failure',
  requested_consumer: { consumer_id: 'pr-steward', capability: 'pr-review-and-readiness-fix' },
  fix_scope: { repo: 'group/project', files_or_areas: ['pull-request-checks'], non_goals: ['source MR mutation'] },
  acceptance_criteria: ['repair or escalation'], verification_gate: { commands: [{ id: 'head', command: 'gitlab-read-mr-head', args: ['313'] }] },
  failure_policy: { retry: 'new_request_only' }, lifecycle: { consumed_by: null },
};

function response(status, body) { return { ok: status >= 200 && status < 300, status, json: async () => body }; }

test('GitLab PR Steward claim verifies current MR head and re-reads the winning claim', async () => {
  const calls = [];
  const body = `<!-- zj-loop:issue-fix-request\n${JSON.stringify(request)}\n-->`;
  const fetchImpl = async (url, options = {}) => {
    calls.push([url, options]);
    if (url.endsWith('/issues/188')) return response(200, { iid: 188, description: body });
    if (url.endsWith('/merge_requests/313')) return response(200, { iid: 313, sha: 'abc123', state: 'opened', target_branch: 'master' });
    if (url.includes('/issues/188/notes?')) {
      const writes = calls.filter(([, item]) => item.method === 'POST');
      return response(200, writes.length ? [{ body: `<!-- zj-loop:pr-steward-claim\n${JSON.stringify({ request_id: 'ifr_1', claim_id: 'claim-1', consumer_id: 'pr-steward' })}\n-->` }] : []);
    }
    if (options.method === 'POST') return response(201, {});
    return response(404, {});
  };
  const result = await claimGitLabPrStewardIssueFixRequest({
    projectPath: 'group/project', issueIid: 188, mergeRequestIid: 313, requestId: 'ifr_1', claimId: 'claim-1', currentHeadSha: 'abc123', token: 'secret', fetchImpl,
  });
  assert.equal(result.status, 'completed');
  assert.equal(result.outcome, 'claimed');
  assert.equal(calls.filter(([, options]) => options.method === 'POST').length, 1);
});

test('GitLab PR Steward claim refuses stale MR head before any note write', async () => {
  let writes = 0;
  const body = `<!-- zj-loop:issue-fix-request\n${JSON.stringify(request)}\n-->`;
  const result = await claimGitLabPrStewardIssueFixRequest({
    projectPath: 'group/project', issueIid: 188, mergeRequestIid: 313, requestId: 'ifr_1', claimId: 'claim-1', currentHeadSha: 'abc123', token: 'secret',
    fetchImpl: async (url, options = {}) => {
      if (options.method === 'POST') writes += 1;
      if (url.endsWith('/issues/188')) return response(200, { iid: 188, description: body });
      if (url.endsWith('/merge_requests/313')) return response(200, { iid: 313, sha: 'new-head', state: 'opened', target_branch: 'master' });
      if (url.includes('/issues/188/notes?')) return response(200, []);
      return response(404, {});
    },
  });
  assert.equal(result.reason, 'source-head-mismatch');
  assert.equal(writes, 0);
});

test('GitLab PR Steward claim refuses a different claim id for an existing claim', async () => {
  let writes = 0;
  const body = `<!-- zj-loop:issue-fix-request\n${JSON.stringify(request)}\n-->`;
  const result = await claimGitLabPrStewardIssueFixRequest({
    projectPath: 'group/project', issueIid: 188, mergeRequestIid: 313, requestId: 'ifr_1', claimId: 'claim-2', currentHeadSha: 'abc123', token: 'secret',
    fetchImpl: async (url, options = {}) => {
      if (options.method === 'POST') writes += 1;
      if (url.endsWith('/issues/188')) return response(200, { iid: 188, description: body });
      if (url.endsWith('/merge_requests/313')) return response(200, { iid: 313, sha: 'abc123', state: 'opened', target_branch: 'master' });
      if (url.includes('/issues/188/notes?')) return response(200, [{ body: `<!-- zj-loop:pr-steward-claim\n${JSON.stringify({ request_id: 'ifr_1', claim_id: 'claim-1', consumer_id: 'pr-steward' })}\n-->` }]);
      return response(404, {});
    },
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'claim-mismatch');
  assert.equal(result.existing_claim_id, 'claim-1');
  assert.equal(result.side_effects_executed, false);
  assert.equal(writes, 0);
});
