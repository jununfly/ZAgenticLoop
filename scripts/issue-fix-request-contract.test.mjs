import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ISSUE_FIX_REQUEST_SCHEMA,
  buildIssueFixRequestComment,
  buildIssueFixRequestLifecycleComment,
  deriveIssueFixRequestState,
  resolveIssueFixRequestDedupe,
  parseIssueFixRequestComments,
  applyFixConsumerTransition,
  validateIssueFixRequestTransition,
  validateIssueFixRequest,
} from './issue-fix-request-contract.mjs';

function comment(id, body) {
  return {
    id,
    author: `agent-${id}`,
    createdAt: `2026-07-06T00:00:0${id}Z`,
    body,
  };
}

function baseRequest(overrides = {}) {
  return {
    schema: ISSUE_FIX_REQUEST_SCHEMA,
    request_id: 'ifr_ci_validate_91001',
    status: 'requested',
    created_at: '2026-07-06T00:00:00Z',
    source_signal: {
      signal_id: 'ci:validate-patterns:91001',
      source: 'ci',
      summary: 'validate-patterns workflow run 91001 failed',
      source_url: 'https://github.com/jununfly/ZAgenticLoop/actions/runs/91001',
    },
    route_decision: {
      decision_id: 'rd_ci_validate_91001',
      route_id: 'ci-sweeper',
      request_kind: 'issue-fix-request',
      target_consumer: 'ci-sweeper',
      allowed: true,
      reason: 'ci failure matches ci-sweeper route',
      dedupe_key: 'jununfly/ZAgenticLoop:ci-sweeper:ci:validate-patterns:91001',
      source_run_id: '91001',
    },
    dedupe_key: 'jununfly/ZAgenticLoop:ci-sweeper:ci:validate-patterns:91001',
    requested_consumer: {
      consumer_id: 'ci-sweeper',
      capability: 'deterministic-ci-repair',
    },
    fix_scope: {
      repo: 'jununfly/ZAgenticLoop',
      files_or_areas: ['scripts/', '.github/workflows/'],
      non_goals: ['auto-merge'],
    },
    acceptance_criteria: ['Open a verifier-backed fix PR or produce escalation evidence.'],
    verification_gate: {
      commands: ['node --test scripts/issue-fix-request-contract.test.mjs'],
    },
    failure_policy: {
      on_failure: 'failed_requires_new_request',
      retry: 'new_request_only',
    },
    lifecycle: {
      linked_pr: null,
      consumed_by: null,
      closed_at: null,
    },
    ...overrides,
  };
}

test('Issue Fix Request comments round-trip through the fixed machine contract', () => {
  const body = buildIssueFixRequestComment(baseRequest());
  const parsed = parseIssueFixRequestComments([comment(1, body)]);

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].request.schema, ISSUE_FIX_REQUEST_SCHEMA);
  assert.equal(parsed[0].request.status, 'requested');
  assert.equal(parsed[0].request.route_decision.request_kind, 'issue-fix-request');
  assert.deepEqual(validateIssueFixRequest(parsed[0].request), { ok: true, errors: [] });
});

test('Issue Fix Request dedupe treats requested consumed and pr_opened as active only', () => {
  const active = [
    baseRequest({ request_id: 'ifr_requested', status: 'requested' }),
    baseRequest({ request_id: 'ifr_failed', status: 'failed' }),
    baseRequest({ request_id: 'ifr_completed', status: 'completed' }),
  ];

  assert.deepEqual(resolveIssueFixRequestDedupe({
    existingRequests: active,
    dedupeKey: baseRequest().dedupe_key,
  }), {
    action: 'duplicate',
    existing_request_id: 'ifr_requested',
    existing_status: 'requested',
    existing_request_url: '',
  });

  assert.deepEqual(resolveIssueFixRequestDedupe({
    existingRequests: [baseRequest({
      request_id: 'ifr_with_url',
      status: 'requested',
      issue_url: 'https://github.com/jununfly/ZAgenticLoop/issues/200',
    })],
    dedupeKey: baseRequest().dedupe_key,
  }), {
    action: 'duplicate',
    existing_request_id: 'ifr_with_url',
    existing_status: 'requested',
    existing_request_url: 'https://github.com/jununfly/ZAgenticLoop/issues/200',
  });

  assert.deepEqual(resolveIssueFixRequestDedupe({
    existingRequests: active.slice(1),
    dedupeKey: baseRequest().dedupe_key,
  }), {
    action: 'create-request',
  });
});

test('Issue Fix Request lifecycle transitions are fixed and fail closed', () => {
  assert.deepEqual(validateIssueFixRequestTransition('requested', 'consumed'), { ok: true, errors: [] });
  assert.deepEqual(validateIssueFixRequestTransition('consumed', 'pr_opened'), { ok: true, errors: [] });
  assert.deepEqual(validateIssueFixRequestTransition('pr_opened', 'completed'), { ok: true, errors: [] });
  assert.deepEqual(validateIssueFixRequestTransition('consumed', 'failed'), { ok: true, errors: [] });
  assert.deepEqual(validateIssueFixRequestTransition('failed', 'requested'), {
    ok: false,
    errors: ['invalid transition failed -> requested'],
  });
});

test('Issue Fix Request state derives lifecycle status from append-only comments', () => {
  const requested = comment(1, buildIssueFixRequestComment(baseRequest()));
  const consumed = comment(2, buildIssueFixRequestComment(baseRequest({
    status: 'consumed',
    lifecycle: {
      linked_pr: null,
      consumed_by: 'ci-sweeper',
      closed_at: null,
    },
  })));

  const state = deriveIssueFixRequestState([requested, consumed]);

  assert.equal(state.requests.length, 1);
  assert.equal(state.requests[0].currentState, 'consumed');
  assert.equal(state.requests[0].requestId, 'ifr_ci_validate_91001');
  assert.deepEqual(state.activeRequests.map((request) => request.requestId), ['ifr_ci_validate_91001']);
});

test('Fix Consumer protocol only claims matching allowlisted requests and emits lifecycle comments', () => {
  const claimed = applyFixConsumerTransition({
    request: baseRequest(),
    consumerId: 'ci-sweeper',
    transition: 'claim',
    at: '2026-07-06T00:01:00Z',
  });

  assert.equal(claimed.status, 'consumed');
  assert.equal(claimed.lifecycle.consumed_by, 'ci-sweeper');

  const opened = applyFixConsumerTransition({
    request: claimed,
    consumerId: 'ci-sweeper',
    transition: 'open_pr',
    linkedPr: 'https://github.com/jununfly/ZAgenticLoop/pull/42',
    at: '2026-07-06T00:02:00Z',
  });

  assert.equal(opened.status, 'pr_opened');
  assert.equal(opened.lifecycle.linked_pr, 'https://github.com/jununfly/ZAgenticLoop/pull/42');

  const commentBody = buildIssueFixRequestLifecycleComment(opened);
  const parsed = parseIssueFixRequestComments([comment(3, commentBody)]);
  assert.equal(parsed[0].request.status, 'pr_opened');

  assert.throws(
    () => applyFixConsumerTransition({
      request: baseRequest(),
      consumerId: 'dependency-sweeper',
      transition: 'claim',
    }),
    /consumer dependency-sweeper cannot claim request for ci-sweeper/,
  );
});
