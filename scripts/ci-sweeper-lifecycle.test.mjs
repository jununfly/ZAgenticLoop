import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyCiSweeperLifecycle,
  buildCiSweeperLifecycleStateEvidence,
} from './ci-sweeper-lifecycle.mjs';

const BASE = {
  dedupeKey: 'ci:audit:91003',
  sourceWorkflow: 'audit',
  sourceRunId: '91003',
  requestBranch: 'automated/ci-sweeper-audit-91003',
};

test('classifyCiSweeperLifecycle returns existing_repair_pr first', () => {
  const lifecycle = classifyCiSweeperLifecycle({
    ...BASE,
    repairPrNumber: '123',
    issueFixRequestNumber: '456',
    escalationIssueNumber: '789',
  });

  assert.equal(lifecycle.kind, 'existing_repair_pr');
  assert.equal(lifecycle.ref, 'PR #123');
  assert.equal(lifecycle.dispatch_allowed, false);
  assert.equal(lifecycle.create_issue_fix_request_allowed, false);
  assert.equal(lifecycle.next_action, 'report-existing-lifecycle');
});

test('classifyCiSweeperLifecycle returns existing_issue_fix_request when no PR exists', () => {
  const lifecycle = classifyCiSweeperLifecycle({
    ...BASE,
    issueFixRequestNumber: '456',
    escalationIssueNumber: '789',
  });

  assert.equal(lifecycle.kind, 'existing_issue_fix_request');
  assert.equal(lifecycle.ref, 'issue #456');
});

test('classifyCiSweeperLifecycle returns existing_escalation_issue before creating a new request', () => {
  const lifecycle = classifyCiSweeperLifecycle({
    ...BASE,
    escalationIssueNumber: '789',
  });

  assert.equal(lifecycle.kind, 'existing_escalation_issue');
  assert.equal(lifecycle.ref, 'issue #789');
  assert.equal(lifecycle.loop_prevention.repeated_failed_repair_allowed, false);
});

test('classifyCiSweeperLifecycle returns none when no active lifecycle exists', () => {
  const lifecycle = classifyCiSweeperLifecycle(BASE);

  assert.equal(lifecycle.kind, 'none');
  assert.equal(lifecycle.ref, '');
  assert.equal(lifecycle.dispatch_allowed, true);
  assert.equal(lifecycle.create_issue_fix_request_allowed, true);
  assert.equal(lifecycle.next_action, 'create-issue-fix-request-and-dispatch');
});

test('buildCiSweeperLifecycleStateEvidence renders stable Markdown for existing lifecycle', () => {
  const lifecycle = classifyCiSweeperLifecycle({
    ...BASE,
    escalationIssueNumber: '789',
  });
  const evidence = buildCiSweeperLifecycleStateEvidence(lifecycle);

  assert.match(evidence, /^- CI Sweeper existing lifecycle: `existing_escalation_issue`/);
  assert.match(evidence, /Source run: `91003`/);
  assert.match(evidence, /Action: no dispatch; no new Issue Fix Request\./);
});

test('buildCiSweeperLifecycleStateEvidence renders stable Markdown for no lifecycle', () => {
  const lifecycle = classifyCiSweeperLifecycle(BASE);
  const evidence = buildCiSweeperLifecycleStateEvidence(lifecycle);

  assert.match(evidence, /^- CI Sweeper existing lifecycle: `none`/);
  assert.match(evidence, /Action: create Issue Fix Request and dispatch CI Sweeper\./);
});
