export const SCHEDULE_PROBE_CONFIRMATION = 'RUN_TEMPORARY_GITLAB_SCHEDULE_PROBE';

export function planGitLabScheduleProbe(input: any) {
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
  const value = (type: string) => parts.find((part) => part.type === type)?.value;
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
      variables: [{ key: 'ZJ_LOOP_SCHEDULE_PROBE_ID', value: probeId, variable_type: 'env_var' }],
    },
    operations: ['create-owned-schedule', 'poll-scheduled-pipeline', 'guarded-delete-owned-schedule'],
  };
}

export async function writeGitLabScheduleProbeState(input: { root?: string; plan: any }) {
  const relativePath = input.plan.state_path;
  const absolutePath = path.resolve(input.root ?? '.', relativePath);
  const record = { ...input.plan, updated_at: new Date().toISOString() };
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(record, null, 2)}\n`);
  return { path: relativePath, record };
}

export async function readGitLabScheduleProbeState(input: { root?: string; probeId: string }) {
  const relativePath = `zj-loop/schedule-probes/${input.probeId}.json`;
  return JSON.parse(await readFile(path.resolve(input.root ?? '.', relativePath), 'utf8'));
}

export async function createGitLabOwnedSchedule(input: any) {
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  const apiUrl = String(input.apiUrl ?? 'https://gitlab.com/api/v4').replace(/\/$/, '');
  const project = encodeURIComponent(input.plan.project ?? input.project);
  const response = await fetchImpl(`${apiUrl}/projects/${project}/pipeline_schedules`, {
    method: 'POST',
    headers: { 'PRIVATE-TOKEN': input.token, 'Content-Type': 'application/json' },
    body: JSON.stringify(input.plan.temporary_schedule),
  });
  if (!response.ok) throw new Error('gitlab-schedule-create-failed');
  const schedule = await response.json();
  const created = { ...input.plan, owned_schedule_id: schedule.id, status: 'created' };
  const verified = await fetchImpl(`${apiUrl}/projects/${project}/pipeline_schedules/${schedule.id}`, {
    headers: { 'PRIVATE-TOKEN': input.token },
  });
  if (!verified.ok) return { ...created, status: 'escalated', reason: 'owned-schedule-read-failed' };
  return ownedScheduleMatches(created.temporary_schedule, await verified.json())
    ? created
    : { ...created, status: 'escalated', reason: 'owned-schedule-identity-mismatch' };
}

function ownedScheduleMatches(expected: any, current: any) {
  const expectedProbe = expected.variables?.find((variable: any) => variable.key === 'ZJ_LOOP_SCHEDULE_PROBE_ID');
  const currentProbe = current.variables?.find((variable: any) => variable.key === 'ZJ_LOOP_SCHEDULE_PROBE_ID');
  return current.description === expected.description
    && current.ref === expected.ref
    && current.cron === expected.cron
    && current.cron_timezone === expected.cron_timezone
    && currentProbe?.value === expectedProbe?.value
    && currentProbe?.variable_type === expectedProbe?.variable_type;
}

export async function cleanupGitLabOwnedSchedule(input: any) {
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  const apiUrl = String(input.apiUrl ?? 'https://gitlab.com/api/v4').replace(/\/$/, '');
  const project = encodeURIComponent(input.plan.project);
  const url = `${apiUrl}/projects/${project}/pipeline_schedules/${input.plan.owned_schedule_id}`;
  const headers = { 'PRIVATE-TOKEN': input.token };
  const currentResponse = await fetchImpl(url, { headers });
  if (!currentResponse.ok) return { ...input.plan, status: 'escalated', reason: 'owned-schedule-read-failed' };
  const current = await currentResponse.json();
  const expected = input.plan.temporary_schedule;
  if (!ownedScheduleMatches(expected, current)) {
    return { ...input.plan, status: 'escalated', reason: 'owned-schedule-identity-mismatch' };
  }
  const deleted = await fetchImpl(url, { method: 'DELETE', headers });
  if (!deleted.ok) return { ...input.plan, status: 'escalated', reason: 'owned-schedule-delete-failed' };
  return { ...input.plan, status: 'cleaned' };
}

export async function readGitLabOwnedSchedulePipeline(input: any) {
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  const apiUrl = String(input.apiUrl ?? 'https://gitlab.com/api/v4').replace(/\/$/, '');
  const project = encodeURIComponent(input.plan.project);
  const headers = { 'PRIVATE-TOKEN': input.token };
  const scheduleResponse = await fetchImpl(`${apiUrl}/projects/${project}/pipeline_schedules/${input.plan.owned_schedule_id}`, {
    headers,
  });
  if (!scheduleResponse.ok) throw new Error('gitlab-owned-schedule-read-failed');
  const schedule = await scheduleResponse.json();
  const pipelineId = schedule.last_pipeline?.id;
  if (!pipelineId) return { status: 'missing' };
  const response = await fetchImpl(`${apiUrl}/projects/${project}/pipelines/${pipelineId}`, {
    headers: { 'PRIVATE-TOKEN': input.token },
  });
  if (!response.ok) throw new Error('gitlab-owned-schedule-pipeline-read-failed');
  const pipeline = await response.json();
  if (pipeline.source !== 'schedule') return { status: 'invalid', reason: 'owned-schedule-pipeline-source-mismatch' };
  if (pipeline.ref !== input.plan.temporary_schedule.ref) return { status: 'invalid', reason: 'owned-schedule-pipeline-ref-mismatch' };
  if (new Date(pipeline.created_at).getTime() < new Date(input.plan.armed_at).getTime()) {
    return { status: 'invalid', reason: 'owned-schedule-pipeline-before-arm' };
  }
  return { status: 'found', pipeline };
}

export async function readGitLabScheduleProbeReceipt(input: any) {
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  const apiUrl = String(input.apiUrl ?? 'https://gitlab.com/api/v4').replace(/\/$/, '');
  const project = encodeURIComponent(input.plan.project);
  const headers = { 'PRIVATE-TOKEN': input.token };
  const jobsResponse = await fetchImpl(`${apiUrl}/projects/${project}/pipelines/${input.pipeline.id}/jobs?per_page=100`, { headers });
  if (!jobsResponse.ok) throw new Error('gitlab-schedule-probe-receipt-job-read-failed');
  const job = (await jobsResponse.json()).find((candidate: any) => candidate.name === 'zj_loop_schedule_probe_receipt');
  if (!job || !['success', 'failed', 'canceled'].includes(job.status)) return { status: 'missing' };
  if (job.status !== 'success') return { status: 'invalid', reason: `schedule-probe-receipt-job-${job.status}` };
  const artifactResponse = await fetchImpl(`${apiUrl}/projects/${project}/jobs/${job.id}/artifacts/schedule-probe-receipt.json`, { headers });
  if (!artifactResponse.ok) return { status: 'missing' };
  let receipt: any;
  try { receipt = JSON.parse(await artifactResponse.text()); } catch { return { status: 'invalid', reason: 'schedule-probe-receipt-json-invalid' }; }
  if (receipt.schema !== 'zj-loop.gitlab_schedule_probe_receipt.v1') return { status: 'invalid', reason: 'schedule-probe-receipt-schema-mismatch' };
  if (receipt.probe_id !== input.plan.probe_id) return { status: 'invalid', reason: 'schedule-probe-receipt-probe-id-mismatch' };
  if (String(receipt.pipeline_id) !== String(input.pipeline.id)) return { status: 'invalid', reason: 'schedule-probe-receipt-pipeline-id-mismatch' };
  if (receipt.project !== input.plan.project) return { status: 'invalid', reason: 'schedule-probe-receipt-project-mismatch' };
  if (receipt.ref !== input.plan.temporary_schedule.ref) return { status: 'invalid', reason: 'schedule-probe-receipt-ref-mismatch' };
  if (receipt.source !== 'schedule') return { status: 'invalid', reason: 'schedule-probe-receipt-source-mismatch' };
  return { status: 'found', receipt, job_id: job.id };
}

export async function runGitLabScheduleProbe(input: any) {
  const plan = planGitLabScheduleProbe(input);
  if (plan.status === 'refused') return plan;
  if (input.signal?.aborted) return { ...plan, status: 'interrupted', reason: 'signal-received' };
  const created = await createGitLabOwnedSchedule({ ...input, plan });
  if (created.status !== 'created') {
    await writeGitLabScheduleProbeState({ root: input.root, plan: created });
    return created;
  }
  const armed = await writeGitLabScheduleProbeState({ root: input.root, plan: { ...created, armed_at: input.now ?? new Date().toISOString(), status: 'armed', poll_errors: 0 } });
  await input.onArmed?.(armed.record);
  return await resumeGitLabScheduleProbe({ ...input, state: armed.record });
}

export async function resumeGitLabScheduleProbe(input: any) {
  const state = input.state ?? await readGitLabScheduleProbeState({ root: input.root, probeId: input.probeId });
  if (state.status === 'cleaned') return { ...state, status: 'refused', reason: 'probe-already-cleaned' };
  const now = input.nowFn ?? (() => new Date());
  const sleep = input.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const waitForNextPoll = async (milliseconds: number) => {
    if (!input.signal) return sleep(milliseconds);
    if (input.signal.aborted) return;
    await Promise.race([
      sleep(milliseconds),
      new Promise<void>((resolve) => input.signal.addEventListener('abort', resolve, { once: true })),
    ]);
  };
  let pipeline = null;
  let receipt = null;
  let pollErrors = Number(state.poll_errors ?? 0);
  let terminalReason: string | undefined;
  while (now().getTime() < new Date(state.deadline_at).getTime()) {
    if (input.signal?.aborted) return { ...state, status: 'interrupted', reason: 'signal-received', poll_errors: pollErrors };
    try {
      const observed = await readGitLabOwnedSchedulePipeline({ ...input, plan: state });
      if (observed.status === 'found') pipeline = observed.pipeline;
      if (observed.status === 'invalid') terminalReason = observed.reason;
      if (pipeline) {
        const observedReceipt = await readGitLabScheduleProbeReceipt({ ...input, plan: state, pipeline });
        if (observedReceipt.status === 'found') receipt = observedReceipt.receipt;
        if (observedReceipt.status === 'invalid') terminalReason = observedReceipt.reason;
      }
    } catch { pollErrors += 1; }
    if (receipt) break;
    if (terminalReason) break;
    await waitForNextPoll(input.pollIntervalMs ?? 30_000);
  }
  if (input.signal?.aborted) return { ...state, status: 'interrupted', reason: 'signal-received', poll_errors: pollErrors };
  const cleaned = await cleanupGitLabOwnedSchedule({ ...input, plan: state });
  const result = cleaned.status === 'cleaned'
    ? { ...cleaned, status: receipt ? 'completed' : 'escalated', poll_errors: pollErrors, ...(receipt ? { pipeline, receipt } : { reason: terminalReason ?? (pipeline ? 'schedule-probe-receipt-missing' : 'scheduled-pipeline-missing') }) }
    : { ...cleaned, poll_errors: pollErrors };
  await writeGitLabScheduleProbeState({ root: input.root, plan: cleaned.status === 'cleaned' ? { ...result, status: 'cleaned', outcome: result.status, cleanup_outcome: 'cleaned' } : result });
  return result;
}

export async function restoreGitLabScheduleProbe(input: any) {
  const state = await readGitLabScheduleProbeState({ root: input.root, probeId: input.probeId });
  if (state.status === 'cleaned') return { ...state, status: 'refused', reason: 'probe-already-cleaned' };
  const result = await cleanupGitLabOwnedSchedule({ ...input, plan: state });
  await writeGitLabScheduleProbeState({ root: input.root, plan: result.status === 'cleaned' ? { ...result, outcome: 'cleaned', cleanup_outcome: 'cleaned' } : result });
  return result;
}
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
