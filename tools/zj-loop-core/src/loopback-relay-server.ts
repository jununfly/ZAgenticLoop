import { createHash, randomUUID } from 'node:crypto';
import { createServer, type Server, type ServerOptions } from 'node:https';
import type { TLSSocket } from 'node:tls';
import { createRelaySession, type RelaySession } from './relay-contract.js';

export const RELAY_HTTP_SCHEMA = 'zj-loop.relay_http.v1' as const;
const MAX_RELAY_BODY_BYTES = 64 * 1024;

export type RelaySessionVerificationRequest = {
  token: string;
  node_id: string;
  network_id: string;
  protocol_version: string;
};

export type RelaySessionVerifier = {
  verify(input: RelaySessionVerificationRequest): Promise<{ status: 'allowed' | 'blocked'; credential_id?: string; expires_at?: string; reason?: string }> | { status: 'allowed' | 'blocked'; credential_id?: string; expires_at?: string; reason?: string };
};

export type RelayDeliveryResolver = {
  findNext(input: { network_id: string; node_id: string; after_revision: number }): Promise<Record<string, unknown> | null> | Record<string, unknown> | null;
};

export type RelayDeliveryAcknowledger = {
  acknowledge(input: { network_id: string; node_id: string; delivery_id: string; attempt_id: string }): Promise<Record<string, unknown>> | Record<string, unknown>;
};

export type RelayReadinessCheck = {
  check(): Promise<{ status: 'ready' | 'not-ready'; reason?: string }> | { status: 'ready' | 'not-ready'; reason?: string };
};

function sendJson(response: import('node:http').ServerResponse, statusCode: number, body: Record<string, unknown>): void {
  const encoded = JSON.stringify(body);
  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('content-length', Buffer.byteLength(encoded));
  response.end(encoded);
}

async function readBody(request: import('node:http').IncomingMessage): Promise<unknown> {
  const declared = Number(request.headers['content-length'] ?? 0);
  if (declared > MAX_RELAY_BODY_BYTES) throw new Error('relay-envelope-too-large');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += part.length;
    if (size > MAX_RELAY_BODY_BYTES) throw new Error('relay-envelope-too-large');
    chunks.push(part);
  }
  if (!size) throw new Error('json-body-required');
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('json-invalid');
  }
}

