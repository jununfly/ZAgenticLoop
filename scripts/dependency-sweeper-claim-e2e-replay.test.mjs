import assert from 'node:assert/strict';
import test from 'node:test';

import {
  replayDependencySweeperClaim,
  runDependencySweeperClaimReplaySuite,
} from './dependency-sweeper-claim-e2e-replay.mjs';

const ROUTE_TABLE_PATH = 'zj-loop/zj-loop-route-table.yaml';

test('Dependency Sweeper claim consumes a requested patch Issue Fix Request only', async () => {
  const suite = await runDependencySweeperClaimReplaySuite({ routeTablePath: ROUTE_TABLE_PATH });
  const replay = suite.results.find((item) => item.name === 'patch-request-consumed').replay;

  assert.equal(replay.outcome, 'consumed');
  assert.equal(replay.requestBeforeClaim.status, 'requested');
  assert.equal(replay.claimedRequest.status, 'consumed');
  assert.equal(replay.claimedRequest.lifecycle.consumed_by, 'dependency-sweeper');
  assert.equal(replay.claimEvidence.schema, 'zj-loop.dependency_sweeper_claim.v1');
  assert.equal(replay.claimEvidence.capability, 'patch-dependency-fix');
  assert.match(replay.claimEvidence.lifecycle_comment, /Issue Fix Request lifecycle updated to consumed/);
  assert.deepEqual(replay.claimEvidence.side_effects, {
    package_manifest_edited: false,
    lockfile_edited: false,
    branch_created: false,
    pull_request_created: false,
    workflow_dispatched: false,
    repair_started: false,
    auto_merge_enabled: false,
  });
  assert.deepEqual(replay.steps.map((step) => step.name), [
    'dependency-alert',
    'route-decision',
    'issue-fix-request',
    'dependency-sweeper-claim',
  ]);
});

test('Dependency Sweeper claim differentiates patch and minor capabilities', async () => {
  const suite = await runDependencySweeperClaimReplaySuite({ routeTablePath: ROUTE_TABLE_PATH });
  const patch = suite.results.find((item) => item.name === 'patch-request-consumed').replay;
  const minor = suite.results.find((item) => item.name === 'minor-request-consumed').replay;

  assert.equal(suite.passed, true);
  assert.equal(patch.requestBeforeClaim.requested_consumer.capability, 'patch-dependency-fix');
  assert.equal(minor.requestBeforeClaim.requested_consumer.capability, 'minor-dependency-fix');
  assert.equal(minor.claimedRequest.status, 'consumed');
});

test('Dependency Sweeper claim denies consumer mismatch, missing verifier, and repeated claim', async () => {
  const suite = await runDependencySweeperClaimReplaySuite({ routeTablePath: ROUTE_TABLE_PATH });
  const outcomes = Object.fromEntries(suite.results.map((result) => [result.name, result.replay]));

  for (const name of ['consumer-mismatch-denied', 'missing-verifier-denied', 'non-requested-denied']) {
    assert.equal(outcomes[name].outcome, 'claim-denied');
    assert.equal(outcomes[name].claimedRequest, null);
    assert.equal(outcomes[name].claimEvidence, null);
    assert.equal(outcomes[name].steps.at(-1).name, 'dependency-sweeper-claim');
    assert.equal(outcomes[name].steps.at(-1).status, 'denied');
  }
  assert.match(outcomes['consumer-mismatch-denied'].steps.at(-1).reason, /consumer must be dependency-sweeper/);
  assert.match(outcomes['missing-verifier-denied'].steps.at(-1).reason, /verification gate/);
  assert.match(outcomes['non-requested-denied'].steps.at(-1).reason, /status must be requested/);
});

test('major and high-risk dependency signals are denied before claim', async () => {
  const suite = await runDependencySweeperClaimReplaySuite({ routeTablePath: ROUTE_TABLE_PATH });
  const major = suite.results.find((item) => item.name === 'major-update-denied-before-request').replay;
  const highRisk = suite.results.find((item) => item.name === 'high-risk-denied-before-request').replay;

  assert.equal(major.outcome, 'route-denied');
  assert.equal(highRisk.outcome, 'route-denied');
  assert.equal(major.requestBeforeClaim, null);
  assert.equal(highRisk.requestBeforeClaim, null);
  assert.equal(major.claimEvidence, null);
  assert.equal(highRisk.claimEvidence, null);
});

test('disabled dependency-sweeper route denies before claim evidence', async () => {
  const routeTableText = `
routes:
  - route_id: "dependency-sweeper"
    enabled: false
    request_kind: "issue-fix-request"
    consumer: "dependency-sweeper"
    match:
      source: ["dependency"]
      update_type: ["patch", "minor"]
      risk: ["low", "medium"]
`;
  const replay = replayDependencySweeperClaim({
    routeTableText,
    scenario: {
      name: 'disabled-route',
      signal: {
        source: 'dependency',
        repo: 'jununfly/ZAgenticLoop',
        head_branch: 'main',
        signal_id: 'dependency:npm:yaml:disabled',
        summary: 'Disabled route should not claim.',
        package_name: 'yaml',
        update_type: 'patch',
        risk: 'low',
        priority: 'P2',
        confidence: 'high',
        fix_scope: { files_or_areas: ['package.json', 'package-lock.json'] },
        verification_commands: ['npm ci', 'npm test'],
      },
    },
  });

  assert.equal(replay.outcome, 'route-denied');
  assert.equal(replay.routeDecision.reason, 'route-disabled');
  assert.equal(replay.claimEvidence, null);
});
