import assert from 'node:assert/strict';
import test from 'node:test';

import {
  runPrStewardClaimReplaySuite,
  validatePrStewardClaimRequest,
} from './pr-steward-claim-e2e-replay.mjs';

test('PR Steward claim consumes a requested failing PR Issue Fix Request only', async () => {
  const suite = await runPrStewardClaimReplaySuite();
  const replay = suite.results.find((result) => result.name === 'failing-pr-request-consumed').replay;

  assert.equal(suite.passed, true);
  assert.equal(replay.outcome, 'consumed');
  assert.equal(replay.claimedRequest.status, 'consumed');
  assert.equal(replay.claimedRequest.lifecycle.consumed_by, 'pr-steward');
  assert.equal(replay.claimEvidence.schema, 'zj-loop.pr_steward_claim.v1');
  assert.equal(replay.claimEvidence.capability, 'pr-review-and-readiness-fix');
  assert.match(replay.claimEvidence.lifecycle_comment, /Issue Fix Request lifecycle updated to consumed/);
  assert.deepEqual(replay.claimEvidence.side_effects, {
    source_pr_comment_created: false,
    source_pr_label_changed: false,
    source_pr_rebased: false,
    source_pr_merged: false,
    workflow_dispatched: false,
    repair_started: false,
    branch_created: false,
    fix_pr_created: false,
    auto_merge_enabled: false,
  });
});

test('PR Steward claim denies mismatched consumer, missing verifier, repeated claim, stale head, and non-main base', async () => {
  const suite = await runPrStewardClaimReplaySuite();
  const outcomes = Object.fromEntries(suite.results.map((result) => [result.name, result.replay]));

  for (const name of [
    'consumer-mismatch-denied',
    'missing-verifier-denied',
    'non-requested-denied',
    'stale-head-denied',
    'non-main-base-denied-at-claim',
  ]) {
    assert.equal(outcomes[name].outcome, 'claim-denied');
    assert.equal(outcomes[name].claimedRequest, null);
    assert.equal(outcomes[name].claimEvidence, null);
    assert.equal(outcomes[name].steps.at(-1).name, 'pr-steward-claim');
  }
  assert.match(outcomes['stale-head-denied'].claimValidation.errors.join('\n'), /current_pr_head_sha/);
});

test('duplicate existing PR Steward request is not claimed', async () => {
  const suite = await runPrStewardClaimReplaySuite();
  const replay = suite.results.find((result) => result.name === 'duplicate-existing-request-not-claimed').replay;

  assert.equal(replay.outcome, 'route-duplicate');
  assert.equal(replay.claimedRequest, null);
  assert.equal(replay.claimEvidence, null);
  assert.equal(replay.steps.at(-1).status, 'duplicate');
});

test('PR Steward claim requires explicit current head sha', async () => {
  const validation = validatePrStewardClaimRequest({
    request: {
      schema: 'zj-loop.issue_fix_request.v1',
      status: 'requested',
      created_at: '2026-07-07T00:00:00Z',
      source_signal: { signal_id: 's', source: 'pull_request', summary: 's', source_url: 'u' },
      subject: { type: 'pull_request', repo: 'r', pr_number: 1, head_sha: 'abc', base_branch: 'main' },
      route_decision: {
        request_kind: 'issue-fix-request',
        route_id: 'pr-steward-fix-request',
        target_consumer: 'pr-steward',
        dedupe_key: 'd',
      },
      dedupe_key: 'd',
      requested_consumer: { consumer_id: 'pr-steward', capability: 'pr-review-and-readiness-fix' },
      fix_scope: { repo: 'r', files_or_areas: ['checks'], non_goals: ['auto-merge'] },
      acceptance_criteria: ['claim only'],
      verification_gate: { commands: ['npm test'] },
      failure_policy: { retry: 'new_request_only' },
      lifecycle: { linked_pr: null, consumed_by: null, closed_at: null },
    },
    claimInput: {},
  });

  assert.equal(validation.ok, false);
  assert.match(validation.errors.join('\n'), /current_pr_head_sha is required/);
});
