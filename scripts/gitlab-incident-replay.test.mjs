import assert from 'node:assert/strict';
import test from 'node:test';
import { buildZeroResidueAudit, replayGitLabIncident } from './gitlab-incident-replay.mjs';

test('GitLab incident replay is deterministic and performs no provider writes', async () => {
  const result = await replayGitLabIncident();
  assert.equal(result.schema, 'zj-loop.gitlab_incident_replay.v1');
  assert.equal(result.status, 'completed');
  assert.equal(result.side_effects_executed, false);
  assert.equal(result.provider_writes, 0);
  assert.deepEqual(result.scenarios.map((scenario) => scenario.outcome), [
    'duplicate-reused',
    'blocked-before-write',
    'digest-mismatch-requires-independent-review',
  ]);
  assert.equal(result.residue.status, 'healthy');
  assert.equal(result.cleanup_plan.confirmation_required, true);
});

test('zero-residue audit fails closed when any tracked resource remains', () => {
  const result = buildZeroResidueAudit({ open_carrier_issues: [{ iid: 1 }], open_repair_mrs: [], repair_branches: [], duplicate_requests: [], duplicate_claims: [] });
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'residue-detected');
});
