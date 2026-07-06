import test from 'node:test';
import assert from 'node:assert/strict';

import { parseIssueFixRequestComments } from './issue-fix-request-contract.mjs';
import { buildCiIssueFixRequestBody } from './build-ci-issue-fix-request-body.mjs';

test('CI Issue Fix Request body carries a parseable request comment', () => {
  const body = buildCiIssueFixRequestBody({
    schema: 'zj-loop.route_decision.v1',
    decision_id: 'rd_test',
    signal_id: 'ci:validate-patterns:91001',
    route: 'ci-sweeper',
    route_id: 'ci-sweeper',
    request_kind: 'issue-fix-request',
    target_consumer: 'ci-sweeper',
    source: 'ci',
    subject: 'validate-patterns workflow run 91001',
    source_url: 'https://github.com/jununfly/ZAgenticLoop/actions/runs/91001',
    source_run_id: '91001',
    dedupe_key: 'ci:validate-patterns:91001',
    created_at: '2026-07-06T00:00:00Z',
  });
  const parsed = parseIssueFixRequestComments([{ id: 1, body }]);

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].request.route_decision.decision_id, 'rd_test');
  assert.equal(parsed[0].request.requested_consumer.consumer_id, 'ci-sweeper');
});
