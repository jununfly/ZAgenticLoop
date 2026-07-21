import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateScheduleHealth, inspectGitLabScheduleHealth } from '../dist/schedule-health-contract.js';

const target = { provider: 'gitlab', project: 'group/project', route_id: 'issue-backlog-triage', schedule_id: '957', job: 'zj_loop_issue_triage', artifact: 'issue-recommendations.json', artifact_schema: 'zj-loop.issue_recommendations.v1' };
const reportArtifact = { schema: 'zj-loop.issue_recommendations.v1', provider: 'gitlab', project_path: 'group/project', route: 'issue-backlog-triage', source: 'gitlab-issues-api', side_effects: { labels: false, comments: false, state: false, requests: false } };
const dailyTarget = { provider: 'gitlab', project: 'group/project', route_id: 'daily-triage-report', schedule_id: '962', job: 'zj_loop_daily_triage', artifact: 'route-decision.json', artifact_schema: 'zj-loop.route_decision.v1', supporting_artifact: 'consumer-plan.json', supporting_artifact_schema: 'zj-loop.consumer_run_plan.v1' };
const dailyRouteDecision = { schema: 'zj-loop.route_decision.v1', route: 'daily-triage-report', request_kind: 'report-only', target_consumer: 'daily-triage', source: 'gitlab-pipeline', allowed: true };
const dailyConsumerPlan = { schema: 'zj-loop.consumer_run_plan.v1', route_id: 'daily-triage-report', consumer: 'daily-triage', execution_mode: 'report-only', request_kind: 'report-only', status: 'report-only', execution_allowed: false, validation: { valid: true }, route_decision: dailyRouteDecision };
const dependencyTarget = { provider: 'gitlab', project: 'group/project', route_id: 'dependency-sweeper', schedule_id: '961', job: 'zj_loop_dependency_sweeper', artifact: 'consumer-plan.json', artifact_schema: 'zj-loop.consumer_run_plan.v1', supporting_artifact: 'route-decision.json', supporting_artifact_schema: 'zj-loop.route_decision.v1' };
const dependencyRouteDecision = { schema: 'zj-loop.route_decision.v1', route: 'dependency-sweeper', request_kind: 'issue-fix-request', target_consumer: 'dependency-sweeper', source: 'gitlab-dependency', allowed: true };
const dependencyConsumerPlan = { schema: 'zj-loop.consumer_run_plan.v1', route_id: 'dependency-sweeper', consumer: 'dependency-sweeper', consumer_kind: 'fix-runner', execution_mode: 'claim-only', request_kind: 'issue-fix-request', status: 'ready', execution_allowed: true, validation: { valid: true }, route_decision: dependencyRouteDecision };
const changelogTarget = { provider: 'gitlab', project: 'group/project', route_id: 'changelog-drafter-report', schedule_id: '961', job: 'zj_loop_changelog_drafter', artifact: 'gitlab-changelog-draft-evidence.json', artifact_schema: 'zj-loop.gitlab_changelog_draft_evidence.v1', supporting_artifact: 'route-decision.json', supporting_artifact_schema: 'zj-loop.route_decision.v1', supporting_artifact_2: 'consumer-plan.json', supporting_artifact_2_schema: 'zj-loop.consumer_run_plan.v1' };
const changelogRouteDecision = { schema: 'zj-loop.route_decision.v1', route: 'changelog-drafter-report', request_kind: 'report-only', target_consumer: 'changelog-drafter', source: 'gitlab-release-window', allowed: true };
const changelogConsumerPlan = { schema: 'zj-loop.consumer_run_plan.v1', route_id: 'changelog-drafter-report', consumer: 'changelog-drafter', execution_mode: 'report-only', request_kind: 'report-only', status: 'report-only', execution_allowed: false, validation: { valid: true }, route_decision: changelogRouteDecision };
const changelogEvidence = { schema: 'zj-loop.gitlab_changelog_draft_evidence.v1', status: 'completed', outcome: 'draft-evidence', audit: { project_path: 'group/project', draft_mode: 'evidence', side_effects_executed: false, release_window: { repo: 'group/project', base_branch: 'master', since_ref: 'v1', until_ref: 'v2' } } };

test('schedule health is not_due before the expected window', () => {
  const result = evaluateScheduleHealth({ target, now: '2026-07-15T00:05:00Z', schedule: { active: true, updated_at: '2026-07-15T00:00:00Z', next_run_at: '2026-07-15T01:00:00Z' } });
  assert.equal(result.status, 'not_due');
  assert.deepEqual(result.next_steps, []);
});

