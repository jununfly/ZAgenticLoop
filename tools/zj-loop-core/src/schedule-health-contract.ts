import { CronExpressionParser } from 'cron-parser';

export const SCHEDULE_HEALTH_SCHEMA = 'zj-loop.schedule_health.v1';

export type ScheduleHealthStatus = 'healthy' | 'not_due' | 'configuration_missing' | 'execution_missing' | 'artifact_missing' | 'artifact_schema_invalid';

export function evaluateScheduleHealth(input: any) {
  const target = input.target ?? {};
  const schedule = input.schedule;
  const now = new Date(input.now ?? Date.now());
  const graceMs = 10 * 60 * 1000;
  const expectedWindow = deriveExpectedWindow(schedule, now, input.expectedWithinMinutes);
  const base = { schema: SCHEDULE_HEALTH_SCHEMA, target: { provider: target.provider, project: target.project, route_id: target.route_id, schedule_id: target.schedule_id, job: target.job, artifact: target.artifact, artifact_schema: target.artifact_schema }, audit: { schedule_active: schedule?.active === true, schedule_updated_at: schedule?.updated_at ?? null, next_run_at: schedule?.next_run_at ?? null, expected_within_minutes: input.expectedWithinMinutes ?? null, checked_at: now.toISOString(), ...(input.audit ?? {}) } };
  if (!schedule || schedule.active !== true || !expectedWindow) return result(base, 'configuration_missing', 'schedule-configuration-missing');
  if (now.getTime() < expectedWindow.start.getTime() + graceMs) return { ...base, status: 'not_due', expected_window: { start: expectedWindow.start.toISOString(), grace_minutes: 10 }, next_steps: [] };
  const pipeline = input.pipeline;
  if (!pipeline || pipeline.source !== 'schedule' || new Date(pipeline.created_at).getTime() < new Date(schedule.updated_at).getTime() || new Date(pipeline.created_at).getTime() < expectedWindow.start.getTime()) return result(base, 'execution_missing', 'scheduled-pipeline-missing');
  if (pipeline.job !== target.job || pipeline.artifact !== target.artifact) return result(base, 'artifact_missing', 'scheduled-artifact-missing');
  if (pipeline.artifact_schema !== target.artifact_schema) return result(base, 'artifact_schema_invalid', 'scheduled-artifact-schema-invalid');
  return {
    ...base,
    status: 'healthy',
    expected_window: {
      start: expectedWindow.start.toISOString(),
      ...(expectedWindow.nextStart ? { next_start: expectedWindow.nextStart.toISOString() } : {}),
      grace_minutes: 10,
    },
    pipeline: { created_at: pipeline.created_at, source: pipeline.source },
    next_steps: [],
  };
}

function deriveExpectedWindow(schedule: any, now: Date, expectedWithinMinutes?: unknown): { start: Date; nextStart?: Date } | null {
  if (!schedule) return null;
  if (Number.isInteger(expectedWithinMinutes) && Number(expectedWithinMinutes) > 0 && typeof schedule.updated_at === 'string') {
    const updatedAt = new Date(schedule.updated_at);
    if (!Number.isNaN(updatedAt.getTime())) {
      return { start: new Date(updatedAt.getTime() + Number(expectedWithinMinutes) * 60 * 1000) };
    }
  }
  if (typeof schedule.cron === 'string' && typeof schedule.updated_at === 'string') {
    try {
      const updatedExpression = CronExpressionParser.parse(schedule.cron, {
        currentDate: new Date(schedule.updated_at),
        tz: schedule.cron_timezone ?? 'UTC',
      });
      const firstStart = updatedExpression.next().toDate();
      if (now.getTime() < firstStart.getTime()) {
        return { start: firstStart, nextStart: updatedExpression.next().toDate() };
      }
      const currentExpression = CronExpressionParser.parse(schedule.cron, {
        currentDate: now,
        tz: schedule.cron_timezone ?? 'UTC',
      });
      const previousStart = currentExpression.prev().toDate();
      return {
        start: previousStart.getTime() >= firstStart.getTime() ? previousStart : firstStart,
        nextStart: currentExpression.next().toDate(),
      };
    } catch {
      return null;
    }
  }
  if (typeof schedule.next_run_at !== 'string') return null;
  const start = new Date(schedule.next_run_at);
  return Number.isNaN(start.getTime()) ? null : { start };
}

