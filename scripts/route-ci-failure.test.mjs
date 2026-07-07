import test from 'node:test';
import assert from 'node:assert/strict';

import { ROUTE_DECISION_SCHEMA } from './issue-fix-request-contract.mjs';

import {
  buildCiSweeperRouteDecision,
  buildCiSweeperBranchName,
  findRoute,
  isCiSweeperDispatchEnabled,
  parseRouteTable,
} from './route-ci-failure.mjs';

const ROUTE_TABLE = `
routes:
  - route_id: "human"
    enabled: true
    request_kind: "report-only"

  - route_id: "ci-sweeper"
    consumer: "ci-sweeper"
    request_kind: issue-fix-request
    enabled: true
    match:
      workflows:
        - validate-patterns
        - audit
    guards:
      branch_allowlist:
        - main
`;

test('parseRouteTable returns structured routes independent of YAML field order', () => {
  const table = parseRouteTable(ROUTE_TABLE);
  assert.equal(table.routes.length, 2);
  assert.deepEqual(findRoute(ROUTE_TABLE, 'ci-sweeper').match.workflows, ['validate-patterns', 'audit']);
});

test('isCiSweeperDispatchEnabled requires enabled issue-fix-request route', () => {
  assert.equal(isCiSweeperDispatchEnabled(ROUTE_TABLE), true);
  assert.equal(isCiSweeperDispatchEnabled(ROUTE_TABLE.replace(
    '    request_kind: issue-fix-request\n    enabled: true',
    '    request_kind: issue-fix-request\n    enabled: false',
  )), false);
  assert.equal(isCiSweeperDispatchEnabled(ROUTE_TABLE.replace('issue-fix-request', 'report-only')), false);
});

test('buildCiSweeperRouteDecision dispatches the first matching failing workflow with route contract fields', () => {
  const decision = buildCiSweeperRouteDecision({
    routeTableText: ROUTE_TABLE,
    sourceRunId: 99,
    repository: 'jununfly/ZAgenticLoop',
    failures: [{
      workflow: 'validate-patterns',
      databaseId: 123,
      headBranch: 'main',
      headSha: 'abc',
    }],
  });

  assert.equal(decision.dispatch, true);
  assert.equal(decision.schema, ROUTE_DECISION_SCHEMA);
  assert.match(decision.decision_id, /^rd_[a-f0-9]{12}$/);
  assert.equal(decision.status, 'requested');
  assert.equal(decision.route, 'ci-sweeper');
  assert.equal(decision.request_kind, 'issue-fix-request');
  assert.equal(decision.signal_id, 'ci:validate-patterns:123');
  assert.equal(decision.subject, 'validate-patterns workflow run 123');
  assert.equal(decision.priority, 'P1');
  assert.equal(decision.state, 'none');
  assert.equal(decision.risk, 'medium');
  assert.equal(decision.confidence, 'high');
  assert.equal(decision.producer, 'daily-triage');
  assert.equal(decision.requested_action, 'create-issue-fix-request');
  assert.equal(decision.target_consumer, 'ci-sweeper');
  assert.equal(decision.source_url, 'https://github.com/jununfly/ZAgenticLoop/actions/runs/123');
  assert.deepEqual(decision.evidence, ['https://github.com/jununfly/ZAgenticLoop/actions/runs/123']);
  assert.equal(decision.dedupe_key, 'ci:validate-patterns:123');
  assert.equal(decision.request_branch, 'automated/ci-sweeper-validate-patterns-123');
  assert.match(decision.created_at, /^\d{4}-\d{2}-\d{2}T/);
});

test('buildCiSweeperBranchName sanitizes workflow names for generated branches', () => {
  assert.equal(
    buildCiSweeperBranchName('Validate Patterns / Registry', '123'),
    'automated/ci-sweeper-Validate-Patterns-Registry-123',
  );
});

test('buildCiSweeperRouteDecision denies dispatch when route disabled', () => {
  const decision = buildCiSweeperRouteDecision({
    routeTableText: ROUTE_TABLE.replace('issue-fix-request', 'report-only'),
    failures: [{ workflow: 'audit', databaseId: 456 }],
  });

  assert.equal(decision.dispatch, false);
  assert.equal(decision.status, 'denied');
  assert.equal(decision.reason, 'ci-sweeper-route-disabled');
});

test('buildCiSweeperRouteDecision ignores failures outside the route workflow allowlist', () => {
  const decision = buildCiSweeperRouteDecision({
    routeTableText: ROUTE_TABLE,
    failures: [{ workflow: 'release-zj-loop-core', databaseId: 789 }],
  });

  assert.equal(decision.dispatch, false);
  assert.equal(decision.status, 'ignored');
  assert.equal(decision.reason, 'no-route-matched-failing-workflow');
});

test('buildCiSweeperRouteDecision denies dispatch outside the route branch allowlist', () => {
  const decision = buildCiSweeperRouteDecision({
    routeTableText: ROUTE_TABLE,
    failures: [{ workflow: 'audit', databaseId: 456, headBranch: 'feature/demo' }],
  });

  assert.equal(decision.dispatch, false);
  assert.equal(decision.status, 'denied');
  assert.equal(decision.reason, 'branch-not-allowlisted');
});

test('buildCiSweeperRouteDecision denies generated CI Sweeper branches to prevent dispatch loops', () => {
  const decision = buildCiSweeperRouteDecision({
    routeTableText: ROUTE_TABLE,
    failures: [{ workflow: 'audit', databaseId: 456, headBranch: 'automated/ci-sweeper-audit-456' }],
  });

  assert.equal(decision.dispatch, false);
  assert.equal(decision.status, 'denied');
  assert.equal(decision.reason, 'generated-ci-sweeper-branch');
  assert.equal(decision.next_action, 'report-existing-generated-branch-run');
  assert.deepEqual(decision.loop_prevention, {
    source: 'ci-sweeper-generated-branch',
    dispatch_allowed: false,
  });
});

test('buildCiSweeperRouteDecision returns duplicate when an active request already uses the dedupe key', () => {
  const decision = buildCiSweeperRouteDecision({
    routeTableText: ROUTE_TABLE,
    failures: [{ workflow: 'audit', databaseId: 456, headBranch: 'main' }],
    existingRequests: [{ dedupe_key: 'ci:audit:456', status: 'requested', request_id: 'ifr-12' }],
  });

  assert.equal(decision.dispatch, false);
  assert.equal(decision.status, 'duplicate');
  assert.equal(decision.existing_request_id, 'ifr-12');
});

test('buildCiSweeperRouteDecision denies stale source runs before creating requests', () => {
  const decision = buildCiSweeperRouteDecision({
    routeTableText: ROUTE_TABLE,
    sourceRunId: 1000,
    failures: [{
      workflow: 'audit',
      databaseId: 999,
      headBranch: 'main',
      isLatestFailure: false,
    }],
  });

  assert.equal(decision.dispatch, false);
  assert.equal(decision.status, 'denied');
  assert.equal(decision.reason, 'stale-source-run');
  assert.equal(decision.next_action, 'report-stale-source-run');
  assert.equal(decision.source_run_id, '999');
  assert.equal(decision.latest_failure_required, true);
});
