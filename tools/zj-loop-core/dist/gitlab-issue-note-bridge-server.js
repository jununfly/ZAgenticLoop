import { createServer } from 'node:http';
import { buildGitLabIssueNoteBridgeEnvelope } from './gitlab-issue-note-bridge.js';
import { persistGitLabIssueNoteBridgeReceipt, updateGitLabIssueNoteBridgeReceipt } from './gitlab-issue-note-bridge-receipts.js';
import { triggerGitLabIssueNoteBridgePipeline } from './gitlab-issue-note-bridge-trigger.js';
import { buildAgentLocalHandoff, parseAgentExecutionRequest, persistAgentLocalHandoff } from './agent-local-bridge.js';
import { createGitLabStateBranchClient } from './agent-local.js';
export const GITLAB_ISSUE_NOTE_BRIDGE_HTTP_SCHEMA = 'zj-loop.gitlab_issue_note_bridge_http.v1';
export const GITLAB_ISSUE_NOTE_BRIDGE_HTTP_PATH = '/gitlab/webhook/issue-note';
export const GITLAB_ISSUE_NOTE_BRIDGE_HEALTH_PATH = '/healthz';
export function createGitLabIssueNoteBridgeServer(config) {
    const webhookPath = normalizeWebhookPath(config.webhookPath ?? GITLAB_ISSUE_NOTE_BRIDGE_HTTP_PATH);
    return createServer(async (request, response) => {
        if (request.method === 'GET' && request.url === GITLAB_ISSUE_NOTE_BRIDGE_HEALTH_PATH) {
            writeJson(response, 200, { schema: 'zj-loop.gitlab_issue_note_bridge_health.v1', status: 'ok', side_effects_executed: false });
            return;
        }
        if (request.method !== 'POST' || request.url !== webhookPath) {
            writeJson(response, 404, { schema: GITLAB_ISSUE_NOTE_BRIDGE_HTTP_SCHEMA, status: 'blocked', reason: 'endpoint-not-found', side_effects_executed: false });
            return;
        }
        let body;
        try {
            body = await readBody(request, config.maxBodyBytes ?? 1024 * 1024);
        }
        catch (error) {
            writeJson(response, 413, { schema: GITLAB_ISSUE_NOTE_BRIDGE_HTTP_SCHEMA, status: 'blocked', reason: error?.message === 'request-body-too-large' ? error.message : 'request-body-invalid', side_effects_executed: false });
            return;
        }
        let payload;
        try {
            payload = JSON.parse(body);
        }
        catch {
            writeJson(response, 400, { schema: GITLAB_ISSUE_NOTE_BRIDGE_HTTP_SCHEMA, status: 'blocked', reason: 'request-json-invalid', side_effects_executed: false });
            return;
        }
        const now = config.now?.() ?? new Date().toISOString();
        const decision = buildGitLabIssueNoteBridgeEnvelope({
            headers: {
                event: header(request, 'x-gitlab-event'),
                eventId: header(request, 'x-gitlab-event-uuid'),
                webhookSecret: header(request, 'x-gitlab-token'),
            },
            payload,
            projectPath: config.projectPath,
            expectedProjectPath: config.projectPath,
            expectedWebhookSecret: config.webhookSecret,
            route: config.route,
            receivedAt: now,
        });
        if (decision.status !== 'accepted' || !decision.envelope) {
            writeJson(response, decision.status === 'blocked' ? 400 : 200, { ...decision, schema: GITLAB_ISSUE_NOTE_BRIDGE_HTTP_SCHEMA });
            return;
        }
        const note = noteText(payload);
        let agentRequest = null;
        try {
            agentRequest = parseAgentExecutionRequest(note, config.route.marker);
        }
        catch (error) {
            writeJson(response, 400, { schema: GITLAB_ISSUE_NOTE_BRIDGE_HTTP_SCHEMA, status: 'blocked', reason: error instanceof Error ? error.message : 'agent-execution-request-invalid', side_effects_executed: false });
            return;
        }
        if (agentRequest) {
            if (!config.agentLocal) {
                writeJson(response, 400, { schema: GITLAB_ISSUE_NOTE_BRIDGE_HTTP_SCHEMA, status: 'blocked', reason: 'agent-local-not-configured', side_effects_executed: false });
                return;
            }
            try {
                const resolved = config.agentLocal.resolveRegistration
                    ? await config.agentLocal.resolveRegistration(agentRequest)
                    : await resolveRegistration({ apiBaseUrl: config.apiBaseUrl, projectPath: config.projectPath, token: config.agentLocal.stateToken, request: agentRequest, fetchImpl: config.fetchImpl });
                if (!config.agentLocal.stateClient && !config.agentLocal.stateToken)
                    throw new Error('agent-local-state-token-required');
                const stateClient = config.agentLocal.stateClient ?? createGitLabStateBranchClient({ apiBaseUrl: config.apiBaseUrl ?? 'https://gitlab.com/api/v4', projectPath: config.projectPath, token: config.agentLocal.stateToken ?? '', fetchImpl: config.fetchImpl });
                const handoff = buildAgentLocalHandoff({ envelope: decision.envelope, request: agentRequest, registrationText: resolved.text, registrationCommit: resolved.commit, workspaceBaseCommit: resolved.baseCommit, now });
                const persisted = await persistGitLabIssueNoteBridgeReceipt({ root: config.root, envelope: decision.envelope, routeId: config.triggerConfig.routeId, now });
                if (persisted.status === 'event-id-collision' || persisted.status === 'receipt-persistence-failed') {
                    writeJson(response, 409, { schema: GITLAB_ISSUE_NOTE_BRIDGE_HTTP_SCHEMA, status: 'blocked', reason: persisted.status, side_effects_executed: false, receipt: { path: persisted.receipt_path, status: persisted.receipt.status } });
                    return;
                }
                if (persisted.status === 'duplicate') {
                    writeJson(response, 200, { schema: GITLAB_ISSUE_NOTE_BRIDGE_HTTP_SCHEMA, status: 'duplicate', reason: 'receipt-dedupe-hit', side_effects_executed: false, receipt: { path: persisted.receipt_path, status: persisted.receipt.status }, dedupe: { path: persisted.dedupe_path, status: persisted.dedupe.status } });
                    return;
                }
                await updateGitLabIssueNoteBridgeReceipt({ root: config.root, projectPath: decision.envelope.project_path, eventId: decision.envelope.event_id, dedupeKey: decision.envelope.dedupe_key, status: 'trigger-pending', now });
                const trigger = await triggerGitLabIssueNoteBridgePipeline({ config: config.triggerConfig, envelope: decision.envelope, envelopeRef: persisted.receipt_path, activationRequestId: handoff.request_id, token: config.triggerToken, apiBaseUrl: config.apiBaseUrl, fetchImpl: config.fetchImpl });
                if (trigger.status !== 'triggered') {
                    await updateGitLabIssueNoteBridgeReceipt({ root: config.root, projectPath: decision.envelope.project_path, eventId: decision.envelope.event_id, dedupeKey: decision.envelope.dedupe_key, status: trigger.status === 'uncertain' ? 'trigger-uncertain' : 'trigger-failed', now, recoveryReason: trigger.reason });
                    writeJson(response, 502, { schema: GITLAB_ISSUE_NOTE_BRIDGE_HTTP_SCHEMA, status: trigger.status, side_effects_executed: trigger.side_effects_executed, receipt: { path: persisted.receipt_path, status: trigger.status === 'uncertain' ? 'trigger-uncertain' : 'trigger-failed' }, trigger });
                    return;
                }
                const result = await persistAgentLocalHandoff({ client: stateClient, handoff });
                await updateGitLabIssueNoteBridgeReceipt({ root: config.root, projectPath: decision.envelope.project_path, eventId: decision.envelope.event_id, dedupeKey: decision.envelope.dedupe_key, status: 'triggered', now, triggerPipelineId: trigger.pipeline?.id ?? null });
                writeJson(response, result.status === 'blocked' ? 502 : 202, { schema: GITLAB_ISSUE_NOTE_BRIDGE_HTTP_SCHEMA, status: result.status === 'created' ? 'handoff-created' : result.status, side_effects_executed: result.side_effects_executed || trigger.side_effects_executed, handoff: result.handoff ? { id: result.handoff.handoff_id, status: result.handoff.status } : null, state_commit_id: result.state_commit_id, trigger, reason: result.reason });
            }
            catch (error) {
                writeJson(response, 400, { schema: GITLAB_ISSUE_NOTE_BRIDGE_HTTP_SCHEMA, status: 'blocked', reason: error instanceof Error ? error.message : 'agent-local-handoff-invalid', side_effects_executed: false });
            }
            return;
        }
        const persisted = await persistGitLabIssueNoteBridgeReceipt({ root: config.root, envelope: decision.envelope, routeId: config.triggerConfig.routeId, now });
        if (persisted.status === 'event-id-collision' || persisted.status === 'receipt-persistence-failed') {
            writeJson(response, 409, { schema: GITLAB_ISSUE_NOTE_BRIDGE_HTTP_SCHEMA, status: 'blocked', reason: persisted.status, side_effects_executed: false, receipt: { path: persisted.receipt_path, status: persisted.receipt.status } });
            return;
        }
        if (persisted.status === 'duplicate') {
            writeJson(response, 200, { schema: GITLAB_ISSUE_NOTE_BRIDGE_HTTP_SCHEMA, status: 'duplicate', reason: 'receipt-dedupe-hit', side_effects_executed: false, receipt: { path: persisted.receipt_path, status: persisted.receipt.status }, dedupe: { path: persisted.dedupe_path, status: persisted.dedupe.status } });
            return;
        }
        await updateGitLabIssueNoteBridgeReceipt({ root: config.root, projectPath: decision.envelope.project_path, eventId: decision.envelope.event_id, dedupeKey: decision.envelope.dedupe_key, status: 'trigger-pending', now });
        const trigger = await triggerGitLabIssueNoteBridgePipeline({ config: config.triggerConfig, envelope: decision.envelope, envelopeRef: persisted.receipt_path, token: config.triggerToken, apiBaseUrl: config.apiBaseUrl, fetchImpl: config.fetchImpl });
        const finalStatus = trigger.status === 'triggered' ? 'triggered' : trigger.status === 'uncertain' ? 'trigger-uncertain' : trigger.status === 'failed' ? 'trigger-failed' : 'trigger-failed';
        await updateGitLabIssueNoteBridgeReceipt({ root: config.root, projectPath: decision.envelope.project_path, eventId: decision.envelope.event_id, dedupeKey: decision.envelope.dedupe_key, status: finalStatus, now, triggerPipelineId: trigger.pipeline?.id ?? null, recoveryReason: trigger.reason });
        writeJson(response, trigger.status === 'triggered' ? 202 : 502, { schema: GITLAB_ISSUE_NOTE_BRIDGE_HTTP_SCHEMA, status: trigger.status, side_effects_executed: trigger.side_effects_executed, receipt: { path: persisted.receipt_path, status: finalStatus }, trigger });
    });
}
function normalizeWebhookPath(value) {
    const path = value.trim();
    if (!path.startsWith('/') || path.length < 2 || path.includes('?') || path.includes('#') || path.includes('..')) {
        throw new Error('webhook-path-invalid');
    }
    return path;
}
function header(request, name) {
    const value = request.headers[name];
    return Array.isArray(value) ? value[0] : value;
}
function noteText(payload) {
    const value = payload?.object_attributes?.note;
    return typeof value === 'string' ? value : '';
}
async function resolveRegistration(input) {
    if (!input.token)
        throw new Error('agent-local-state-token-required');
    const fetchImpl = input.fetchImpl ?? fetch;
    const base = (input.apiBaseUrl ?? 'https://gitlab.com/api/v4').replace(/\/+$/, '');
    const project = encodeURIComponent(input.projectPath);
    const headers = { 'PRIVATE-TOKEN': input.token };
    const registrationResponse = await fetchImpl(`${base}/projects/${project}/repository/files/${encodeURIComponent(input.request.registration.path)}?ref=${encodeURIComponent(input.request.registration.ref)}`, { headers });
    if (!registrationResponse.ok)
        throw new Error(`registration-fetch-${registrationResponse.status}`);
    const registrationBody = await registrationResponse.json();
    if (registrationBody.encoding !== 'base64' || typeof registrationBody.content !== 'string' || registrationBody.ref !== input.request.registration.ref)
        throw new Error('registration-response-invalid');
    const branchResponse = await fetchImpl(`${base}/projects/${project}/repository/branches/master`, { headers });
    if (!branchResponse.ok)
        throw new Error(`workspace-base-fetch-${branchResponse.status}`);
    const branchBody = await branchResponse.json();
    if (typeof branchBody.commit?.id !== 'string')
        throw new Error('workspace-base-invalid');
    return { text: Buffer.from(registrationBody.content, 'base64').toString('utf8'), commit: input.request.registration.ref, baseCommit: branchBody.commit.id };
}
function readBody(request, maxBytes) {
    return new Promise((resolve, reject) => {
        let body = '';
        let size = 0;
        request.setEncoding('utf8');
        request.on('data', (chunk) => {
            size += Buffer.byteLength(chunk);
            if (size > maxBytes) {
                reject(new Error('request-body-too-large'));
                request.destroy();
                return;
            }
            body += chunk;
        });
        request.on('end', () => resolve(body));
        request.on('error', reject);
    });
}
function writeJson(response, statusCode, value) {
    response.statusCode = statusCode;
    response.setHeader('Content-Type', 'application/json');
    response.end(`${JSON.stringify(value)}\n`);
}