test('schedule health derives the first expected window from cron after schedule update', () => {
  const result = evaluateScheduleHealth({
    target,
    now: '2026-07-16T00:05:00Z',
    schedule: {
      active: true,
      updated_at: '2026-07-15T05:49:55.667Z',
      cron: '0 9 * * *',
      cron_timezone: 'Asia/Shanghai',
    },
  });

  assert.equal(result.status, 'not_due');
  assert.deepEqual(result.expected_window, {
    start: '2026-07-16T01:00:00.000Z',
    grace_minutes: 10,
  });
});

test('schedule health accepts an explicit first-window override for controlled checks', () => {
  const result = evaluateScheduleHealth({
    target,
    now: '2026-07-15T00:02:00Z',
    expectedWithinMinutes: 3,
    schedule: {
      active: true,
      updated_at: '2026-07-15T00:00:00Z',
      cron: '0 9 * * *',
      cron_timezone: 'Asia/Shanghai',
    },
  });

  assert.equal(result.status, 'not_due');
  assert.equal(result.expected_window.start, '2026-07-15T00:03:00.000Z');
});

test('schedule health accepts the first scheduled pipeline after a schedule update after its grace window', () => {
  const result = evaluateScheduleHealth({
    target,
    now: '2026-07-15T00:14:00Z',
    schedule: {
      active: true,
      updated_at: '2026-07-15T00:00:00Z',
      next_run_at: '2026-07-15T01:00:00Z',
    },
    pipeline: {
      source: 'schedule',
      ref: 'master',
      created_at: '2026-07-15T00:03:00Z',
      job: 'zj_loop_issue_triage',
      artifact: 'issue-recommendations.json',
      artifact_schema: 'zj-loop.issue_recommendations.v1',
      artifact_payload: reportArtifact,
    },
  });

  assert.equal(result.status, 'healthy');
  assert.equal(result.expected_window.start, '2026-07-15T00:03:00.000Z');
});

test('schedule health keeps the first scheduled pipeline not_due during its grace window', () => {
  const result = evaluateScheduleHealth({
    target,
    now: '2026-07-15T00:12:00Z',
    schedule: {
      active: true,
      updated_at: '2026-07-15T00:00:00Z',
      next_run_at: '2026-07-15T01:00:00Z',
    },
    pipeline: {
      source: 'schedule',
      created_at: '2026-07-15T00:03:00Z',
    },
  });

  assert.equal(result.status, 'not_due');
  assert.equal(result.expected_window.start, '2026-07-15T00:03:00.000Z');
});

test('schedule health validates Daily Triage dual artifacts from one first scheduled pipeline', () => {
  const result = evaluateScheduleHealth({
    target: dailyTarget,
    now: '2026-07-15T00:14:00Z',
    schedule: { active: true, updated_at: '2026-07-15T00:00:00Z', next_run_at: '2026-07-15T01:00:00Z' },
    pipeline: {
      source: 'schedule',
      ref: 'master',
      created_at: '2026-07-15T00:03:00Z',
      job: 'zj_loop_daily_triage',
      artifact: 'route-decision.json',
      artifact_schema: 'zj-loop.route_decision.v1',
      artifact_payload: dailyRouteDecision,
      supporting_artifact: 'consumer-plan.json',
      supporting_artifact_schema: 'zj-loop.consumer_run_plan.v1',
      supporting_artifact_payload: dailyConsumerPlan,
    },
  });

  assert.equal(result.status, 'healthy');
  assert.equal(result.target.supporting_artifact, 'consumer-plan.json');
});

test('schedule health rejects Daily Triage when the supporting artifact drifts', () => {
  const result = evaluateScheduleHealth({
    target: dailyTarget,
    now: '2026-07-15T00:14:00Z',
    schedule: { active: true, updated_at: '2026-07-15T00:00:00Z', next_run_at: '2026-07-15T01:00:00Z' },
    pipeline: {
      source: 'schedule',
      ref: 'master',
      created_at: '2026-07-15T00:03:00Z',
      job: 'zj_loop_daily_triage',
      artifact: 'route-decision.json',
      artifact_schema: 'zj-loop.route_decision.v1',
      artifact_payload: dailyRouteDecision,
      supporting_artifact: 'consumer-plan.json',
      supporting_artifact_schema: 'zj-loop.consumer_run_plan.v1',
      supporting_artifact_payload: { ...dailyConsumerPlan, execution_allowed: true },
    },
  });

  assert.equal(result.status, 'artifact_schema_invalid');
  assert.deepEqual(result.artifact_errors, ['supporting_artifact.execution_allowed']);
});