export function createLoopbackRelayServer(input: {
  tls: ServerOptions;
  sessionVerifier: RelaySessionVerifier | null;
  deliveryResolver?: RelayDeliveryResolver | null;
  deliveryAcknowledger?: RelayDeliveryAcknowledger | null;
  readinessCheck?: RelayReadinessCheck | null;
  now?: () => string;
  session_ttl_ms: number;
  supported_protocol_version?: string;
}): Server {
  const now = input.now ?? (() => new Date().toISOString());
  const supportedProtocol = input.supported_protocol_version ?? 'relay.v1';
  const sessions = new Map<string, RelaySession>();
  return createServer({ ...input.tls, requestCert: true, rejectUnauthorized: false }, async (request, response) => {
    if (request.method === 'GET' && request.url === '/healthz') {
      sendJson(response, 200, { schema: RELAY_HTTP_SCHEMA, status: 'ok', side_effects_executed: false });
      return;
    }
    if (request.method === 'GET' && request.url === '/readyz') {
      const readiness = input.readinessCheck ? await Promise.resolve(input.readinessCheck.check()) : { status: 'ready' as const };
      sendJson(response, readiness.status === 'ready' ? 200 : 503, { schema: RELAY_HTTP_SCHEMA, status: readiness.status, ...(readiness.reason ? { reason: readiness.reason } : {}), side_effects_executed: false });
      return;
    }
    if (!(request.socket as TLSSocket).authorized) {
      sendJson(response, 401, { schema: RELAY_HTTP_SCHEMA, status: 'blocked', reason: 'client-certificate-required', side_effects_executed: false });
      return;
    }
    const url = new URL(request.url ?? '/', 'https://relay.local');
    const ackMatch = url.pathname.match(/^\/v1\/sessions\/([^/]+)\/deliveries\/([^/]+)\/ack$/);
    if (request.method === 'POST' && ackMatch) {
      const authorization = request.headers.authorization;
      if (!authorization || !/^Bearer\s+\S+$/.test(authorization)) {
        sendJson(response, 401, { schema: RELAY_HTTP_SCHEMA, status: 'blocked', reason: 'credential-required', side_effects_executed: false });
        return;
      }
      const session = sessions.get(decodeURIComponent(ackMatch[1]));
      if (!session) {
        sendJson(response, 404, { schema: RELAY_HTTP_SCHEMA, status: 'blocked', reason: 'session-not-found', side_effects_executed: false });
        return;
      }
      const peer = (request.socket as TLSSocket).getPeerCertificate();
      if (!peer.raw) {
        sendJson(response, 401, { schema: RELAY_HTTP_SCHEMA, status: 'blocked', reason: 'client-identity-unavailable', side_effects_executed: false });
        return;
      }
      const nodeId = createHash('sha256').update(peer.raw).digest('hex');
      if (nodeId !== session.node_id) {
        sendJson(response, 403, { schema: RELAY_HTTP_SCHEMA, status: 'blocked', reason: 'session-node-mismatch', side_effects_executed: false });
        return;
      }
      if (!input.sessionVerifier) {
        sendJson(response, 503, { schema: RELAY_HTTP_SCHEMA, status: 'blocked', reason: 'credential-verifier-unavailable', side_effects_executed: false });
        return;
      }
      const verification = await Promise.resolve(input.sessionVerifier.verify({ token: authorization.replace(/^Bearer\s+/, ''), node_id: nodeId, network_id: session.network_id, protocol_version: session.protocol_version }));
      if (verification.status !== 'allowed' || verification.credential_id !== session.credential_id) {
        sendJson(response, 403, { schema: RELAY_HTTP_SCHEMA, status: 'blocked', reason: verification.reason ?? 'session-credential-invalid', side_effects_executed: false });
        return;
      }
      if (!input.deliveryAcknowledger) {
        sendJson(response, 503, { schema: RELAY_HTTP_SCHEMA, status: 'blocked', reason: 'delivery-acknowledger-unavailable', side_effects_executed: false });
        return;
      }
      let body: unknown;
      try {
        body = await readBody(request);
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'json-invalid';
        sendJson(response, reason === 'relay-envelope-too-large' ? 413 : 400, { schema: RELAY_HTTP_SCHEMA, status: 'blocked', reason, side_effects_executed: false });
        return;
      }
      const bodyKeys = body && typeof body === 'object' && !Array.isArray(body) ? Object.keys(body).sort() : [];
      const requestBody = body as { attempt_id?: unknown };
      if (bodyKeys.join(',') !== 'attempt_id' || typeof requestBody.attempt_id !== 'string' || !requestBody.attempt_id.trim()) {
        sendJson(response, 400, { schema: RELAY_HTTP_SCHEMA, status: 'blocked', reason: 'ack-request-invalid', side_effects_executed: false });
        return;
      }
      try {
        const delivery = await Promise.resolve(input.deliveryAcknowledger.acknowledge({ network_id: session.network_id, node_id: nodeId, delivery_id: decodeURIComponent(ackMatch[2]), attempt_id: requestBody.attempt_id }));
        sendJson(response, 200, { schema: RELAY_HTTP_SCHEMA, status: 'delivery-acknowledged', delivery, side_effects_executed: true });
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'delivery-ack-failed';
        const statusCode = reason === 'delivery-lease-expired' ? 410 : reason === 'delivery-attempt-stale' || reason === 'delivery-state-conflict' ? 409 : 400;
        sendJson(response, statusCode, { schema: RELAY_HTTP_SCHEMA, status: 'blocked', reason, side_effects_executed: false });
      }
      return;
    }
    const deliveriesMatch = url.pathname.match(/^\/v1\/sessions\/([^/]+)\/deliveries$/);
    if (request.method === 'GET' && deliveriesMatch) {
      const authorization = request.headers.authorization;
      if (!authorization || !/^Bearer\s+\S+$/.test(authorization)) {
        sendJson(response, 401, { schema: RELAY_HTTP_SCHEMA, status: 'blocked', reason: 'credential-required', side_effects_executed: false });
        return;
      }
      const session = sessions.get(decodeURIComponent(deliveriesMatch[1]));
      if (!session) {
        sendJson(response, 404, { schema: RELAY_HTTP_SCHEMA, status: 'blocked', reason: 'session-not-found', side_effects_executed: false });
        return;
      }
      const peer = (request.socket as TLSSocket).getPeerCertificate();
      if (!peer.raw) {
        sendJson(response, 401, { schema: RELAY_HTTP_SCHEMA, status: 'blocked', reason: 'client-identity-unavailable', side_effects_executed: false });
        return;
      }
      const nodeId = createHash('sha256').update(peer.raw).digest('hex');
      if (nodeId !== session.node_id) {
        sendJson(response, 403, { schema: RELAY_HTTP_SCHEMA, status: 'blocked', reason: 'session-node-mismatch', side_effects_executed: false });
        return;
      }
      if (!input.sessionVerifier) {
        sendJson(response, 503, { schema: RELAY_HTTP_SCHEMA, status: 'blocked', reason: 'credential-verifier-unavailable', side_effects_executed: false });
        return;
      }
      const verification = await Promise.resolve(input.sessionVerifier.verify({ token: authorization.replace(/^Bearer\s+/, ''), node_id: nodeId, network_id: session.network_id, protocol_version: session.protocol_version }));
      if (verification.status !== 'allowed' || verification.credential_id !== session.credential_id) {
        sendJson(response, 403, { schema: RELAY_HTTP_SCHEMA, status: 'blocked', reason: verification.reason ?? 'session-credential-invalid', side_effects_executed: false });
        return;
      }
      if (!input.deliveryResolver) {
        sendJson(response, 503, { schema: RELAY_HTTP_SCHEMA, status: 'blocked', reason: 'delivery-resolver-unavailable', side_effects_executed: false });
        return;
      }
      const afterRevisionText = url.searchParams.get('after_revision') ?? '0';
      const afterRevision = Number(afterRevisionText);
      if (!Number.isInteger(afterRevision) || afterRevision < 0) {
        sendJson(response, 400, { schema: RELAY_HTTP_SCHEMA, status: 'blocked', reason: 'cursor-invalid', side_effects_executed: false });
        return;
      }
      const delivery = await Promise.resolve(input.deliveryResolver.findNext({ network_id: session.network_id, node_id: nodeId, after_revision: afterRevision }));
      if (!delivery) {
        response.statusCode = 204;
        response.end();
        return;
      }
      sendJson(response, 200, { schema: RELAY_HTTP_SCHEMA, status: 'delivery-available', delivery, side_effects_executed: false });
      return;
    }
    const closeMatch = url.pathname.match(/^\/v1\/sessions\/([^/]+)$/);
    if (request.method === 'DELETE' && closeMatch) {
      const authorization = request.headers.authorization;
      if (!authorization || !/^Bearer\s+\S+$/.test(authorization)) {
        sendJson(response, 401, { schema: RELAY_HTTP_SCHEMA, status: 'blocked', reason: 'credential-required', side_effects_executed: false });
        return;
      }
      const sessionId = decodeURIComponent(closeMatch[1]);
      const session = sessions.get(sessionId);
      if (!session) {
        sendJson(response, 404, { schema: RELAY_HTTP_SCHEMA, status: 'blocked', reason: 'session-not-found', side_effects_executed: false });
        return;
      }
      const peer = (request.socket as TLSSocket).getPeerCertificate();
      if (!peer.raw) {
        sendJson(response, 401, { schema: RELAY_HTTP_SCHEMA, status: 'blocked', reason: 'client-identity-unavailable', side_effects_executed: false });
        return;
      }
      const nodeId = createHash('sha256').update(peer.raw).digest('hex');
      if (nodeId !== session.node_id) {
        sendJson(response, 403, { schema: RELAY_HTTP_SCHEMA, status: 'blocked', reason: 'session-node-mismatch', side_effects_executed: false });
        return;
      }
      if (!input.sessionVerifier) {
        sendJson(response, 503, { schema: RELAY_HTTP_SCHEMA, status: 'blocked', reason: 'credential-verifier-unavailable', side_effects_executed: false });
        return;
      }
      const verification = await Promise.resolve(input.sessionVerifier.verify({ token: authorization.replace(/^Bearer\s+/, ''), node_id: nodeId, network_id: session.network_id, protocol_version: session.protocol_version }));
      if (verification.status !== 'allowed' || verification.credential_id !== session.credential_id) {
        sendJson(response, 403, { schema: RELAY_HTTP_SCHEMA, status: 'blocked', reason: verification.reason ?? 'session-credential-invalid', side_effects_executed: false });
        return;
      }
      sessions.set(sessionId, { ...session, status: 'closed' });
      response.statusCode = 204;
      response.end();
      return;
    }
    const statusMatch = url.pathname.match(/^\/v1\/sessions\/([^/]+)\/status$/);
    if (request.method === 'GET' && statusMatch) {
      const authorization = request.headers.authorization;
      if (!authorization || !/^Bearer\s+\S+$/.test(authorization)) {
        sendJson(response, 401, { schema: RELAY_HTTP_SCHEMA, status: 'blocked', reason: 'credential-required', side_effects_executed: false });
        return;
      }
      const session = sessions.get(decodeURIComponent(statusMatch[1]));
      if (!session) {
        sendJson(response, 404, { schema: RELAY_HTTP_SCHEMA, status: 'blocked', reason: 'session-not-found', side_effects_executed: false });
        return;
      }
      const peer = (request.socket as TLSSocket).getPeerCertificate();
      if (!peer.raw) {
        sendJson(response, 401, { schema: RELAY_HTTP_SCHEMA, status: 'blocked', reason: 'client-identity-unavailable', side_effects_executed: false });
        return;
      }
      const nodeId = createHash('sha256').update(peer.raw).digest('hex');
      if (nodeId !== session.node_id) {
        sendJson(response, 403, { schema: RELAY_HTTP_SCHEMA, status: 'blocked', reason: 'session-node-mismatch', side_effects_executed: false });
        return;
      }
      if (!input.sessionVerifier) {
        sendJson(response, 503, { schema: RELAY_HTTP_SCHEMA, status: 'blocked', reason: 'credential-verifier-unavailable', side_effects_executed: false });
        return;
      }
      const verification = await Promise.resolve(input.sessionVerifier.verify({ token: authorization.replace(/^Bearer\s+/, ''), node_id: nodeId, network_id: session.network_id, protocol_version: session.protocol_version }));
      if (verification.status !== 'allowed' || verification.credential_id !== session.credential_id) {
        sendJson(response, 403, { schema: RELAY_HTTP_SCHEMA, status: 'blocked', reason: verification.reason ?? 'session-credential-invalid', side_effects_executed: false });
        return;
      }
      sendJson(response, 200, { schema: RELAY_HTTP_SCHEMA, status: 'ok', session: { session_id: session.session_id, network_id: session.network_id, node_id: session.node_id, protocol_version: session.protocol_version, status: session.status }, side_effects_executed: false });
      return;
    }
    if (request.method !== 'POST' || url.pathname !== '/v1/sessions') {
      sendJson(response, 404, { schema: RELAY_HTTP_SCHEMA, status: 'blocked', reason: 'route-not-found', side_effects_executed: false });
      return;
    }
    const authorization = request.headers.authorization;
    if (!authorization || !/^Bearer\s+\S+$/.test(authorization)) {
      sendJson(response, 401, { schema: RELAY_HTTP_SCHEMA, status: 'blocked', reason: 'credential-required', side_effects_executed: false });
      return;
    }
    if (!input.sessionVerifier) {
      sendJson(response, 503, { schema: RELAY_HTTP_SCHEMA, status: 'blocked', reason: 'credential-verifier-unavailable', side_effects_executed: false });
      return;
    }
    const peer = (request.socket as TLSSocket).getPeerCertificate();
    if (!peer.raw) {
      sendJson(response, 401, { schema: RELAY_HTTP_SCHEMA, status: 'blocked', reason: 'client-identity-unavailable', side_effects_executed: false });
      return;
    }
    let body: unknown;
    try {
      body = await readBody(request);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'json-invalid';
      sendJson(response, reason === 'relay-envelope-too-large' ? 413 : 400, { schema: RELAY_HTTP_SCHEMA, status: 'blocked', reason, side_effects_executed: false });
      return;
    }
    const bodyKeys = body && typeof body === 'object' && !Array.isArray(body) ? Object.keys(body).sort() : [];
    const requestBody = body as { network_id?: unknown; protocol_version?: unknown };
    if (bodyKeys.join(',') !== 'network_id,protocol_version' || typeof requestBody.network_id !== 'string' || typeof requestBody.protocol_version !== 'string') {
      sendJson(response, 400, { schema: RELAY_HTTP_SCHEMA, status: 'blocked', reason: 'session-request-invalid', side_effects_executed: false });
      return;
    }
    if (requestBody.protocol_version !== supportedProtocol) {
      sendJson(response, 426, { schema: RELAY_HTTP_SCHEMA, status: 'blocked', reason: 'protocol-version-unsupported', side_effects_executed: false });
      return;
    }
    const nodeId = createHash('sha256').update(peer.raw).digest('hex');
    const verification = await Promise.resolve(input.sessionVerifier.verify({ token: authorization.replace(/^Bearer\s+/, ''), node_id: nodeId, network_id: requestBody.network_id, protocol_version: requestBody.protocol_version }));
    if (verification.status !== 'allowed') {
      sendJson(response, 403, { schema: RELAY_HTTP_SCHEMA, status: 'blocked', reason: verification.reason ?? 'credential-invalid', side_effects_executed: false });
      return;
    }
    if (!verification.credential_id || !verification.expires_at) {
      sendJson(response, 403, { schema: RELAY_HTTP_SCHEMA, status: 'blocked', reason: 'credential-binding-missing', side_effects_executed: false });
      return;
    }
    try {
      const session = createRelaySession({ session_id: `rly_${randomUUID().replaceAll('-', '')}`, network_id: requestBody.network_id, node_id: nodeId, credential_id: verification.credential_id, protocol_version: requestBody.protocol_version, created_at: now(), credential_expires_at: verification.expires_at, max_ttl_ms: input.session_ttl_ms });
      sessions.set(session.session_id, session);
      sendJson(response, 201, { schema: RELAY_HTTP_SCHEMA, status: 'created', session, side_effects_executed: false });
    } catch (error) {
      sendJson(response, 400, { schema: RELAY_HTTP_SCHEMA, status: 'blocked', reason: error instanceof Error ? error.message : 'session-invalid', side_effects_executed: false });
    }
  });
}
