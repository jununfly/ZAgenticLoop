import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGitLabCompletionEvidence, validateCompletionEvidence } from '../dist/index.js';

test('GitLab read-only adapter maps pipeline, job, artifact, and infra provenance', () => {
  const evidence = buildGitLabCompletionEvidence({
    orchestrationId: 'orch_gitlab_1',
    signalId: '10553918',
    routeId: 'changelog-drafter-report',
    requestId: 'req_gitlab_1',
    carrier: { kind: 'schedule', id: '961' },
    consumerId: 'zj_loop_changelog_drafter',
    pipeline: {
      id: 10553918,
      source: 'schedule',
      ref: 'master',
      sha: 'abc123',
      status: 'success',
      created_at: '2026-07-22T01:43:02.162+08:00',
      web_url: 'https://git.example/pipelines/10553918',
    },
    job: {
      id: 26132173,
      name: 'zj_loop_schedule_health_check',
      status: 'success',
      ref: 'master',
      pipeline_id: 10553918,
      web_url: 'https://git.example/jobs/26132173',
    },
    artifact: {
      path: 'schedule-health-result.json',
      schema: 'zj-loop.schedule_health.v1',
    },
    infraProvenance: {
      contract: 'zj-loop.gitlab-infra.v1',
      infra_version: '0.1.0',
      gitlab_version: '14.10.5-jh',
      project_path: 'example-group/product-project',
      capabilities: ['pipeline-read', 'job-read', 'artifact-read'],
    },
  });

  const result = validateCompletionEvidence(evidence);
  assert.equal(result.ok, true);
  assert.equal(evidence.status, 'executed_to_review_artifact');
  assert.equal(evidence.side_effects_executed, false);
  assert.equal(evidence.provenance.provider, 'gitlab');
  assert.equal(evidence.provenance.pipeline_id, '10553918');
  assert.equal(evidence.provenance.job_id, '26132173');
  assert.equal(evidence.provenance.artifact_schema, 'zj-loop.schedule_health.v1');
  assert.equal(evidence.provenance.infra_contract, 'zj-loop.gitlab-infra.v1');
});

test('GitLab read-only adapter hard-stops when the artifact is missing', () => {
  const evidence = buildGitLabCompletionEvidence({
    orchestrationId: 'orch_gitlab_2',
    signalId: '10553918',
    routeId: 'changelog-drafter-report',
    requestId: 'req_gitlab_2',
    carrier: { kind: 'schedule', id: '961' },
    consumerId: 'zj_loop_changelog_drafter',
    pipeline: { id: 10553918, source: 'schedule', ref: 'master', sha: 'abc123', status: 'success', created_at: '2026-07-22T01:43:02.162+08:00', web_url: null },
    job: { id: 26132173, name: 'zj_loop_changelog_drafter', status: 'success', ref: 'master', pipeline_id: 10553918, web_url: null },
    artifact: null,
    infraProvenance: { contract: 'zj-loop.gitlab-infra.v1', infra_version: '0.1.0', gitlab_version: '14.10.5-jh', project_path: 'example-group/product-project', capabilities: ['pipeline-read', 'job-read'] },
  });

  const result = validateCompletionEvidence(evidence);
  assert.equal(evidence.status, 'hard_stopped');
  assert.equal(evidence.stop_reason, 'scheduled-artifact-missing');
  assert.equal(evidence.side_effects_executed, false);
  assert.equal(result.ok, true);
});