test('schedule health validates Dependency Sweeper claim-only dual artifacts from one scheduled job', () => {
  const result = evaluateScheduleHealth({
    target: dependencyTarget,
    now: '2026-07-15T00:14:00Z',
    schedule: { active: true, updated_at: '2026-07-15T00:00:00Z', next_run_at: '2026-07-15T01:00:00Z' },
    pipeline: {
      source: 'schedule',
      ref: 'master',
      created_at: '2026-07-15T00:03:00Z',
      job: 'zj_loop_dependency_sweeper',
      artifact: 'consumer-plan.json',
      artifact_schema: 'zj-loop.consumer_run_plan.v1',
      artifact_payload: dependencyConsumerPlan,
      supporting_artifact: 'route-decision.json',
      supporting_artifact_schema: 'zj-loop.route_decision.v1',
      supporting_artifact_payload: dependencyRouteDecision,
    },
  });

  assert.equal(result.status, 'healthy');
  assert.equal(result.target.supporting_artifact, 'route-decision.json');
});

test('schedule health rejects Dependency Sweeper repair mode drift', () => {
  const result = evaluateScheduleHealth({
    target: dependencyTarget,
    now: '2026-07-15T00:14:00Z',
    schedule: { active: true, updated_at: '2026-07-15T00:00:00Z', next_run_at: '2026-07-15T01:00:00Z' },
    pipeline: {
      source: 'schedule',
      ref: 'master',
      created_at: '2026-07-15T00:03:00Z',
      job: 'zj_loop_dependency_sweeper',
      artifact: 'consumer-plan.json',
      artifact_schema: 'zj-loop.consumer_run_plan.v1',
      artifact_payload: { ...dependencyConsumerPlan, execution_mode: 'live' },
      supporting_artifact: 'route-decision.json',
      supporting_artifact_schema: 'zj-loop.route_decision.v1',
      supporting_artifact_payload: dependencyRouteDecision,
    },
  });

  assert.equal(result.status, 'artifact_schema_invalid');
  assert.deepEqual(result.artifact_errors, ['artifact.execution_mode']);
});

test('schedule health replay command preserves its explicit window override', () => {
  const result = evaluateScheduleHealth({
    target,
    now: '2026-07-15T00:20:00Z',
    expectedWithinMinutes: 3,
    audit: { api_url: 'https://gitlab.example/api/v4' },
    schedule: {
      active: true,
      updated_at: '2026-07-15T00:00:00Z',
      cron: '0 9 * * *',
      cron_timezone: 'Asia/Shanghai',
    },
  });

  assert.equal(result.status, 'execution_missing');
  assert.deepEqual(result.next_steps[0].command.slice(-4), [
    '--api-url', 'https://gitlab.example/api/v4',
    '--expected-within-minutes', '3',
  ]);
});

test('schedule health remains healthy between cron windows when current scheduled evidence exists', () => {
  const result = evaluateScheduleHealth({
    target,
    now: '2026-07-16T02:00:00Z',
    schedule: {
      active: true,
      updated_at: '2026-07-15T05:49:55.667Z',
      cron: '0 9 * * *',
      cron_timezone: 'Asia/Shanghai',
    },
    pipeline: {
      source: 'schedule',
      ref: 'master',
      created_at: '2026-07-16T01:03:00Z',
      job: 'zj_loop_issue_triage',
      artifact: 'issue-recommendations.json',
      artifact_schema: 'zj-loop.issue_recommendations.v1',
      artifact_payload: reportArtifact,
    },
  });

  assert.equal(result.status, 'healthy');
  assert.deepEqual(result.expected_window, {
    start: '2026-07-16T01:00:00.000Z',
    next_start: '2026-07-17T01:00:00.000Z',
    grace_minutes: 10,
  });
});

