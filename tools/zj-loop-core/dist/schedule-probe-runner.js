export const SCHEDULE_PROBE_CONFIRMATION = 'RUN_TEMPORARY_GITLAB_SCHEDULE_PROBE';
export function planGitLabScheduleProbe(input) {
    if (input.confirmation !== SCHEDULE_PROBE_CONFIRMATION) {
        return {
            schema: 'zj-loop.gitlab_schedule_probe.v1',
            status: 'refused',
            reason: 'confirmation-required',
            operations: [],
        };
    }
    const dueInMinutes = Number(input.dueInMinutes);
    if (!Number.isInteger(dueInMinutes) || dueInMinutes < 3 || dueInMinutes > 30) {
        return { schema: 'zj-loop.gitlab_schedule_probe.v1', status: 'refused', reason: 'due-in-minutes-invalid', operations: [] };
    }
    const now = new Date(input.now ?? Date.now());
    const due = new Date(now.getTime() + dueInMinutes * 60 * 1000);
    const timezone = String(input.timezone ?? 'UTC');
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(due);
    const value = (type) => parts.find((part) => part.type === type)?.value;
    const probeId = `probe-${now.toISOString().replace(/[-:.]/g, '').replace('Z', 'Z')}`;
    const marker = `zj-loop.schedule_probe.v1:${probeId}`;
    return {
        schema: 'zj-loop.gitlab_schedule_probe.v1',
        status: 'armed',
        probe_id: probeId,
        project: String(input.project),
        state_path: `zj-loop/schedule-probes/${probeId}.json`,
        deadline_at: new Date(due.getTime() + 10 * 60 * 1000).toISOString(),
        temporary_schedule: {
            description: marker,
            ref: String(input.ref ?? 'main'),
            cron: `${value('minute')} ${value('hour')} * * *`,
            cron_timezone: timezone,
        },
        operations: ['create-owned-schedule', 'poll-scheduled-pipeline', 'guarded-delete-owned-schedule'],
    };
}
export async function writeGitLabScheduleProbeState(input) {
    const relativePath = input.plan.state_path;
    const absolutePath = path.resolve(input.root ?? '.', relativePath);
    const record = { ...input.plan, updated_at: new Date().toISOString() };
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, `${JSON.stringify(record, null, 2)}\n`);
    return { path: relativePath, record };
}
export async function readGitLabScheduleProbeState(input) {
    const relativePath = `zj-loop/schedule-probes/${input.probeId}.json`;
    return JSON.parse(await readFile(path.resolve(input.root ?? '.', relativePath), 'utf8'));
}
export async function createGitLabOwnedSchedule(input) {
    const fetchImpl = input.fetchImpl ?? globalThis.fetch;
    const apiUrl = String(input.apiUrl ?? 'https://gitlab.com/api/v4').replace(/\/$/, '');
    const project = encodeURIComponent(input.plan.project ?? input.project);
    const response = await fetchImpl(`${apiUrl}/projects/${project}/pipeline_schedules`, {
        method: 'POST',
        headers: { 'PRIVATE-TOKEN': input.token, 'Content-Type': 'application/json' },
        body: JSON.stringify(input.plan.temporary_schedule),
    });
    if (!response.ok)
        throw new Error('gitlab-schedule-create-failed');
    const schedule = await response.json();
    return { ...input.plan, owned_schedule_id: schedule.id, status: 'created' };
}
export async function cleanupGitLabOwnedSchedule(input) {
    const fetchImpl = input.fetchImpl ?? globalThis.fetch;
    const apiUrl = String(input.apiUrl ?? 'https://gitlab.com/api/v4').replace(/\/$/, '');
    const project = encodeURIComponent(input.plan.project);
    const url = `${apiUrl}/projects/${project}/pipeline_schedules/${input.plan.owned_schedule_id}`;
    const headers = { 'PRIVATE-TOKEN': input.token };
    const currentResponse = await fetchImpl(url, { headers });
    if (!currentResponse.ok)
        return { ...input.plan, status: 'escalated', reason: 'owned-schedule-read-failed' };
    const current = await currentResponse.json();
    const expected = input.plan.temporary_schedule;
    if (current.description !== expected.description || current.ref !== expected.ref || current.cron !== expected.cron || current.cron_timezone !== expected.cron_timezone) {
        return { ...input.plan, status: 'escalated', reason: 'owned-schedule-identity-mismatch' };
    }
    const deleted = await fetchImpl(url, { method: 'DELETE', headers });
    if (!deleted.ok)
        return { ...input.plan, status: 'escalated', reason: 'owned-schedule-delete-failed' };
    return { ...input.plan, status: 'cleaned' };
}
export async function findGitLabOwnedSchedulePipeline(input) {
    const fetchImpl = input.fetchImpl ?? globalThis.fetch;
    const apiUrl = String(input.apiUrl ?? 'https://gitlab.com/api/v4').replace(/\/$/, '');
    const project = encodeURIComponent(input.project);
    const response = await fetchImpl(`${apiUrl}/projects/${project}/pipelines?source=schedule&per_page=20`, {
        headers: { 'PRIVATE-TOKEN': input.token },
    });
    if (!response.ok)
        throw new Error('gitlab-scheduled-pipeline-query-failed');
    const armedAt = new Date(input.armedAt).getTime();
    return (await response.json()).find((pipeline) => pipeline.source === 'schedule' && new Date(pipeline.created_at).getTime() >= armedAt) ?? null;
}
export async function runGitLabScheduleProbe(input) {
    const plan = planGitLabScheduleProbe(input);
    if (plan.status === 'refused')
        return plan;
    const created = await createGitLabOwnedSchedule({ ...input, plan });
    const armed = await writeGitLabScheduleProbeState({ root: input.root, plan: { ...created, armed_at: input.now ?? new Date().toISOString(), status: 'armed', poll_errors: 0 } });
    return await resumeGitLabScheduleProbe({ ...input, state: armed.record });
}
export async function resumeGitLabScheduleProbe(input) {
    const state = input.state ?? await readGitLabScheduleProbeState({ root: input.root, probeId: input.probeId });
    if (state.status === 'cleaned')
        return { ...state, status: 'refused', reason: 'probe-already-cleaned' };
    const now = input.nowFn ?? (() => new Date());
    const sleep = input.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    let pipeline = null;
    let pollErrors = Number(state.poll_errors ?? 0);
    while (now().getTime() < new Date(state.deadline_at).getTime()) {
        try {
            pipeline = await findGitLabOwnedSchedulePipeline({ ...input, project: state.project, armedAt: state.armed_at });
        }
        catch {
            pollErrors += 1;
        }
        if (pipeline)
            break;
        await sleep(input.pollIntervalMs ?? 30_000);
    }
    const cleaned = await cleanupGitLabOwnedSchedule({ ...input, plan: state });
    const result = cleaned.status === 'cleaned'
        ? { ...cleaned, status: pipeline ? 'completed' : 'escalated', poll_errors: pollErrors, ...(pipeline ? { pipeline } : { reason: 'scheduled-pipeline-missing' }) }
        : { ...cleaned, poll_errors: pollErrors };
    await writeGitLabScheduleProbeState({ root: input.root, plan: cleaned.status === 'cleaned' ? { ...result, status: 'cleaned', outcome: result.status } : result });
    return result;
}
export async function restoreGitLabScheduleProbe(input) {
    const state = await readGitLabScheduleProbeState({ root: input.root, probeId: input.probeId });
    if (state.status === 'cleaned')
        return { ...state, status: 'refused', reason: 'probe-already-cleaned' };
    const result = await cleanupGitLabOwnedSchedule({ ...input, plan: state });
    await writeGitLabScheduleProbeState({ root: input.root, plan: result.status === 'cleaned' ? { ...result, outcome: 'cleaned' } : result });
    return result;
}
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
