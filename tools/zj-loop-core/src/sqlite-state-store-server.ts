import { createServer, type Server, type ServerOptions } from 'node:https';
import { createHash } from 'node:crypto';
import type { TLSSocket } from 'node:tls';
import type { SqliteStateStore } from './sqlite-state-store.js';

export const STATE_STORE_HTTP_SCHEMA = 'zj-loop.state_store_http.v1' as const;
const MAX_HTTP_BODY_BYTES = 512 * 1024;

export type CredentialVerificationRequest = {
  token: string;
  node_id: string;
  network_id?: string;
  operation: string;
  event_id?: string;
  task_id?: string;
  required_capabilities?: string[];
};

export type CredentialVerifier = {
  verify(input: CredentialVerificationRequest): Promise<{ status: 'allowed' | 'blocked'; reason?: string }> | { status: 'allowed' | 'blocked'; reason?: string };
};

export type HumanAuthorityVerificationRequest = {
  context: string;
  action: string;
  request_body: unknown;
};

export type HumanAuthorityVerifier = {
  verify(input: HumanAuthorityVerificationRequest): Promise<{ status: 'allowed' | 'blocked'; human_id?: string; reason?: string }> | { status: 'allowed' | 'blocked'; human_id?: string; reason?: string };
};

function sendJson(response: import('node:http').ServerResponse, statusCode: number, body: Record<string, unknown>): void {
  const encoded = JSON.stringify(body);
  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('content-length', Buffer.byteLength(encoded));
  response.end(encoded);
}

async function readJsonBody(request: import('node:http').IncomingMessage): Promise<unknown> {
  const declaredLength = Number(request.headers['content-length'] ?? 0);
  if (declaredLength > MAX_HTTP_BODY_BYTES) throw new Error('payload-too-large');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_HTTP_BODY_BYTES) throw new Error('payload-too-large');
    chunks.push(buffer);
  }
  if (size === 0) throw new Error('json-body-required');
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('json-invalid');
  }
}