test('schedule health rejects scheduled evidence from an earlier cron window', () => {
  const result = evaluateScheduleHealth({
    target,
    now: '2026-07-17T02:00:00Z',
    schedule: {
      active: true,
      updated_at: '2026-07-15T05:49:55.667Z',
      cron: '0 9 * * *',
      cron_timezone: 'Asia/Shanghai',
    },
    pipeline: {
      source: 'schedule',
      created_at: '2026-07-16T01:03:00Z',
      job: 'zj_loop_issue_triage',
      artifact: 'issue-recommendations.json',
      artifact_schema: 'zj-loop.issue_recommendations.v1',
    },
  });

  assert.equal(result.status, 'execution_missing');
  assert.equal(result.escalation.reason, 'scheduled-pipeline-missing');
});

test('schedule health evaluates weekday cron in the configured timezone', () => {
  const result = evaluateScheduleHealth({
    target,
    now: '2026-07-12T16:05:00Z',
    schedule: {
      active: true,
      updated_at: '2026-07-12T16:00:00Z',
      cron: '0 9 * * 1-5',
      cron_timezone: 'Asia/Shanghai',
    },
  });

  assert.equal(result.status, 'not_due');
  assert.equal(result.expected_window.start, '2026-07-13T01:00:00.000Z');
});

test('schedule health escalates when the expected window passes without a current scheduled pipeline', () => {
  const result = evaluateScheduleHealth({ target, now: '2026-07-15T02:00:00Z', schedule: { active: true, updated_at: '2026-07-15T00:00:00Z', next_run_at: '2026-07-15T01:00:00Z' } });
  assert.equal(result.status, 'execution_missing');
  assert.equal(result.escalation.reason, 'scheduled-pipeline-missing');
  assert.deepEqual(result.next_steps[0].command, [
    'zj-loop-doctor',
    '--provider', 'gitlab',
    '--schedule-health',
    '--project', 'group/project',
    '--route', 'issue-backlog-triage',
    '--schedule-id', '957',
    '--job', 'zj_loop_issue_triage',
    '--artifact', 'issue-recommendations.json',
    '--artifact-schema', 'zj-loop.issue_recommendations.v1',
  ]);
});

test('schedule health accepts only a current scheduled pipeline with bound report-only artifact', () => {
  const result = evaluateScheduleHealth({ target, now: '2026-07-15T02:00:00Z', schedule: { active: true, updated_at: '2026-07-15T00:00:00Z', next_run_at: '2026-07-15T01:00:00Z' }, pipeline: { source: 'schedule', ref: 'master', created_at: '2026-07-15T01:01:00Z', job: 'zj_loop_issue_triage', artifact: 'issue-recommendations.json', artifact_schema: 'zj-loop.issue_recommendations.v1', artifact_payload: reportArtifact } });
  assert.equal(result.status, 'healthy');
});

test('schedule health rejects a report artifact with provider side effects', () => {
  const result = evaluateScheduleHealth({ target, now: '2026-07-15T02:00:00Z', schedule: { active: true, updated_at: '2026-07-15T00:00:00Z', next_run_at: '2026-07-15T01:00:00Z' }, pipeline: { source: 'schedule', ref: 'master', created_at: '2026-07-15T01:01:00Z', job: 'zj_loop_issue_triage', artifact: 'issue-recommendations.json', artifact_schema: 'zj-loop.issue_recommendations.v1', artifact_payload: { ...reportArtifact, side_effects: { ...reportArtifact.side_effects, comments: true } } } });
  assert.equal(result.status, 'artifact_schema_invalid');
  assert.deepEqual(result.artifact_errors, ['artifact.side_effects.comments']);
});

test('GitLab adapter reads schedule and latest scheduled pipeline without mutations', async () => {
  const calls = [];
  const result = await inspectGitLabScheduleHealth({ target, apiUrl: 'https://gitlab.example/api/v4', token: 'token', now: '2026-07-15T02:00:00Z', fetchImpl: async (url) => {
    calls.push(String(url));
    const body = String(url).includes('pipeline_schedules/957') ? { active: true, updated_at: '2026-07-15T00:00:00Z', next_run_at: '2026-07-15T01:00:00Z' } : [];
    return { ok: true, async json() { return body; } };
  } });
  assert.equal(result.status, 'execution_missing');
  assert.equal(result.audit.auth_source, 'injected');
  assert.deepEqual(result.next_steps[0].command.slice(-2), ['--api-url', 'https://gitlab.example/api/v4']);
  assert.equal(calls.length, 3);
});

