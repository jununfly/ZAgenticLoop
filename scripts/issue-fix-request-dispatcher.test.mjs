import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ISSUE_FIX_REQUEST_SCHEMA,
  ROUTE_DECISION_SCHEMA,
} from './issue-fix-request-contract.mjs';
import {
  dispatchSignalToIssueFixRequest,
} from './issue-fix-request-dispatcher.mjs';

const ROUTE_TABLE = `
routes:
  - route_id: "ci-sweeper"
    enabled: true
    request_kind: "issue-fix-request"
    consumer: "ci-sweeper"
    match:
      source: ["ci"]
    guards:
      branch_allowlist: ["main"]
      fix_consumer_allowlist: ["ci-sweeper", "pr-steward", "dependency-sweeper"]
`;

const SIGNAL = {
  signal_id: 'ci:validate-patterns:91001',
  source: 'ci',
  summary: 'validate-patterns workflow run 91001 failed',
  source_url: 'https://github.com/jununfly/ZAgenticLoop/actions/runs/91001',
  repo: 'jununfly/ZAgenticLoop',
  head_branch: 'main',
  source_run_id: '91001',
  fix_scope: {
    files_or_areas: ['scripts/', '.github/workflows/'],
    non_goals: ['auto-merge'],
  },
};

test('Route Dispatcher creates a replayable decision and Issue Fix Request for allowlisted consumers', () => {
  const result = dispatchSignalToIssueFixRequest({
    routeTableText: ROUTE_TABLE,
    routeId: 'ci-sweeper',
    signal: SIGNAL,
    createdAt: '2026-07-06T00:00:00Z',
  });

  assert.equal(result.action, 'create-request');
  assert.equal(result.routeDecision.schema, ROUTE_DECISION_SCHEMA);
  assert.equal(result.routeDecision.request_kind, 'issue-fix-request');
  assert.equal(result.routeDecision.target_consumer, 'ci-sweeper');
  assert.equal(result.routeDecision.allowed, true);
  assert.equal(result.issueFixRequest.schema, ISSUE_FIX_REQUEST_SCHEMA);
  assert.equal(result.issueFixRequest.requested_consumer.consumer_id, 'ci-sweeper');
  assert.equal(result.issueFixRequest.route_decision.decision_id, result.routeDecision.decision_id);
  assert.equal(result.issueFixRequest.dedupe_key, result.routeDecision.dedupe_key);
});

test('Route Dispatcher returns duplicate without creating a second Issue Fix Request', () => {
  const result = dispatchSignalToIssueFixRequest({
    routeTableText: ROUTE_TABLE,
    routeId: 'ci-sweeper',
    signal: SIGNAL,
    existingRequests: [{
      request_id: 'ifr_existing',
      status: 'requested',
      dedupe_key: 'jununfly/ZAgenticLoop:ci-sweeper:ci:validate-patterns:91001:scripts-github-workflows',
    }],
  });

  assert.equal(result.action, 'duplicate');
  assert.equal(result.issueFixRequest.status, 'duplicate');
  assert.equal(result.issueFixRequest.lifecycle.existing_request_id, 'ifr_existing');
});

test('Route Dispatcher denies non issue-fix request kinds for the Fix Consumer protocol', () => {
  const result = dispatchSignalToIssueFixRequest({
    routeTableText: ROUTE_TABLE.replace('issue-fix-request', 'activation-comment'),
    routeId: 'ci-sweeper',
    signal: SIGNAL,
  });

  assert.equal(result.action, 'denied');
  assert.equal(result.routeDecision.allowed, false);
  assert.equal(result.routeDecision.reason, 'route-kind-not-issue-fix-request');
});
