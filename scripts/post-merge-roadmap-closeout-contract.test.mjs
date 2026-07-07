import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  buildRoadmapCloseoutPlan,
  parsePostMergeContractFromPrBody,
  validatePostMergeContract,
} from './post-merge-roadmap-closeout-contract.mjs';
import { findRoute } from './route-ci-failure.mjs';

const VALID_BODY = [
  '## Post-Merge Contract',
  '',
  '```yaml',
  'kind: zj-loop.post-merge-contract',
  'version: 1',
  'consumer: post-merge-cleanup',
  'mode: roadmap-closeout',
  'roadmap:',
  '  id: route-table-closeout',
  '  branch: zjal/route-table-closeout',
  'carrier:',
  '  issue: 42',
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

const MERGED_PR = {
  number: 24,
  merged: true,
  headRefName: 'zjal/route-table-closeout',
  headRepositoryOwner: 'jununfly',
  baseRepositoryOwner: 'jununfly',
  baseRefName: 'main',
};

test('parses the fixed YAML post-merge contract from PR body', () => {
  const result = parsePostMergeContractFromPrBody(VALID_BODY);

  assert.equal(result.ok, true);
  assert.equal(result.contract.kind, 'zj-loop.post-merge-contract');
  assert.equal(result.contract.consumer, 'post-merge-cleanup');
  assert.equal(result.contract.mode, 'roadmap-closeout');
  assert.equal(result.contract.roadmap.branch, 'zjal/route-table-closeout');
});

test('valid contract plans dry-run actions for merged current roadmap branch and carrier issue', () => {
  const parsed = parsePostMergeContractFromPrBody(VALID_BODY);
  const validation = validatePostMergeContract(parsed.contract, { pr: MERGED_PR });
  const plan = buildRoadmapCloseoutPlan({ pr: MERGED_PR, contractResult: parsed });

  assert.equal(validation.ok, true);
  assert.equal(plan.status, 'dry-run');
  assert.deepEqual(
    plan.actions.map((action) => [action.name, action.status]),
    [
      ['delete_merged_branch', 'planned'],
      ['close_carrier_issue', 'planned'],
    ],
  );
  assert.equal(plan.guards.pr_merged, true);
  assert.equal(plan.guards.current_roadmap_branch, true);
  assert.equal(plan.side_effects_executed, false);
});

test('missing contract is report-only and does not plan side effects', () => {
  const parsed = parsePostMergeContractFromPrBody('## No contract here');
  const plan = buildRoadmapCloseoutPlan({ pr: MERGED_PR, contractResult: parsed });

  assert.equal(parsed.ok, false);
  assert.equal(parsed.reason, 'missing-contract');
  assert.equal(plan.status, 'report-only');
  assert.deepEqual(plan.actions, []);
  assert.equal(plan.side_effects_executed, false);
});

test('legacy mapping contract shape is retired and not accepted', () => {
  const legacyBody = [
    '## Post-Merge Contract',
    '',
    '```yaml',
    'zj-loop.post-merge-contract:',
    '  activation_issue: 42',
    '  roadmap_branch: zjal/legacy-shape',
    '  no_pending_followups: true',
    '  cleanup:',
    '    delete_branch: true',
    '    close_activation_issue: true',
    '```',
  ].join('\n');
  const parsed = parsePostMergeContractFromPrBody(legacyBody);
  const plan = buildRoadmapCloseoutPlan({ pr: MERGED_PR, contractResult: parsed });

  assert.equal(parsed.ok, false);
  assert.equal(parsed.reason, 'missing-contract');
  assert.equal(plan.status, 'report-only');
  assert.deepEqual(plan.actions, []);
});

test('branch mismatch is report-only even when the contract parses', () => {
  const parsed = parsePostMergeContractFromPrBody(VALID_BODY);
  const plan = buildRoadmapCloseoutPlan({
    pr: { ...MERGED_PR, headRefName: 'feature/not-roadmap' },
    contractResult: parsed,
  });

  assert.equal(plan.status, 'report-only');
  assert.ok(plan.validation.errors.includes('roadmap.branch must match PR head branch'));
  assert.deepEqual(plan.actions, []);
});

test('carrier issue close requires explicit no pending follow-ups safety field', () => {
  const body = VALID_BODY.replace('  no_pending_followups: true\n', '');
  const parsed = parsePostMergeContractFromPrBody(body);
  const plan = buildRoadmapCloseoutPlan({ pr: MERGED_PR, contractResult: parsed });

  assert.equal(plan.status, 'report-only');
  assert.ok(plan.validation.errors.includes('safety.no_pending_followups must be true when close_carrier_issue is true'));
  assert.deepEqual(plan.actions, []);
});

test('fork or unknown head repository is report-only', () => {
  const parsed = parsePostMergeContractFromPrBody(VALID_BODY);
  const forkPlan = buildRoadmapCloseoutPlan({
    pr: { ...MERGED_PR, headRepositoryOwner: 'external-user' },
    contractResult: parsed,
  });
  const unknownPlan = buildRoadmapCloseoutPlan({
    pr: { ...MERGED_PR, headRepositoryOwner: undefined },
    contractResult: parsed,
  });

  assert.equal(forkPlan.status, 'report-only');
  assert.ok(forkPlan.validation.errors.includes('PR head repository must match base repository'));
  assert.deepEqual(forkPlan.actions, []);
  assert.equal(unknownPlan.status, 'report-only');
  assert.ok(unknownPlan.validation.errors.includes('PR head repository must match base repository'));
  assert.deepEqual(unknownPlan.actions, []);
});

test('dogfood route table exposes roadmap closeout as report-only scaffold', async () => {
  const routeTableText = await readFile('zj-loop/zj-loop-route-table.yaml', 'utf8');
  const route = findRoute(routeTableText, 'post-merge-roadmap-closeout');

  assert.equal(route.enabled, true);
  assert.equal(route.request_kind, 'report-only');
  assert.equal(route.consumer, 'post-merge-cleanup');
  assert.equal(route.mode, 'roadmap-closeout');
  assert.equal(route.guards.requires_post_merge_contract, true);
  assert.equal(route.guards.report_only_if_contract_missing, true);
  assert.equal(route.guards.requires_no_pending_followups, true);
  assert.equal(route.guards.destructive_actions_enabled, false);
});