test('GitLab adapter records the selected injected credential source without exposing its value', async () => {
  const result = await inspectGitLabScheduleHealth({
    target,
    apiUrl: 'https://gitlab.example/api/v4',
    token: 'secret-token',
    tokenSource: 'GITLAB_PRIVATE_TOKEN',
    now: '2026-07-15T02:00:00Z',
    fetchImpl: async () => ({ ok: false, async json() { return {}; } }),
  });

  assert.equal(result.status, 'configuration_missing');
  assert.equal(result.audit.auth_source, 'GITLAB_PRIVATE_TOKEN');
  assert.doesNotMatch(JSON.stringify(result), /secret-token/);
});

test('GitLab adapter validates the explicit job artifact schema', async () => {
  const result = await inspectGitLabScheduleHealth({ target, apiUrl: 'https://gitlab.example/api/v4', token: 'token', now: '2026-07-15T02:00:00Z', fetchImpl: async (url) => {
    const text = String(url);
    const body = text.includes('pipeline_schedules/957') ? { active: true, updated_at: '2026-07-15T00:00:00Z', next_run_at: '2026-07-15T01:00:00Z' } : text.includes('/pipelines?') ? [{ id: 42, source: 'schedule', ref: 'master', created_at: '2026-07-15T01:01:00Z' }] : text.includes('/pipelines/42/jobs') ? [{ id: 7, name: 'zj_loop_issue_triage' }] : reportArtifact;
    return { ok: true, async json() { return body; } };
  } });
  assert.equal(result.status, 'healthy');
});

test('GitLab schedule health records the infra provenance of a healthy read', async () => {
  const result = await inspectGitLabScheduleHealth({ target, apiUrl: 'https://gitlab.example/api/v4', token: 'token', now: '2026-07-15T02:00:00Z', fetchImpl: async (url) => {
    const text = String(url);
    const body = text.endsWith('/version')
      ? { version: '16.11.8', revision: 'abc123' }
      : text.includes('pipeline_schedules/957')
        ? { active: true, updated_at: '2026-07-15T00:00:00Z', next_run_at: '2026-07-15T01:00:00Z' }
        : text.includes('/pipelines?')
          ? [{ id: 42, source: 'schedule', ref: 'master', created_at: '2026-07-15T01:01:00Z' }]
          : text.includes('/pipelines/42/jobs')
            ? [{ id: 7, name: 'zj_loop_issue_triage' }]
            : reportArtifact;
    return { ok: true, async json() { return body; } };
  } });

  assert.equal(result.status, 'healthy');
  assert.deepEqual(result.audit.infra_provenance, {
    contract: 'zj-loop.gitlab-infra.v1',
    infra_version: '0.1.0',
    gitlab_version: '16.11.8',
    project_path: 'group/project',
    capabilities: ['schedule-read', 'pipeline-read', 'job-read', 'artifact-read'],
  });
});

test('GitLab adapter reads and validates Daily Triage supporting artifact from the same job', async () => {
  const result = await inspectGitLabScheduleHealth({
    target: dailyTarget,
    apiUrl: 'https://gitlab.example/api/v4',
    token: 'token',
    now: '2026-07-15T00:14:00Z',
    fetchImpl: async (url) => {
      const text = String(url);
      const body = text.includes('pipeline_schedules/962')
        ? { active: true, updated_at: '2026-07-15T00:00:00Z', next_run_at: '2026-07-15T01:00:00Z' }
        : text.includes('/pipelines?')
          ? [{ id: 43, source: 'schedule', ref: 'master', created_at: '2026-07-15T00:03:00Z' }]
          : text.includes('/pipelines/43/jobs')
            ? [{ id: 8, name: 'zj_loop_daily_triage' }]
            : text.includes('/artifacts/route-decision.json')
              ? dailyRouteDecision
              : dailyConsumerPlan;
      return { ok: true, async json() { return body; } };
    },
  });

  assert.equal(result.status, 'healthy');
  assert.equal(result.target.supporting_artifact_schema, 'zj-loop.consumer_run_plan.v1');
});