export function createStateStoreServer(input: {
  tls: ServerOptions;
  store: SqliteStateStore | null;
  credentialVerifier: CredentialVerifier | null;
  humanAuthorityVerifier?: HumanAuthorityVerifier | null;
}): Server {
  return createServer({ ...input.tls, requestCert: true, rejectUnauthorized: false }, async (request, response) => {
    if (request.method === 'GET' && request.url === '/healthz') {
      sendJson(response, 200, { schema: STATE_STORE_HTTP_SCHEMA, status: 'ok', side_effects_executed: false });
      return;
    }
    if (!(request.socket as TLSSocket).authorized) {
      sendJson(response, 401, { schema: STATE_STORE_HTTP_SCHEMA, status: 'blocked', reason: 'client-certificate-required', side_effects_executed: false });
      return;
    }
    const url = new URL(request.url ?? '/', 'https://state-store.local');
    if (request.method === 'POST' && url.pathname === '/v1/networks') {
      const contextHeader = request.headers['x-zj-loop-human-approval'];
      if (typeof contextHeader !== 'string' || !contextHeader) {
        sendJson(response, 401, { schema: STATE_STORE_HTTP_SCHEMA, status: 'blocked', reason: 'human-context-required', side_effects_executed: false });
        return;
      }
      const context = contextHeader;
      if (!input.humanAuthorityVerifier) {
        sendJson(response, 503, { schema: STATE_STORE_HTTP_SCHEMA, status: 'blocked', reason: 'human-verifier-unavailable', side_effects_executed: false });
        return;
      }
      let body: unknown;
      try {
        body = await readJsonBody(request);
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'json-invalid';
        sendJson(response, reason === 'payload-too-large' ? 413 : 400, { schema: STATE_STORE_HTTP_SCHEMA, status: 'blocked', reason, side_effects_executed: false });
        return;
      }
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || typeof (body as { network_id?: unknown }).network_id !== 'string' || 'owner_id' in body) {
        sendJson(response, 400, { schema: STATE_STORE_HTTP_SCHEMA, status: 'blocked', reason: 'network-request-invalid', side_effects_executed: false });
        return;
      }
      const human = await Promise.resolve(input.humanAuthorityVerifier.verify({ context, action: 'network.create', request_body: body }));
      if (human.status !== 'allowed') {
        sendJson(response, 403, { schema: STATE_STORE_HTTP_SCHEMA, status: 'blocked', reason: human.reason ?? 'human-context-invalid', side_effects_executed: false });
        return;
      }
      if (!human.human_id) {
        sendJson(response, 403, { schema: STATE_STORE_HTTP_SCHEMA, status: 'blocked', reason: 'human-identity-missing', side_effects_executed: false });
        return;
      }
      if (!input.store) {
        sendJson(response, 503, { schema: STATE_STORE_HTTP_SCHEMA, status: 'blocked', reason: 'state-store-unavailable', side_effects_executed: false });
        return;
      }
      try {
        const result = await input.store.createNetwork({ network_id: (body as { network_id: string }).network_id, owner_id: human.human_id });
        if (result.status === 'conflict') {
          sendJson(response, 409, { schema: STATE_STORE_HTTP_SCHEMA, status: 'blocked', reason: result.reason ?? 'network-conflict', side_effects_executed: false });
        } else {
          sendJson(response, result.status === 'recorded' ? 201 : 200, { schema: STATE_STORE_HTTP_SCHEMA, status: 'ok', network_id: (body as { network_id: string }).network_id, owner_id: human.human_id, revision: result.revision, side_effects_executed: result.status === 'recorded' });
        }
      } catch {
        sendJson(response, 503, { schema: STATE_STORE_HTTP_SCHEMA, status: 'blocked', reason: 'state-store-failure', side_effects_executed: false });
      }
      return;
    }
    const authorization = request.headers.authorization;
    if (!authorization || !/^Bearer\s+\S+$/.test(authorization)) {
      sendJson(response, 401, { schema: STATE_STORE_HTTP_SCHEMA, status: 'blocked', reason: 'credential-required', side_effects_executed: false });
      return;
    }
    if (!input.credentialVerifier) {
      sendJson(response, 503, { schema: STATE_STORE_HTTP_SCHEMA, status: 'blocked', reason: 'credential-verifier-unavailable', side_effects_executed: false });
      return;
    }
    const peer = (request.socket as TLSSocket).getPeerCertificate();
    if (!peer.raw) {
      sendJson(response, 401, { schema: STATE_STORE_HTTP_SCHEMA, status: 'blocked', reason: 'client-identity-unavailable', side_effects_executed: false });
      return;
    }
    const networkMatch = url.pathname.match(/^\/v1\/networks\/([^/]+)/);
    const verification = await Promise.resolve(input.credentialVerifier.verify({
      token: authorization.replace(/^Bearer\s+/, ''),
      node_id: createHash('sha256').update(peer.raw).digest('hex'),
      network_id: networkMatch ? decodeURIComponent(networkMatch[1]) : undefined,
      operation: `${request.method ?? 'GET'} ${url.pathname}`,
    }));
    if (verification.status !== 'allowed') {
      sendJson(response, 403, { schema: STATE_STORE_HTTP_SCHEMA, status: 'blocked', reason: verification.reason ?? 'credential-invalid', side_effects_executed: false });
      return;
    }
    const revisionMatch = url.pathname.match(/^\/v1\/networks\/([^/]+)\/revision$/);
    if (request.method === 'GET' && revisionMatch) {
      if (!input.store) {
        sendJson(response, 503, { schema: STATE_STORE_HTTP_SCHEMA, status: 'blocked', reason: 'state-store-unavailable', side_effects_executed: false });
        return;
      }
      const networkId = decodeURIComponent(revisionMatch[1]);
      try {
        const revision = await input.store.getRevision(networkId);
        sendJson(response, 200, { schema: STATE_STORE_HTTP_SCHEMA, status: 'ok', network_id: networkId, revision, side_effects_executed: false });
      } catch (error) {
        const reason = error instanceof Error && error.message === 'network-not-found' ? 'network-not-found' : 'state-store-failure';
        sendJson(response, reason === 'network-not-found' ? 404 : 503, { schema: STATE_STORE_HTTP_SCHEMA, status: 'blocked', reason, side_effects_executed: false });
      }
      return;
    }
    sendJson(response, 404, { schema: STATE_STORE_HTTP_SCHEMA, status: 'blocked', reason: 'route-not-found', side_effects_executed: false });
  });
}
