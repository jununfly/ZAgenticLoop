import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEPENDENCY_SWEEPER_CLOSEOUT_CONFIRMATION_PHRASE,
  executeGitLabDependencySweeperCloseout,
} from '../dist/index.js';

const request = {
  schema: 'zj-loop.issue_fix_request.v1',
  request_id: 'ifr_1',
  status: 'consumed',
  created_at: '2026-01-01T00:00:00Z',
  source_signal: { provider: 'gitlab' },
  subject: { repo: 'group/project', manifest_files: ['package.json', 'package-lock.json'] },
  route_decision: { target_consumer: 'dependency-sweeper', request_kind: 'issue-fix-request', dedupe_key: 'group/project:dependency:yaml' },
  dedupe_key: 'group/project:dependency:yaml',
  requested_consumer: { consumer_id: 'dependency-sweeper', capability: 'patch-dependency-fix' },
  fix_scope: { files_or_areas: ['package.json', 'package-lock.json'], non_goals: ['auto-merge'] },
  acceptance_criteria: ['Open a repair MR.'],
  verification_gate: { commands: ['npm ci'] },
  failure_policy: { retry: 'new_request_only' },
  lifecycle: { linked_pr: null, consumed_by: 'dependency-sweeper', closed_at: null },
};

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
}

test('Dependency closeout refuses without fixed phrase before any write', async () => {
  let writes = 0;
  const result = await executeGitLabDependencySweeperCloseout({
    projectPath: 'group/project', mergeRequestIid: 1, issueIid: 2, requestId: 'ifr_1', claimId: 'claim_1',
    branch: 'automated/dependency-sweeper-gitlab-yaml-2-8-1-a1', targetBranch: 'main', token: 'secret',
    confirmationPhrase: '', fetchImpl: async (_url, options = {}) => { if (options.method) writes += 1; return response(200, {}); },
  });
  assert.equal(result.reason, 'confirmation-required');
  assert.equal(writes, 0);
});

test('Dependency closeout deletes only matching branch and closes matching carrier', async () => {
  const calls = [];
  const claim = { request_id: 'ifr_1', claim_id: 'claim_1', consumer_id: 'dependency-sweeper' };
  const issueBody = `<!-- zj-loop:issue-fix-request\n${JSON.stringify(request)}\n-->`;
  const fetchImpl = async (url, options = {}) => {
    calls.push([url, options]);
    if (url.endsWith('/merge_requests/1')) return response(200, { merged: true, source_branch: 'automated/dependency-sweeper-gitlab-yaml-2-8-1-a1', target_branch: 'main', description: 'ifr_1', merge_commit_sha: 'sha' });
    if (url.endsWith('/issues/2')) return response(200, { iid: 2, description: issueBody });
    if (url.endsWith('/merge_requests/1/changes')) return response(200, { changes: [{ new_path: 'package-lock.json' }, { new_path: 'package.json' }] });
    if (url.includes('/issues/2/notes?')) return response(200, [{ body: `<!-- zj-loop:dependency-sweeper-claim\n${JSON.stringify(claim)}\n-->` }]);
    if (url.endsWith('/repository/branches/automated%2Fdependency-sweeper-gitlab-yaml-2-8-1-a1')) return response(200, { name: 'branch' });
    if (options.method === 'DELETE') return response(204, {});
    if (options.method === 'POST') return response(201, {});
    if (options.method === 'PUT') return response(200, {});
    return response(404, {});
  };
  const result = await executeGitLabDependencySweeperCloseout({
    projectPath: 'group/project', mergeRequestIid: 1, issueIid: 2, requestId: 'ifr_1', claimId: 'claim_1',
    branch: 'automated/dependency-sweeper-gitlab-yaml-2-8-1-a1', targetBranch: 'main', token: 'secret',
    confirmationPhrase: DEPENDENCY_SWEEPER_CLOSEOUT_CONFIRMATION_PHRASE, fetchImpl,
  });
  assert.equal(result.status, 'completed');
  assert.deepEqual(result.steps.map((step) => step.name), ['delete-repair-branch', 'append-closeout-evidence', 'close-carrier-issue']);
  assert.equal(calls.filter(([, options]) => options.method === 'DELETE').length, 1);
});
