import assert from 'node:assert/strict';
import test from 'node:test';

import { parseIssueFixRequestComments } from './issue-fix-request-contract.mjs';
import {
  buildPrStewardFixRequestIssueBody,
  buildPrStewardFixRequestIssueTitle,
  runPrStewardFixRequestReplaySuite,
} from './pr-steward-fix-request-e2e-replay.mjs';

test('PR Steward fix request creates independent Issue Fix Request for failed GitHub check rollup', async () => {
  const suite = await runPrStewardFixRequestReplaySuite();
  const byName = Object.fromEntries(suite.results.map((result) => [result.name, result.replay]));
  const replay = byName['synchronize-failing-checks'];

  assert.equal(suite.passed, true);
  assert.equal(replay.outcome, 'create-request');
  assert.equal(replay.routeDecision.route_id, 'pr-steward-fix-request');
  assert.equal(replay.routeDecision.request_kind, 'issue-fix-request');
  assert.equal(replay.routeDecision.target_consumer, 'pr-steward');
  assert.equal(replay.issueFixRequest.dedupe_key, 'pr:jununfly/ZAgenticLoop:42:head:abc123def456:checks:failure');
  assert.deepEqual(replay.issueFixRequest.verification_gate.commands, [
    'npm run test:pr-steward-report',
    'npm run test:issue-fix-request',
    'npm run test:route-decision',
    'git diff --check',
  ]);
  assert.deepEqual(replay.issueFixRequest.subject, {
    type: 'pull_request',
    repo: 'jununfly/ZAgenticLoop',
    pr_number: 42,
    head_sha: 'abc123def456',
    base_branch: 'main',
  });
  assert.equal(replay.sideEffects.pr_comment_created, false);
  assert.equal(replay.sideEffects.consumer_claimed, false);
});

test('PR Steward fix request body has fixed title and parseable machine block', async () => {
  const suite = await runPrStewardFixRequestReplaySuite();
  const request = suite.results.find((result) => result.name === 'synchronize-failing-checks').replay.issueFixRequest;
  const title = buildPrStewardFixRequestIssueTitle(request);
  const body = buildPrStewardFixRequestIssueBody(request);
  const parsed = parseIssueFixRequestComments([{ id: 'body', body }]);

  assert.equal(title, '[Issue Fix Request] pr-steward-fix-request: PR #42 failing checks');
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].validation.ok, true);
  assert.equal(parsed[0].request.route_decision.route_id, 'pr-steward-fix-request');
});

test('PR Steward fix request denies unsafe or ambiguous PR signals before request creation', async () => {
  const suite = await runPrStewardFixRequestReplaySuite();
  const outcomes = Object.fromEntries(suite.results.map((result) => [result.name, result.replay.outcome]));

  assert.equal(outcomes['missing-github-check-source'], 'denied');
  assert.equal(outcomes['draft-pr-denied'], 'denied');
  assert.equal(outcomes['non-main-base-denied'], 'denied');
  assert.equal(outcomes['opened-action-denied'], 'denied');
});

test('PR Steward fix request duplicate returns existing request URL without PR side effects', async () => {
  const suite = await runPrStewardFixRequestReplaySuite();
  const replay = suite.results.find((result) => result.name === 'duplicate-same-pr-head').replay;

  assert.equal(replay.outcome, 'duplicate');
  assert.equal(replay.issueFixRequest.status, 'duplicate');
  assert.equal(replay.issueFixRequest.lifecycle.existing_request_id, 'ifr_existing_pr_42');
  assert.equal(replay.issueFixRequest.lifecycle.existing_request_url, 'https://github.com/jununfly/ZAgenticLoop/issues/200');
  assert.equal(replay.sideEffects.pr_comment_created, false);
});
