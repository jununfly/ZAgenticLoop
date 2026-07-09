import assert from 'node:assert/strict';
import test from 'node:test';

import { buildRoadmapHandoffPrBody, evaluateRoadmapHandoffGate } from './roadmap-handoff-gate.mjs';

const PR_BODY = [
  '## Verification',
  '',
  '- npm run test:dependency-sweeper-route passed',
  '',
  '## Closeout Status',
  '',
  '- Closeout commit is present and process files were removed.',
  '',
  '## Durable Docs',
  '',
  '- docs/testing/dependency-sweeper-route-e2e.md',
  '',
  '## Branch Cleanup',
  '',
  '- Delete zjal/dependency-sweeper-route after merge.',
  '',
  '```yaml',
  'kind: zj-loop.post-merge-contract',
  'version: 1',
  'consumer: post-merge-cleanup',
  'mode: roadmap-closeout',
  'roadmap:',
  '  id: dependency-sweeper-route',
  '  branch: zjal/dependency-sweeper-route',
  'carrier:',
  '  issue: 23',
  'cleanup:',
  '  delete_merged_branch: true',
  '  close_carrier_issue: true',
  'safety:',
  '  require_pr_merged: true',
  '  require_branch_merged: true',
  '  no_pending_followups: true',
  '  missing_contract_behavior: report-only',
  '```',
].join('\n');

const VALID_INPUT = {
  roadmapId: 'dependency-sweeper-route',
  branchName: 'zjal/dependency-sweeper-route',
  workingTreeClean: true,
  branchPushed: true,
  closeoutCommitPresent: true,
  processFilesRemoved: true,
  pr: {
    number: 24,
    url: 'https://github.com/jununfly/ZAgenticLoop/pull/24',
    headRefName: 'zjal/dependency-sweeper-route',
    baseRefName: 'main',
    body: PR_BODY,
  },
};

test('passes only after closeout has a pushed branch and reviewable PR handoff', () => {
  const result = evaluateRoadmapHandoffGate(VALID_INPUT);

  assert.equal(result.status, 'passed');
  assert.deepEqual(result.errors, []);
});

test('renders a PR body with a valid post-merge closeout contract', () => {
  const body = buildRoadmapHandoffPrBody({
    roadmapId: 'dependency-sweeper-route',
    branchName: 'zjal/dependency-sweeper-route',
    activationCarrierIssue: 23,
    summary: 'Complete dependency sweeper route.',
    verification: ['npm run test:dependency-sweeper-route passed'],
    durableDocs: ['docs/testing/dependency-sweeper-route-e2e.md'],
    closeoutCommit: 'abc1234',
  });

  assert.match(body, /## Post-Merge Contract/);
  assert.match(body, /kind: zj-loop\.post-merge-contract/);
  assert.match(body, /issue: 23/);

  const result = evaluateRoadmapHandoffGate({
    ...VALID_INPUT,
    pr: {
      ...VALID_INPUT.pr,
      body,
    },
  });

  assert.equal(result.status, 'passed');
  assert.deepEqual(result.errors, []);
});

test('blocks when a closeout commit exists but PR handoff is missing', () => {
  const result = evaluateRoadmapHandoffGate({
    ...VALID_INPUT,
    branchPushed: false,
    pr: {
      body: PR_BODY,
      headRefName: 'zjal/dependency-sweeper-route',
      baseRefName: 'main',
    },
  });

  assert.equal(result.status, 'blocked');
  assert.ok(result.errors.includes('branchPushed must be true before roadmap loop can be complete'));
  assert.ok(result.errors.includes('PR must be opened or updated before roadmap loop can be complete'));
});

test('blocks when PR body does not carry closeout and post-merge evidence', () => {
  const result = evaluateRoadmapHandoffGate({
    ...VALID_INPUT,
    pr: {
      ...VALID_INPUT.pr,
      body: '## Summary\n\nImplementation only.',
    },
  });

  assert.equal(result.status, 'blocked');
  assert.ok(result.errors.includes('PR body must include closeout status'));
  assert.ok(result.errors.includes('PR body must include a zj-loop.post-merge-contract YAML block'));
});

test('blocks mismatched contract branch to prevent generic cleanup', () => {
  const result = evaluateRoadmapHandoffGate({
    ...VALID_INPUT,
    pr: {
      ...VALID_INPUT.pr,
      body: PR_BODY.replace('branch: zjal/dependency-sweeper-route', 'branch: zjal/other-route'),
    },
  });

  assert.equal(result.status, 'blocked');
  assert.ok(result.errors.includes('post-merge contract roadmap.branch must match branchName'));
});