test('GitLab adapter reads and validates Dependency Sweeper supporting artifact from the same job', async () => {
  const result = await inspectGitLabScheduleHealth({
    target: dependencyTarget,
    apiUrl: 'https://gitlab.example/api/v4',
    token: 'token',
    now: '2026-07-15T00:14:00Z',
    fetchImpl: async (url) => {
      const text = String(url);
      const body = text.includes('pipeline_schedules/961')
        ? { active: true, updated_at: '2026-07-15T00:00:00Z', next_run_at: '2026-07-15T01:00:00Z' }
        : text.includes('/pipelines?')
          ? [{ id: 44, source: 'schedule', ref: 'master', created_at: '2026-07-15T00:03:00Z' }]
          : text.includes('/pipelines/44/jobs')
            ? [{ id: 9, name: 'zj_loop_dependency_sweeper' }]
            : text.includes('/artifacts/consumer-plan.json')
              ? dependencyConsumerPlan
              : dependencyRouteDecision;
      return { ok: true, async json() { return body; } };
    },
  });

  assert.equal(result.status, 'healthy');
  assert.equal(result.target.artifact, 'consumer-plan.json');
});

test('schedule health validates Changelog Drafter triple artifacts from one scheduled job', () => {
  const result = evaluateScheduleHealth({
    target: changelogTarget,
    now: '2026-07-15T00:14:00Z',
    schedule: { active: true, updated_at: '2026-07-15T00:00:00Z', next_run_at: '2026-07-15T01:00:00Z' },
    pipeline: {
      source: 'schedule', ref: 'master', created_at: '2026-07-15T00:03:00Z', job: 'zj_loop_changelog_drafter',
      artifact: 'gitlab-changelog-draft-evidence.json', artifact_schema: 'zj-loop.gitlab_changelog_draft_evidence.v1', artifact_payload: changelogEvidence,
      supporting_artifact: 'route-decision.json', supporting_artifact_schema: 'zj-loop.route_decision.v1', supporting_artifact_payload: changelogRouteDecision,
      supporting_artifact_2: 'consumer-plan.json', supporting_artifact_2_schema: 'zj-loop.consumer_run_plan.v1', supporting_artifact_2_payload: changelogConsumerPlan,
    },
  });

  assert.equal(result.status, 'healthy');
  assert.equal(result.target.supporting_artifact_2, 'consumer-plan.json');
});

test('schedule health rejects Changelog Drafter evidence with release side effects', () => {
  const result = evaluateScheduleHealth({
    target: changelogTarget,
    now: '2026-07-15T00:14:00Z',
    schedule: { active: true, updated_at: '2026-07-15T00:00:00Z', next_run_at: '2026-07-15T01:00:00Z' },
    pipeline: {
      source: 'schedule', ref: 'master', created_at: '2026-07-15T00:03:00Z', job: 'zj_loop_changelog_drafter',
      artifact: 'gitlab-changelog-draft-evidence.json', artifact_schema: 'zj-loop.gitlab_changelog_draft_evidence.v1', artifact_payload: { ...changelogEvidence, audit: { ...changelogEvidence.audit, side_effects_executed: true } },
      supporting_artifact: 'route-decision.json', supporting_artifact_schema: 'zj-loop.route_decision.v1', supporting_artifact_payload: changelogRouteDecision,
      supporting_artifact_2: 'consumer-plan.json', supporting_artifact_2_schema: 'zj-loop.consumer_run_plan.v1', supporting_artifact_2_payload: changelogConsumerPlan,
    },
  });

  assert.equal(result.status, 'artifact_schema_invalid');
  assert.deepEqual(result.artifact_errors, ['artifact.audit.side_effects_executed']);
});

test('GitLab adapter reads and validates Changelog Drafter second supporting artifact from the same job', async () => {
  const result = await inspectGitLabScheduleHealth({
    target: changelogTarget,
    apiUrl: 'https://gitlab.example/api/v4', token: 'token', now: '2026-07-15T00:14:00Z',
    fetchImpl: async (url) => {
      const text = String(url);
      const body = text.includes('pipeline_schedules/961')
        ? { active: true, updated_at: '2026-07-15T00:00:00Z', next_run_at: '2026-07-15T01:00:00Z' }
        : text.includes('/pipelines?') ? [{ id: 45, source: 'schedule', ref: 'master', created_at: '2026-07-15T00:03:00Z' }]
          : text.includes('/pipelines/45/jobs') ? [{ id: 10, name: 'zj_loop_changelog_drafter' }]
            : text.includes('/artifacts/gitlab-changelog-draft-evidence.json') ? changelogEvidence
              : text.includes('/artifacts/route-decision.json') ? changelogRouteDecision : changelogConsumerPlan;
      return { ok: true, async json() { return body; } };
    },
  });

  assert.equal(result.status, 'healthy');
  assert.equal(result.target.supporting_artifact_2_schema, 'zj-loop.consumer_run_plan.v1');
});
