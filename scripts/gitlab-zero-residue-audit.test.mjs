import assert from 'node:assert/strict';
import test from 'node:test';
import { auditGitLabZeroResidue, buildCleanupPlan, GITLAB_INCIDENT_CLEANUP_CONFIRMATION } from './gitlab-zero-residue-audit.mjs';

function cleanClient() {
  return { listIssues: async () => [], listMergeRequests: async () => [], listBranches: async () => [], listIssueNotes: async () => [] };
}

test('zero-residue audit stays read-only and reports a healthy project', async () => {
  const result = await auditGitLabZeroResidue({ client: cleanClient(), projectPath: 'group/project' });
  assert.equal(result.status, 'healthy');
  assert.equal(result.side_effects_executed, false);
  assert.equal(result.provider_writes, 0);
  assert.equal(result.cleanup_plan.status, 'not-required');
});

test('zero-residue audit reports repair MR and branch cleanup plan without executing it', async () => {
  let writes = 0;
  const result = await auditGitLabZeroResidue({
    projectPath: 'group/project',
    client: {
      listIssues: async () => [],
      listMergeRequests: async () => [{ iid: 8, description: '<!-- zj-loop:repair-dedupe {"schema":"zj-loop.repair_dedupe.v1","key":"k","digest":"d","route_family":"ci-sweeper"} -->', source_branch: 'automated/ci-sweeper-gitlab-old', web_url: 'https://git.example/mr/8' }],
      listBranches: async () => [{ name: 'automated/ci-sweeper-gitlab-old', web_url: 'https://git.example/branch/old' }],
      listIssueNotes: async () => [],
      write: () => { writes += 1; },
    },
  });
  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.cleanup_plan.actions.map((action) => action.action), ['review-open-repair-mr', 'review-repair-branch']);
  assert.equal(result.cleanup_plan.confirmation_required, true);
  assert.equal(result.cleanup_plan.actions[0].confirmation.required_phrase, GITLAB_INCIDENT_CLEANUP_CONFIRMATION);
  assert.equal(result.cleanup_plan.actions[0].preconditions.read_before_write, true);
  assert.match(result.cleanup_plan.actions[0].resume_id, /^gitlab-cleanup-[a-f0-9]{16}$/);
  assert.equal(result.side_effects_executed, false);
  assert.equal(writes, 0);
});

test('cleanup plan resume ids are deterministic per resource identity', () => {
  const input = { open_repair_mrs: [{ iid: 8, url: 'https://git.example/mr/8' }], repair_branches: [], duplicate_requests: [], duplicate_claims: [] };
  assert.deepEqual(buildCleanupPlan(input), buildCleanupPlan(input));
});