export async function inspectGitLabScheduleHealth(input: any) {
  const apiUrl = String(input.apiUrl ?? process.env.CI_API_V4_URL ?? 'https://gitlab.com/api/v4').replace(/\/$/, '');
  const credentials = resolveGitLabCredentials(input);
  if (!credentials) return result({ schema: SCHEDULE_HEALTH_SCHEMA, target: input.target, audit: { api_url: apiUrl, auth_source: null } }, 'configuration_missing', 'gitlab-token-missing');
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  const project = encodeURIComponent(input.target.project);
  const headers = { 'PRIVATE-TOKEN': credentials.token };
  const [scheduleResponse, pipelinesResponse] = await Promise.all([
    fetchImpl(`${apiUrl}/projects/${project}/pipeline_schedules/${input.target.schedule_id}`, { headers }),
    fetchImpl(`${apiUrl}/projects/${project}/pipelines?source=schedule&per_page=20`, { headers }),
  ]);
  if (!scheduleResponse.ok || !pipelinesResponse.ok) return result({ schema: SCHEDULE_HEALTH_SCHEMA, target: input.target, audit: { api_url: apiUrl, auth_source: credentials.source } }, 'configuration_missing', 'gitlab-api-unavailable');
  const [schedule, pipelines] = await Promise.all([scheduleResponse.json(), pipelinesResponse.json()]);
  const pipeline = Array.isArray(pipelines) ? pipelines[0] : null;
  const audit = { api_url: apiUrl, auth_source: credentials.source };
  if (!pipeline) return evaluateScheduleHealth({ target: input.target, schedule, pipeline: null, now: input.now, audit, expectedWithinMinutes: input.expectedWithinMinutes });
  const jobsResponse = await fetchImpl(`${apiUrl}/projects/${project}/pipelines/${pipeline.id}/jobs`, { headers });
  if (!jobsResponse.ok) return result({ schema: SCHEDULE_HEALTH_SCHEMA, target: input.target, audit: { api_url: apiUrl, auth_source: credentials.source } }, 'artifact_missing', 'gitlab-job-query-failed');
  const job = (await jobsResponse.json()).find((candidate: any) => candidate.name === input.target.job);
  if (!job) return evaluateScheduleHealth({ target: input.target, schedule, pipeline: { ...pipeline, job: null }, now: input.now, audit, expectedWithinMinutes: input.expectedWithinMinutes });
  const artifactResponse = await fetchImpl(`${apiUrl}/projects/${project}/jobs/${job.id}/artifacts/${input.target.artifact}`, { headers });
  if (!artifactResponse.ok) return evaluateScheduleHealth({ target: input.target, schedule, pipeline: { ...pipeline, job: job.name, artifact: null }, now: input.now, audit, expectedWithinMinutes: input.expectedWithinMinutes });
  const artifact = await artifactResponse.json();
  return evaluateScheduleHealth({ target: input.target, schedule, pipeline: { ...pipeline, job: job.name, artifact: input.target.artifact, artifact_schema: artifact.schema }, now: input.now, audit, expectedWithinMinutes: input.expectedWithinMinutes });
}

function resolveGitLabCredentials(input: any): { token: string; source: string } | null {
  if (typeof input.token === 'string' && input.token.length > 0) {
    return { token: input.token, source: input.tokenSource ?? 'injected' };
  }
  for (const source of ['GITLAB_TOKEN', 'GITLAB_PRIVATE_TOKEN', 'GLAB_TOKEN']) {
    const token = process.env[source];
    if (token) return { token, source };
  }
  return null;
}

function result(base: any, status: ScheduleHealthStatus, reason: string) {
  return {
    ...base,
    status,
    escalation: { reason, side_effects: false },
    next_steps: [{
      label: 'Inspect GitLab schedule health',
      command: buildScheduleHealthReplayCommand(base.target, base.audit?.api_url, base.audit?.expected_within_minutes),
    }],
  };
}

function buildScheduleHealthReplayCommand(target: any, apiUrl?: string, expectedWithinMinutes?: unknown): string[] {
  const command = [
    'zj-loop-doctor',
    '--provider', String(target.provider),
    '--schedule-health',
    '--project', String(target.project),
    '--route', String(target.route_id),
    '--schedule-id', String(target.schedule_id),
    '--job', String(target.job),
    '--artifact', String(target.artifact),
    '--artifact-schema', String(target.artifact_schema),
  ];
  if (apiUrl) command.push('--api-url', apiUrl);
  if (Number.isInteger(expectedWithinMinutes) && Number(expectedWithinMinutes) > 0) {
    command.push('--expected-within-minutes', String(expectedWithinMinutes));
  }
  return command;
}
