import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendGitLabPrStewardEscalation } from '../dist/index.js';
import { buildIssueFixRequestComment } from '../dist/issue-fix-request-contract.js';

function request() {
  return {
    schema: 'zj-loop.issue_fix_request.v1', request_id: 'ifr-pr-steward-escalation-1', status: 'requested', created_at: '2026-07-16T00:00:00Z',
    source_signal: { source: 'merge_request', provider: 'gitlab', source_url: 'https://git.example/group/project/-/merge_requests/313' },
    subject: { type: 'merge_request', provider: 'gitlab', repo: 'group/project', mr_iid: 313, head_sha: 'abc123', base_branch: 'main' },
    route_decision: { route_id: 'pr-steward-fix-request', request_kind: 'issue-fix-request', target_consumer: 'pr-steward', dedupe_key: 'pr:group/project:313:head:abc123:checks:failure' },
    requested_consumer: { consumer_id: 'pr-steward', capability: 'pr-review-and-readiness-fix' },
    dedupe_key: 'pr:group/project:313:head:abc123:checks:failure',
    fix_scope: { repo: 'group/project', files_or_areas: ['pull-request-checks'], non_goals: ['source MR mutation', 'auto-merge'] },
    acceptance_criteria: ['Open a verifier-backed repair MR or append escalation evidence.'],
    verification_gate: { commands: ['gitlab-read-mr-head'] },
    failure_policy: { retry: 'new_request_only' },
    lifecycle: { consumed_by: null },
  };
}

test('GitLab PR Steward escalation is fail-closed without token', async () => {
  const result = await appendGitLabPrStewardEscalation({ projectPath: 'group/project', issueIid: 189, mergeRequestIid: 313, requestId: 'ifr-1', claimId: 'claim-1', currentHeadSha: 'abc123', reason: 'no deterministic repair plan' });
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'gitlab-token-required');
});

test('GitLab PR Steward appends one reread-verified escalation marker', async () => {
  const req = request();
  const claim = '<!-- zj-loop:pr-steward-claim\n{"schema":"zj-loop.gitlab_pr_steward_claim.v1","request_id":"ifr-pr-steward-escalation-1","claim_id":"claim-313","consumer_id":"pr-steward","status":"claimed"}\n-->';
  let noteReads = 0;
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init });
    if (url.endsWith('/issues/189')) return new Response(JSON.stringify({ iid: 189, description: buildIssueFixRequestComment(req) }), { status: 200 });
    if (url.endsWith('/merge_requests/313')) return new Response(JSON.stringify({ iid: 313, sha: 'abc123' }), { status: 200 });
    if (url.includes('/issues/189/notes')) {
      if (init.method === 'POST') return new Response('{}', { status: 201 });
      noteReads += 1;
      const body = noteReads === 1 ? [{ body: claim }] : [{ body: claim }, { body: '<!-- zj-loop:pr-steward-escalation\n{"request_id":"ifr-pr-steward-escalation-1","claim_id":"claim-313","status":"escalated"}\n-->' }];
      return new Response(JSON.stringify(body), { status: 200 });
    }
    throw new Error(`unexpected ${url}`);
  };
  const result = await appendGitLabPrStewardEscalation({ projectPath: 'group/project', issueIid: 189, mergeRequestIid: 313, requestId: req.request_id, claimId: 'claim-313', currentHeadSha: 'abc123', reason: 'no deterministic repair plan', token: 'secret', apiBaseUrl: 'https://git.example/api/v4', fetchImpl });
  assert.equal(result.status, 'completed');
  assert.equal(result.outcome, 'escalated');
  assert.equal(result.escalation.claim_id, 'claim-313');
  assert.equal(calls.filter((call) => call.init.method === 'POST').length, 1);
});
