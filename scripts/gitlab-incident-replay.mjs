import assert from 'node:assert/strict';
import {
  buildGitLabRepairDedupeKey,
  buildGitLabRepairDedupeMarker,
  findGitLabRepairMr,
  hasEffectiveGitLabRepairDiff,
} from '../tools/zj-loop-core/dist/index.js';

const PROJECT = 'group/project';
const TARGET_BRANCH = 'main';
const ACTIONS = [{ action: 'update', file_path: 'zj-loop/gitlab-ci/example.yml', content: 'fixed\n' }];
const SAME_ACTIONS = [{ action: 'update', file_path: 'zj-loop/gitlab-ci/example.yml', content: 'same\n' }];

export async function replayGitLabIncident() {
  const writes = [];
  const headers = { Authorization: 'Bearer fixture-token' };
  const dedupe = buildGitLabRepairDedupeKey({ projectPath: PROJECT, routeFamily: 'ci-sweeper', targetBranch: TARGET_BRANCH, actions: ACTIONS });
  const duplicateRead = await findGitLabRepairMr({
    projectPath: PROJECT,
    routeFamily: 'ci-sweeper',
    targetBranch: TARGET_BRANCH,
    actions: ACTIONS,
    branch: 'automated/ci-sweeper-gitlab-request-b',
    headers,
    fetchImpl: async (url, options = {}) => {
      if (options.method) writes.push({ url, method: options.method });
      return response(200, [{
        iid: 44,
        source_branch: 'automated/ci-sweeper-gitlab-request-a',
        target_branch: TARGET_BRANCH,
        description: buildGitLabRepairDedupeMarker({ ...dedupe, routeFamily: 'ci-sweeper' }),
        web_url: 'https://git.example/group/project/-/merge_requests/44',
      }]);
    },
  });
  assert.equal(duplicateRead.ok, true);
  assert.equal(duplicateRead.existing.iid, 44);

  const emptyDiff = await hasEffectiveGitLabRepairDiff({
    projectPath: PROJECT,
    targetBranch: TARGET_BRANCH,
    actions: SAME_ACTIONS,
    headers,
    fetchImpl: async (url, options = {}) => {
      if (options.method) writes.push({ url, method: options.method });
      return response(200, { content: Buffer.from('same\n').toString('base64') });
    },
  });
  assert.equal(emptyDiff, false);

  const mismatched = buildGitLabRepairDedupeKey({ projectPath: PROJECT, routeFamily: 'dependency-sweeper', targetBranch: TARGET_BRANCH, actions: ACTIONS });
  assert.notEqual(mismatched.key, dedupe.key);

  const residue = buildZeroResidueAudit({ open_carrier_issues: [], open_repair_mrs: [], repair_branches: [], duplicate_requests: [], duplicate_claims: [] });
  assert.equal(residue.status, 'healthy');
  assert.equal(writes.length, 0);
  return {
    schema: 'zj-loop.gitlab_incident_replay.v1',
    status: 'completed',
    outcome: 'zero-residue-fixture',
    side_effects_executed: false,
    provider_writes: 0,
    scenarios: [
      { name: 'cross-request-same-digest', status: 'passed', outcome: 'duplicate-reused', merge_request_iid: 44, dedupe_key: dedupe.key },
      { name: 'empty-repair-diff', status: 'passed', outcome: 'blocked-before-write', reason: 'repair-no-effective-diff' },
      { name: 'route-family-content-isolation', status: 'passed', outcome: 'digest-mismatch-requires-independent-review' },
    ],
    residue,
    cleanup_plan: { status: 'not-required', actions: [], confirmation_required: true },
    replay: { provider: 'gitlab', project: PROJECT, target_branch: TARGET_BRANCH, fixture: true, writes: [] },
  };
}

export function buildZeroResidueAudit(input) {
  const fields = ['open_carrier_issues', 'open_repair_mrs', 'repair_branches', 'duplicate_requests', 'duplicate_claims'];
  const counts = Object.fromEntries(fields.map((field) => [field, Array.isArray(input[field]) ? input[field].length : -1]));
  const valid = fields.every((field) => counts[field] === 0);
  return { schema: 'zj-loop.gitlab_zero_residue_audit.v1', status: valid ? 'healthy' : 'blocked', counts, reason: valid ? 'no-residue' : 'residue-detected' };
}

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  replayGitLabIncident().then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => { console.error(error); process.exitCode = 1; });
}
