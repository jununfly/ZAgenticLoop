import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { buildGitLabIssueNoteBridgeEnvelope, type GitLabIssueNoteBridgeRoute } from './gitlab-issue-note-bridge.js';
import { persistGitLabIssueNoteBridgeReceipt, updateGitLabIssueNoteBridgeReceipt } from './gitlab-issue-note-bridge-receipts.js';
import { triggerGitLabIssueNoteBridgePipeline, type GitLabIssueNoteBridgeTriggerConfig } from './gitlab-issue-note-bridge-trigger.js';

export const GITLAB_ISSUE_NOTE_BRIDGE_HTTP_SCHEMA = 'zj-loop.gitlab_issue_note_bridge_http.v1';
export const GITLAB_ISSUE_NOTE_BRIDGE_HTTP_PATH = '/gitlab/webhook/issue-note';
export const GITLAB_ISSUE_NOTE_BRIDGE_HEALTH_PATH = '/healthz';

export type GitLabIssueNoteBridgeServerConfig = {
  projectPath: string;
  route: GitLabIssueNoteBridgeRoute;
  triggerConfig: GitLabIssueNoteBridgeTriggerConfig;
  token: string;
  root?: string;
  apiBaseUrl?: string;
  maxBodyBytes?: number;
  fetchImpl?: typeof fetch;
  now?: () => string;
};

export function createGitLabIssueNoteBridgeServer(config: GitLabIssueNoteBridgeServerConfig): Server {
  return createServer(async (request, response) => {
    if (request.method === 'GET' && request.url === GITLAB_ISSUE_NOTE_BRIDGE_HEALTH_PATH) {
      writeJson(response, 200, { schema: 'zj-loop.gitlab_issue_note_bridge_health.v1', status: 'ok', side_effects_executed: false });
      return;
    }
    if (request.method !== 'POST' || request.url !== GITLAB_ISSUE_NOTE_BRIDGE_HTTP_PATH) {
      writeJson(response, 404, { schema: GITLAB_ISSUE_NOTE_BRIDGE_HTTP_SCHEMA, status: 'blocked', reason: 'endpoint-not-found', side_effects_executed: false });
      return;
    }
    let body: string;
    try {
      body = await readBody(request, config.maxBodyBytes ?? 1024 * 1024);
    } catch (error: any) {
      writeJson(response, 413, { schema: GITLAB_ISSUE_NOTE_BRIDGE_HTTP_SCHEMA, status: 'blocked', reason: error?.message === 'request-body-too-large' ? error.message : 'request-body-invalid', side_effects_executed: false });
      return;
    }
    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      writeJson(response, 400, { schema: GITLAB_ISSUE_NOTE_BRIDGE_HTTP_SCHEMA, status: 'blocked', reason: 'request-json-invalid', side_effects_executed: false });
      return;
    }
    const now = config.now?.() ?? new Date().toISOString();
    const decision = buildGitLabIssueNoteBridgeEnvelope({
      headers: {
        event: header(request, 'x-gitlab-event'),
        eventId: header(request, 'x-gitlab-event-uuid'),
        triggerToken: header(request, 'x-gitlab-token'),
      },
      payload,
      projectPath: config.projectPath,
      expectedProjectPath: config.projectPath,
      expectedTriggerToken: config.token,
      route: config.route,
      receivedAt: now,
    });
    if (decision.status !== 'accepted' || !decision.envelope) {
      writeJson(response, decision.status === 'blocked' ? 400 : 200, { ...decision, schema: GITLAB_ISSUE_NOTE_BRIDGE_HTTP_SCHEMA });
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
    const trigger = await triggerGitLabIssueNoteBridgePipeline({ config: config.triggerConfig, envelope: decision.envelope, envelopeRef: persisted.receipt_path, token: config.token, apiBaseUrl: config.apiBaseUrl, fetchImpl: config.fetchImpl });
    const finalStatus = trigger.status === 'triggered' ? 'triggered' : trigger.status === 'uncertain' ? 'trigger-uncertain' : trigger.status === 'failed' ? 'trigger-failed' : 'trigger-failed';
    await updateGitLabIssueNoteBridgeReceipt({ root: config.root, projectPath: decision.envelope.project_path, eventId: decision.envelope.event_id, dedupeKey: decision.envelope.dedupe_key, status: finalStatus, now, triggerPipelineId: trigger.pipeline?.id ?? null, recoveryReason: trigger.reason });
    writeJson(response, trigger.status === 'triggered' ? 202 : 502, { schema: GITLAB_ISSUE_NOTE_BRIDGE_HTTP_SCHEMA, status: trigger.status, side_effects_executed: trigger.side_effects_executed, receipt: { path: persisted.receipt_path, status: finalStatus }, trigger });
  });
}

function header(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function readBody(request: IncomingMessage, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => {
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

function writeJson(response: ServerResponse, statusCode: number, value: unknown): void {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json');
  response.end(`${JSON.stringify(value)}\n`);
}
