import assert from 'node:assert/strict';
import test from 'node:test';

import {
  runIssueTriageTransitionE2EReplaySuite,
} from './issue-triage-transition-e2e-replay.mjs';

const ROUTE_TABLE_PATH = 'zj-loop/zj-loop-route-table.yaml';

test('confirmed issue triage transition reaches source issue request carrier for ready-for-agent', async () => {
  const suite = await runIssueTriageTransitionE2EReplaySuite({ routeTablePath: ROUTE_TABLE_PATH });
  const result = suite.results.find((item) => item.name === 'ready-for-agent-confirmed-plans-issue-fix-request');

  assert.equal(suite.passed, true);
  assert.equal(result.backlogReplay.routeDecision.route_id, 'issue-backlog-triage');
  assert.equal(result.backlogReplay.recommendedTriageTransition.recommended_state, 'ready-for-agent');
  assert.equal(result.transitionReplay.route_id, 'issue-triage-transition');
  assert.equal(result.transitionReplay.decision.status, 'confirmed');
  assert.equal(result.transitionReplay.evidence.execution_mode, 'request-only');
  assert.equal(result.transitionReplay.evidence.completion_form, 'issue-fix-request-created');
  assert.equal(result.transitionReplay.evidence.side_effects.executed, false);
  assert.equal(result.transitionReplay.confirmed_transition.issue_fix_request.status, 'requested');
  assert.equal(result.transitionReplay.confirmed_transition.issue_fix_request.carrier.kind, 'source-issue-comment');
  assert.equal(result.transitionReplay.confirmed_transition.issue_fix_request.requested_consumer.consumer_id, 'roadmap-sliced-development');
});

test('confirmed issue triage transition keeps needs-info as triage-only evidence', async () => {
  const suite = await runIssueTriageTransitionE2EReplaySuite({ routeTablePath: ROUTE_TABLE_PATH });
  const result = suite.results.find((item) => item.name === 'needs-info-confirmed-stays-triage-only');

  assert.equal(result.transitionReplay.decision.status, 'confirmed');
  assert.equal(result.transitionReplay.evidence.completion_form, 'triage-transition-confirmed');
  assert.equal(result.transitionReplay.confirmed_transition.issue_fix_request, null);
});

test('confirmed issue triage transition escalates wontfix candidates instead of mutating tracker', async () => {
  const suite = await runIssueTriageTransitionE2EReplaySuite({ routeTablePath: ROUTE_TABLE_PATH });
  const result = suite.results.find((item) => item.name === 'wontfix-candidate-escalates');

  assert.equal(result.transitionReplay.decision.status, 'escalated');
  assert.equal(result.transitionReplay.evidence.completion_form, 'escalation-issue');
  assert.deepEqual(result.transitionReplay.confirmed_transition.tracker_operations, []);
});
