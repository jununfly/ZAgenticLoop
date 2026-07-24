import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import yaml from 'yaml';
import { buildRouteDecision, loadRouteTable } from './route.js';
export const GITLAB_ISSUE_NOTE_BRIDGE_CONSUMER_SCHEMA = 'zj-loop.gitlab_issue_note_bridge_consumer.v1';
export const GITLAB_PROJECT_REGISTRATION_SCHEMA = 'zj-loop.project-registration.v1';
export const GITLAB_ISSUE_NOTE_BRIDGE_CONSUMER_EXIT_CODES = {
    completed: 0,
    blocked: 2,
    uncertain: 3,
};
const REQUIRED_BRIDGE_VARIABLES = [
    'ZJ_LOOP_BRIDGE_EVENT_ID',
    'ZJ_LOOP_BRIDGE_DEDUPE_KEY',
    'ZJ_LOOP_BRIDGE_PROJECT_PATH',
    'ZJ_LOOP_BRIDGE_ISSUE_IID',
    'ZJ_LOOP_BRIDGE_NOTE_ID',
    'ZJ_LOOP_BRIDGE_TARGET_ROUTE',
    'ZJ_LOOP_BRIDGE_ENVELOPE_REF',
];
export async function runGitLabIssueNoteBridgeConsumer(input) {
    const env = input.env ?? process.env;
    const values = Object.fromEntries(REQUIRED_BRIDGE_VARIABLES.map((key) => [key, clean(env[key])]));
    const projectPath = values.ZJ_LOOP_BRIDGE_PROJECT_PATH ?? null;
    const targetRoute = values.ZJ_LOOP_BRIDGE_TARGET_ROUTE ?? null;
    const result = baseResult({ values, projectPath, targetRoute });
    if (clean(env.CI_PIPELINE_SOURCE) !== 'api')
        return blocked(result, 'pipeline-source-api-required');
    if (clean(env.CI_COMMIT_REF_NAME) !== 'master')
        return blocked(result, 'pipeline-ref-master-required');
    if (clean(env.CI_PROJECT_PATH) !== 'mlive-dev/ai-studio')
        return blocked(result, 'ci-project-mismatch');
    if (!projectPath || projectPath !== 'mlive-dev/ai-studio')
        return blocked(result, 'bridge-project-mismatch');
    if (!targetRoute || targetRoute !== 'roadmap-sliced-development')
        return blocked(result, 'bridge-route-mismatch');
    for (const key of REQUIRED_BRIDGE_VARIABLES) {
        if (!values[key])
            return blocked(result, `${key.toLowerCase()}-required`);
    }
    if (!positiveDecimal(values.ZJ_LOOP_BRIDGE_ISSUE_IID) || !positiveDecimal(values.ZJ_LOOP_BRIDGE_NOTE_ID)) {
        return blocked(result, 'bridge-issue-note-id-invalid');
    }
    const root = path.resolve(input.root ?? '.');
    const registrationPath = input.registrationPath ?? 'zj-loop/registrations/project.yaml';
    let registration;
    let registrationText;
    try {
        registrationText = await readFile(path.resolve(root, registrationPath), 'utf8');
        registration = yaml.parse(registrationText);
    }
    catch {
        return blocked(result, 'project-registration-required', { registrationPath });
    }
    const registrationCheck = validateRegistration(registration, projectPath, targetRoute);
    if (!registrationCheck.ok)
        return blocked(result, registrationCheck.reason, { registrationPath });
    const providerCheck = await rereadSourceBinding({ env, values, marker: registrationCheck.marker, fetchImpl: input.fetchImpl ?? fetch });
    if (!providerCheck.ok)
        return blocked(result, providerCheck.reason, { registrationPath });
    try {
        const table = await loadRouteTable(root);
        const decision = buildRouteDecision({
            table,
            selector: targetRoute,
            source: 'gitlab-issue-note',
            signalId: values.ZJ_LOOP_BRIDGE_EVENT_ID ?? undefined,
        });
        if (!decision.allowed)
            return blocked(result, 'route-not-enabled', { registrationPath });
    }
    catch {
        return blocked(result, 'route-table-invalid', { registrationPath });
    }
    return {
        ...result,
        status: 'completed',
        registration: {
            path: registrationPath,
            sha256: createHash('sha256').update(registrationText).digest('hex'),
            executor_kind: registrationCheck.executor.kind,
            executor_profile: registrationCheck.executor.profile,
        },
    };
}
function baseResult(input) {
    return {
        schema: GITLAB_ISSUE_NOTE_BRIDGE_CONSUMER_SCHEMA,
        status: 'blocked',
        project_path: input.projectPath,
        route_id: input.targetRoute,
        pipeline: { source: input.values.CI_PIPELINE_SOURCE, ref: input.values.CI_COMMIT_REF_NAME },
        binding: {
            event_id: input.values.ZJ_LOOP_BRIDGE_EVENT_ID,
            dedupe_key: input.values.ZJ_LOOP_BRIDGE_DEDUPE_KEY,
            issue_iid: input.values.ZJ_LOOP_BRIDGE_ISSUE_IID,
            note_id: input.values.ZJ_LOOP_BRIDGE_NOTE_ID,
            envelope_ref: input.values.ZJ_LOOP_BRIDGE_ENVELOPE_REF,
        },
        registration: {
            path: 'zj-loop/registrations/project.yaml',
            sha256: null,
            executor_kind: null,
            executor_profile: null,
        },
        artifacts: {
            route_decision: 'route-decision.json',
            consumer_plan: 'consumer-plan.json',
            result: 'bridge-consumer-result.json',
        },
        side_effects_executed: false,
    };
}
function blocked(result, reason, extra = {}) {
    return { ...result, status: 'blocked', reason, registration: { ...result.registration, path: extra.registrationPath ?? result.registration.path } };
}
function validateRegistration(registration, projectPath, routeId) {
    if (!registration || registration.schema !== GITLAB_PROJECT_REGISTRATION_SCHEMA)
        return { ok: false, reason: 'project-registration-schema-invalid' };
    if (registration.project_path !== projectPath)
        return { ok: false, reason: 'registration-project-mismatch' };
    if (registration.default_branch !== 'master')
        return { ok: false, reason: 'registration-default-branch-mismatch' };
    const route = registration.routes?.find((candidate) => candidate.route_id === routeId);
    if (!route)
        return { ok: false, reason: 'registration-route-missing' };
    if (typeof route.marker !== 'string' || !route.marker.trim())
        return { ok: false, reason: 'registration-marker-required' };
    const executor = route.default_executor;
    if (executor?.kind !== 'gitlab-pipeline' || executor.profile !== 'ai-studio-master-pipeline')
        return { ok: false, reason: 'registration-default-executor-mismatch' };
    const allowed = route.allowed_executors?.some((candidate) => candidate.kind === executor.kind && candidate.profile === executor.profile);
    if (!allowed)
        return { ok: false, reason: 'registration-executor-not-allowlisted' };
    const allowedInitiators = registration.initiators?.pipeline_request?.allowed_gitlab_user_ids;
    if (!Array.isArray(allowedInitiators) || !allowedInitiators.includes(81))
        return { ok: false, reason: 'registration-initiator-allowlist-missing' };
    return { ok: true, executor: { kind: String(executor.kind), profile: String(executor.profile) }, marker: route.marker };
}
async function rereadSourceBinding(input) {
    const token = clean(input.env.CI_JOB_TOKEN);
    if (!token)
        return { ok: false, reason: 'gitlab-read-token-required' };
    const apiUrl = clean(input.env.CI_API_V4_URL) ?? 'https://git.bilibili.co/api/v4';
    const projectPath = input.values.ZJ_LOOP_BRIDGE_PROJECT_PATH;
    const issueIid = input.values.ZJ_LOOP_BRIDGE_ISSUE_IID;
    const noteId = input.values.ZJ_LOOP_BRIDGE_NOTE_ID;
    const headers = { 'JOB-TOKEN': token };
    try {
        const projectResponse = await input.fetchImpl(`${apiUrl.replace(/\/+$/, '')}/projects/${encodeURIComponent(projectPath)}`, { headers });
        if (projectResponse.status !== 200)
            return { ok: false, reason: 'gitlab-read-capability-blocked' };
        const project = await projectResponse.json();
        if (project.path_with_namespace !== projectPath)
            return { ok: false, reason: 'gitlab-project-reread-mismatch' };
        const noteResponse = await input.fetchImpl(`${apiUrl.replace(/\/+$/, '')}/projects/${encodeURIComponent(projectPath)}/issues/${issueIid}/notes/${noteId}`, { headers });
        if (noteResponse.status !== 200)
            return { ok: false, reason: 'gitlab-note-reread-unavailable' };
        const note = await noteResponse.json();
        if (String(note.id) !== noteId || String(note.noteable_iid) !== issueIid || note.noteable_type !== 'Issue' || note.system === true)
            return { ok: false, reason: 'gitlab-note-binding-mismatch' };
        if (typeof note.body !== 'string' || !note.body.includes(input.marker) || Number(note.author?.id) !== 81)
            return { ok: false, reason: 'gitlab-note-request-mismatch' };
        return { ok: true };
    }
    catch {
        return { ok: false, reason: 'gitlab-read-request-failed' };
    }
}
function clean(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}
function positiveDecimal(value) {
    return value !== null && /^\d+$/.test(value) && Number(value) > 0 && Number.isSafeInteger(Number(value));
}
