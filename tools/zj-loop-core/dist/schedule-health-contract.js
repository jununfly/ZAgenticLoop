import { CronExpressionParser } from 'cron-parser';
export const SCHEDULE_HEALTH_SCHEMA = 'zj-loop.schedule_health.v1';
export function evaluateScheduleHealth(input) {
    const target = input.target ?? {};
    const schedule = input.schedule;
    const now = new Date(input.now ?? Date.now());
    const graceMs = 10 * 60 * 1000;
    const expectedWindow = deriveExpectedWindow(schedule, now, input.expectedWithinMinutes);
    const base = { schema: SCHEDULE_HEALTH_SCHEMA, target: { provider: target.provider, project: target.project, route_id: target.route_id, schedule_id: target.schedule_id, job: target.job, artifact: target.artifact, artifact_schema: target.artifact_schema, ...(target.supporting_artifact ? { supporting_artifact: target.supporting_artifact } : {}), ...(target.supporting_artifact_schema ? { supporting_artifact_schema: target.supporting_artifact_schema } : {}) }, audit: { schedule_active: schedule?.active === true, schedule_updated_at: schedule?.updated_at ?? null, next_run_at: schedule?.next_run_at ?? null, expected_within_minutes: input.expectedWithinMinutes ?? null, checked_at: now.toISOString(), ...(input.audit ?? {}) } };
    if (!schedule || schedule.active !== true || !expectedWindow)
        return result(base, 'configuration_missing', 'schedule-configuration-missing');
    const pipeline = input.pipeline;
    const firstRunWindow = getFirstScheduledEvidenceWindow(schedule, pipeline, expectedWindow);
    const activeWindow = firstRunWindow ? { ...expectedWindow, start: firstRunWindow } : expectedWindow;
    if (now.getTime() < activeWindow.start.getTime() + graceMs)
        return { ...base, status: 'not_due', expected_window: { start: activeWindow.start.toISOString(), grace_minutes: 10 }, next_steps: [] };
    if (!pipeline || pipeline.source !== 'schedule' || new Date(pipeline.created_at).getTime() <= new Date(schedule.updated_at).getTime() || (!firstRunWindow && new Date(pipeline.created_at).getTime() < expectedWindow.start.getTime()))
        return result(base, 'execution_missing', 'scheduled-pipeline-missing');
    if (pipeline.job !== target.job || pipeline.artifact !== target.artifact)
        return result(base, 'artifact_missing', 'scheduled-artifact-missing');
    if (pipeline.artifact_schema !== target.artifact_schema)
        return result(base, 'artifact_schema_invalid', 'scheduled-artifact-schema-invalid');
    if (target.route_id === 'issue-backlog-triage') {
        const bindingErrors = validateIssueBacklogArtifact(target, pipeline);
        if (pipeline.ref !== 'master')
            bindingErrors.push('pipeline.ref');
        if (bindingErrors.length > 0)
            return { ...result(base, 'artifact_schema_invalid', 'scheduled-artifact-binding-invalid'), artifact_errors: bindingErrors };
    }
    if (target.route_id === 'daily-triage-report') {
        const bindingErrors = validateDailyTriageArtifacts(target, pipeline);
        if (pipeline.ref !== 'master')
            bindingErrors.push('pipeline.ref');
        if (bindingErrors.length > 0)
            return { ...result(base, 'artifact_schema_invalid', 'scheduled-artifact-binding-invalid'), artifact_errors: bindingErrors };
    }
    return {
        ...base,
        status: 'healthy',
        expected_window: {
            start: activeWindow.start.toISOString(),
            ...(activeWindow.nextStart ? { next_start: activeWindow.nextStart.toISOString() } : {}),
            grace_minutes: 10,
        },
        pipeline: { created_at: pipeline.created_at, source: pipeline.source },
        next_steps: [],
    };
}
function getFirstScheduledEvidenceWindow(schedule, pipeline, expectedWindow) {
    if (!pipeline || pipeline.source !== 'schedule' || typeof schedule?.updated_at !== 'string' || typeof pipeline.created_at !== 'string')
        return null;
    const updatedAt = new Date(schedule.updated_at);
    const createdAt = new Date(pipeline.created_at);
    if (Number.isNaN(updatedAt.getTime()) || Number.isNaN(createdAt.getTime()) || createdAt.getTime() <= updatedAt.getTime())
        return null;
    let firstWindowStart = expectedWindow.start;
    if (typeof schedule.cron === 'string') {
        try {
            firstWindowStart = CronExpressionParser.parse(schedule.cron, {
                currentDate: updatedAt,
                tz: schedule.cron_timezone ?? 'UTC',
            }).next().toDate();
        }
        catch {
            return null;
        }
    }
    if (createdAt.getTime() >= firstWindowStart.getTime())
        return null;
    return createdAt;
}
function validateIssueBacklogArtifact(target, pipeline) {
    const artifact = pipeline.artifact_payload;
    const errors = [];
    if (!artifact || typeof artifact !== 'object')
        return ['artifact_payload'];
    if (artifact.provider !== target.provider)
        errors.push('artifact.provider');
    if (artifact.project_path !== target.project)
        errors.push('artifact.project_path');
    if (artifact.route !== target.route_id)
        errors.push('artifact.route');
    if (artifact.source !== 'gitlab-issues-api')
        errors.push('artifact.source');
    const sideEffects = artifact.side_effects;
    for (const key of ['labels', 'comments', 'state', 'requests']) {
        if (!sideEffects || sideEffects[key] !== false)
            errors.push(`artifact.side_effects.${key}`);
    }
    return errors;
}
function validateDailyTriageArtifacts(target, pipeline) {
    const routeDecision = pipeline.artifact_payload;
    const consumerPlan = pipeline.supporting_artifact_payload;
    const errors = [];
    if (!target.supporting_artifact || !target.supporting_artifact_schema)
        errors.push('supporting-artifact-target');
    if (pipeline.artifact !== target.artifact)
        errors.push('artifact');
    if (pipeline.artifact_schema !== target.artifact_schema)
        errors.push('artifact_schema');
    if (pipeline.supporting_artifact !== target.supporting_artifact)
        errors.push('supporting_artifact');
    if (pipeline.supporting_artifact_schema !== target.supporting_artifact_schema)
        errors.push('supporting_artifact_schema');
    if (!routeDecision || typeof routeDecision !== 'object')
        errors.push('artifact_payload');
    if (!consumerPlan || typeof consumerPlan !== 'object')
        errors.push('supporting_artifact_payload');
    if (!routeDecision || routeDecision.schema !== 'zj-loop.route_decision.v1')
        errors.push('artifact.schema');
    if (!consumerPlan || consumerPlan.schema !== 'zj-loop.consumer_run_plan.v1')
        errors.push('supporting_artifact.schema');
    if (routeDecision?.route !== target.route_id)
        errors.push('artifact.route');
    if (routeDecision?.request_kind !== 'report-only')
        errors.push('artifact.request_kind');
    if (routeDecision?.target_consumer !== 'daily-triage')
        errors.push('artifact.target_consumer');
    if (routeDecision?.source !== 'gitlab-pipeline')
        errors.push('artifact.source');
    if (routeDecision?.allowed !== true)
        errors.push('artifact.allowed');
    if (consumerPlan?.route_id !== target.route_id)
        errors.push('supporting_artifact.route_id');
    if (consumerPlan?.consumer !== 'daily-triage')
        errors.push('supporting_artifact.consumer');
    if (consumerPlan?.execution_mode !== 'report-only')
        errors.push('supporting_artifact.execution_mode');
    if (consumerPlan?.request_kind !== 'report-only')
        errors.push('supporting_artifact.request_kind');
    if (consumerPlan?.status !== 'report-only')
        errors.push('supporting_artifact.status');
    if (consumerPlan?.execution_allowed !== false)
        errors.push('supporting_artifact.execution_allowed');
    if (consumerPlan?.validation?.valid !== true)
        errors.push('supporting_artifact.validation.valid');
    const nestedDecision = consumerPlan?.route_decision;
    if (!nestedDecision || JSON.stringify(nestedDecision) !== JSON.stringify(routeDecision))
        errors.push('supporting_artifact.route_decision');
    return errors;
}
function deriveExpectedWindow(schedule, now, expectedWithinMinutes) {
    if (!schedule)
        return null;
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
        }
        catch {
            return null;
        }
    }
    if (typeof schedule.next_run_at !== 'string')
        return null;
    const start = new Date(schedule.next_run_at);
    return Number.isNaN(start.getTime()) ? null : { start };
}
export async function inspectGitLabScheduleHealth(input) {
    const apiUrl = String(input.apiUrl ?? process.env.CI_API_V4_URL ?? 'https://gitlab.com/api/v4').replace(/\/$/, '');
    const credentials = resolveGitLabCredentials(input);
    if (!credentials)
        return result({ schema: SCHEDULE_HEALTH_SCHEMA, target: input.target, audit: { api_url: apiUrl, auth_source: null } }, 'configuration_missing', 'gitlab-token-missing');
    const fetchImpl = input.fetchImpl ?? globalThis.fetch;
    const project = encodeURIComponent(input.target.project);
    const headers = { 'PRIVATE-TOKEN': credentials.token };
    const [scheduleResponse, pipelinesResponse] = await Promise.all([
        fetchImpl(`${apiUrl}/projects/${project}/pipeline_schedules/${input.target.schedule_id}`, { headers }),
        fetchImpl(`${apiUrl}/projects/${project}/pipelines?source=schedule&per_page=20`, { headers }),
    ]);
    if (!scheduleResponse.ok || !pipelinesResponse.ok)
        return result({ schema: SCHEDULE_HEALTH_SCHEMA, target: input.target, audit: { api_url: apiUrl, auth_source: credentials.source } }, 'configuration_missing', 'gitlab-api-unavailable');
    const [schedule, pipelines] = await Promise.all([scheduleResponse.json(), pipelinesResponse.json()]);
    const pipeline = Array.isArray(pipelines) ? pipelines[0] : null;
    const audit = { api_url: apiUrl, auth_source: credentials.source };
    if (!pipeline)
        return evaluateScheduleHealth({ target: input.target, schedule, pipeline: null, now: input.now, audit, expectedWithinMinutes: input.expectedWithinMinutes });
    const jobsResponse = await fetchImpl(`${apiUrl}/projects/${project}/pipelines/${pipeline.id}/jobs`, { headers });
    if (!jobsResponse.ok)
        return result({ schema: SCHEDULE_HEALTH_SCHEMA, target: input.target, audit: { api_url: apiUrl, auth_source: credentials.source } }, 'artifact_missing', 'gitlab-job-query-failed');
    const job = (await jobsResponse.json()).find((candidate) => candidate.name === input.target.job);
    if (!job)
        return evaluateScheduleHealth({ target: input.target, schedule, pipeline: { ...pipeline, job: null }, now: input.now, audit, expectedWithinMinutes: input.expectedWithinMinutes });
    const artifactResponse = await fetchImpl(`${apiUrl}/projects/${project}/jobs/${job.id}/artifacts/${input.target.artifact}`, { headers });
    if (!artifactResponse.ok)
        return evaluateScheduleHealth({ target: input.target, schedule, pipeline: { ...pipeline, job: job.name, artifact: null }, now: input.now, audit, expectedWithinMinutes: input.expectedWithinMinutes });
    const artifact = await artifactResponse.json();
    if (input.target.supporting_artifact) {
        const supportingResponse = await fetchImpl(`${apiUrl}/projects/${project}/jobs/${job.id}/artifacts/${input.target.supporting_artifact}`, { headers });
        if (!supportingResponse.ok)
            return evaluateScheduleHealth({ target: input.target, schedule, pipeline: { ...pipeline, job: job.name, artifact: input.target.artifact, artifact_schema: artifact.schema, artifact_payload: artifact, supporting_artifact: null }, now: input.now, audit, expectedWithinMinutes: input.expectedWithinMinutes });
        const supportingArtifact = await supportingResponse.json();
        return evaluateScheduleHealth({ target: input.target, schedule, pipeline: { ...pipeline, job: job.name, artifact: input.target.artifact, artifact_schema: artifact.schema, artifact_payload: artifact, supporting_artifact: input.target.supporting_artifact, supporting_artifact_schema: supportingArtifact.schema, supporting_artifact_payload: supportingArtifact }, now: input.now, audit, expectedWithinMinutes: input.expectedWithinMinutes });
    }
    return evaluateScheduleHealth({ target: input.target, schedule, pipeline: { ...pipeline, job: job.name, artifact: input.target.artifact, artifact_schema: artifact.schema, artifact_payload: artifact }, now: input.now, audit, expectedWithinMinutes: input.expectedWithinMinutes });
}
function resolveGitLabCredentials(input) {
    if (typeof input.token === 'string' && input.token.length > 0) {
        return { token: input.token, source: input.tokenSource ?? 'injected' };
    }
    for (const source of ['GITLAB_TOKEN', 'GITLAB_PRIVATE_TOKEN', 'GLAB_TOKEN']) {
        const token = process.env[source];
        if (token)
            return { token, source };
    }
    return null;
}
function result(base, status, reason) {
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
function buildScheduleHealthReplayCommand(target, apiUrl, expectedWithinMinutes) {
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
    if (target.supporting_artifact)
        command.push('--supporting-artifact', String(target.supporting_artifact));
    if (target.supporting_artifact_schema)
        command.push('--supporting-artifact-schema', String(target.supporting_artifact_schema));
    if (apiUrl)
        command.push('--api-url', apiUrl);
    if (Number.isInteger(expectedWithinMinutes) && Number(expectedWithinMinutes) > 0) {
        command.push('--expected-within-minutes', String(expectedWithinMinutes));
    }
    return command;
}
