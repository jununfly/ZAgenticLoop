import { createHash, randomBytes, X509Certificate } from 'node:crypto';
import { createServer, type Server, type ServerOptions } from 'node:https';
import type { TLSSocket } from 'node:tls';
import { createPairingApprovedRecord, createPairingRejectedRecord, createPairingRequestedRecord } from './pairing-records.js';
import { projectPairingEnrollment, projectPairingRequests, type PairingLifecycleRecord } from './pairing-projection.js';
import type { PairingRecordStore } from './pairing-record-store.js';
import { approvePairingRequest, pairingRequestDigest, type PairingRequest, type PairingRequestProof } from './node-enrollment.js';
import { verifyPairingRequestProof } from './node-enrollment.js';
import { validateHumanAuthorityV2Binding, type HumanApprovalContext } from './human-authority.js';

export const PAIRING_HTTP_SCHEMA = 'zj-loop.pairing_http.v1' as const;
const MAX_BODY_BYTES = 64 * 1024;

type PairingSession = {
  session_id: string;
  session_token_hash: string;
  session_token: string;
  request_id: string;
  request_digest: string;
  network_id: string;
  node_id: string;
  expires_at: string;
};

export type PairingOwnerAuthenticator = {
  authenticate(input: { action: 'pairing.list' | 'pairing.approve' | 'pairing.reject'; authorization: string | null; request_id?: string; request_digest?: string; context?: HumanApprovalContext; require_v2?: boolean; peer_fingerprint?: string }): Promise<{ status: 'allowed' | 'blocked'; human_id?: string; reason?: string }> | { status: 'allowed' | 'blocked'; human_id?: string; reason?: string };
};

export type CredentialClaimService = {
  claim(input: { request_id: string; session_id: string; network_id: string; node_id: string }): Promise<{ status: 'claimed' | 'duplicate'; credential_id: string; claimed_at: string; token?: string }>;
};

export type CredentialIssueService = {
  issue(input: { request_id: string; network_id: string; node_id: string; request_digest: string; human_id: string; capabilities: string[]; issued_at: string; expires_at: string }): Promise<{ status: 'recorded' | 'duplicate'; credential_id: string }>;
};

export type PairingConnectionReadModelService = {
  read(): Promise<Record<string, unknown>>;
};

function json(response: import('node:http').ServerResponse, statusCode: number, body: Record<string, unknown>): void {
  const encoded = JSON.stringify(body);
  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('content-length', Buffer.byteLength(encoded));
  response.end(encoded);
}

async function readBody(request: import('node:http').IncomingMessage): Promise<unknown> {
  const declared = Number(request.headers['content-length'] ?? 0);
  if (declared > MAX_BODY_BYTES) throw new Error('pairing-request-too-large');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += part.length;
    if (size > MAX_BODY_BYTES) throw new Error('pairing-request-too-large');
    chunks.push(part);
  }
  if (!size) throw new Error('json-body-required');
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new Error('json-invalid'); }
}

function tokenHash(token: string): string { return createHash('sha256').update(token, 'utf8').digest('hex'); }
function peerNodeId(socket: TLSSocket): string | null {
  const peer = socket.getPeerCertificate();
  return peer.raw ? createHash('sha256').update(peer.raw).digest('hex') : null;
}
function errorStatus(reason: string): number {
  if (reason === 'client-certificate-required' || reason === 'pairing-session-invalid') return 401;
  if (reason === 'pairing-node-identity-mismatch' || reason === 'pairing-session-node-mismatch') return 403;
  if (reason === 'pairing-request-expired' || reason === 'pairing-session-expired') return 410;
  if (reason === 'pairing-request-not-found' || reason === 'route-not-found') return 404;
  if (reason === 'owner-authenticator-unavailable') return 503;
  if (reason === 'owner-authentication-required' || reason === 'owner-not-authorized') return 403;
  if (reason === 'connection-read-model-unavailable') return 503;
  if (reason === 'pairing-request-conflict' || reason === 'pairing-projection-conflict') return 409;
  if (reason === 'credential-claim-unavailable') return 503;
  if (reason === 'credential-not-available' || reason === 'intent-expired' || reason === 'credential-claim-conflict') return 409;
  if (reason === 'pairing-service-not-ready') return 503;
  return 400;
}
function blocked(response: import('node:http').ServerResponse, reason: string): void {
  json(response, errorStatus(reason), { schema: PAIRING_HTTP_SCHEMA, status: 'blocked', reason, side_effects_executed: false });
}

function sessionResponse(session: PairingSession, projection: ReturnType<typeof projectPairingRequests>[number], token?: string, enrollment?: unknown): Record<string, unknown> {
  return {
    session: {
      session_id: session.session_id,
      request_id: session.request_id,
      network_id: session.network_id,
      node_id: session.node_id,
      request_digest: session.request_digest,
      expires_at: session.expires_at,
      status: projection.status,
    },
    ...(token ? { session_token: token } : {}),
    ...(enrollment ? { enrollment } : {}),
  };
}

export function createPairingHttpServer(input: {
  tls: ServerOptions;
  recordStore: PairingRecordStore;
  ownerAuthenticator?: PairingOwnerAuthenticator | null;
  readinessCheck?: { check(): Promise<{ status: 'ready' | 'not-ready'; reason?: string }> | { status: 'ready' | 'not-ready'; reason?: string } } | null;
  now?: () => string;
  session_ttl_ms?: number;
  credentialClaim?: CredentialClaimService | null;
  credentialIssue?: CredentialIssueService | null;
  connectionReadModel?: PairingConnectionReadModelService | null;
}): Server {
  const now = input.now ?? (() => new Date().toISOString());
  // FIXME: During development dogfood this is intentionally 50 minutes instead of 5; restore 5 minutes for the production release.
  const sessionTtl = input.session_ttl_ms ?? 50 * 60 * 1000;
  const sessions = new Map<string, PairingSession>();
  return createServer({ ...input.tls, requestCert: true, rejectUnauthorized: false }, async (request, response) => {
    if (request.method === 'GET' && request.url === '/healthz') {
      json(response, 200, { schema: PAIRING_HTTP_SCHEMA, status: 'ok', side_effects_executed: false });
      return;
    }
    if (request.method === 'GET' && request.url === '/readyz') {
      const readiness = input.readinessCheck ? await Promise.resolve(input.readinessCheck.check()) : { status: 'ready' as const };
      json(response, readiness.status === 'ready' ? 200 : 503, { schema: PAIRING_HTTP_SCHEMA, status: readiness.status, ...(readiness.reason ? { reason: readiness.reason } : {}), side_effects_executed: false });
      return;
    }
    const url = new URL(request.url ?? '/', 'https://pairing.local');
    const ownerList = request.method === 'GET' && url.pathname === '/v1/owner/pairing-requests';
    const ownerApprove = request.method === 'POST' && url.pathname.match(/^\/v1\/owner\/pairing-requests\/([^/]+)\/approve$/);
    const ownerReject = request.method === 'POST' && url.pathname.match(/^\/v1\/owner\/pairing-requests\/([^/]+)\/reject$/);
    if (ownerList || ownerApprove || ownerReject) {
      if (!input.ownerAuthenticator) { blocked(response, 'owner-authenticator-unavailable'); return; }
      let body: unknown = null;
      if (!ownerList) {
        try { body = await readBody(request); } catch (error) { blocked(response, error instanceof Error ? error.message : 'json-invalid'); return; }
      }
      const value = body as { network_id?: unknown; request_digest?: unknown; approved_capabilities?: unknown; reason?: unknown; context?: HumanApprovalContext };
      const ownerMatch = typeof ownerApprove === 'object' ? ownerApprove : typeof ownerReject === 'object' ? ownerReject : null;
      const requestId = ownerMatch ? decodeURIComponent(ownerMatch[1]) : undefined;
      const networkId = typeof value?.network_id === 'string' ? value.network_id : url.searchParams.get('network_id');
      if (!networkId?.trim()) { blocked(response, 'network-id-required'); return; }
      const requestDigest = typeof value?.request_digest === 'string' ? value.request_digest : undefined;
      const action = ownerList ? 'pairing.list' : ownerApprove ? 'pairing.approve' : 'pairing.reject';
      let peerFingerprint: string | undefined;
      if (ownerApprove) {
        const socket = request.socket as TLSSocket;
        const peer = socket.getPeerCertificate();
        if (!socket.authorized || !peer.raw) { blocked(response, 'client-certificate-required'); return; }
        peerFingerprint = createHash('sha256').update(peer.raw).digest('hex');
        const binding = validateHumanAuthorityV2Binding({ context: value.context as HumanApprovalContext, network_id: networkId, peer_fingerprint: peerFingerprint, require_current_v2: true });
        if (binding.status !== 'allowed') { blocked(response, binding.reason); return; }
      }
      const auth = await Promise.resolve(input.ownerAuthenticator.authenticate({ action, authorization: typeof request.headers.authorization === 'string' ? request.headers.authorization : null, ...(requestId ? { request_id: requestId } : {}), ...(requestDigest ? { request_digest: requestDigest } : {}), ...(value?.context ? { context: value.context } : {}), ...(ownerApprove ? { require_v2: true, peer_fingerprint: peerFingerprint } : {}) }));
      if (auth.status !== 'allowed') { blocked(response, auth.reason ?? 'owner-not-authorized'); return; }
      const records = await input.recordStore.list(networkId);
      if (ownerList) {
        json(response, 200, { schema: PAIRING_HTTP_SCHEMA, status: 'ok', network_id: networkId, requests: projectPairingRequests({ network_id: networkId, records, now: now() }), side_effects_executed: false });
        return;
      }
      const projection = projectPairingRequests({ network_id: networkId, records, now: now() }).find((item) => item.request_id === requestId);
      if (!projection) { blocked(response, 'pairing-request-not-found'); return; }
      const baseRecord = records.find((record) => record.type === 'pairing-requested' && record.request.request_id === requestId);
      if (!baseRecord || baseRecord.type !== 'pairing-requested') { blocked(response, 'pairing-request-not-found'); return; }
      if (projection.request_digest !== requestDigest) { blocked(response, 'pairing-request-digest-mismatch'); return; }
      if (!value.context || value.context.request_id !== requestId || value.context.request_digest !== requestDigest || value.context.action !== action || value.context.human_id !== auth.human_id) { blocked(response, 'human-approval-context-invalid'); return; }
      try {
        let decision;
        if (ownerApprove) {
          if (!Array.isArray(value.approved_capabilities) || value.approved_capabilities.some((capability) => typeof capability !== 'string')) throw new Error('approved-capabilities-invalid');
          if (JSON.stringify([...new Set(value.approved_capabilities)].sort()) !== JSON.stringify([...value.context.approved_capabilities].sort())) throw new Error('human-approval-context-invalid');
          const existingApproval = records.find((record) => record.type === 'human-approved' && record.request_id === projection.request_id && record.request_digest === projection.request_digest);
          if (existingApproval && existingApproval.type === 'human-approved') decision = existingApproval;
          else {
            const approval = approvePairingRequest({ request: baseRecord.request, human_id: auth.human_id as string, approved_at: now(), approved_capabilities: value.approved_capabilities });
            decision = createPairingApprovedRecord({ request: { request_id: projection.request_id, network_id: projection.network_id, node_id: projection.node_id, request_digest: projection.request_digest }, approval });
          }
        } else {
          if (typeof value.reason !== 'string' || !value.reason.trim()) throw new Error('pairing-rejection-reason-required');
          decision = createPairingRejectedRecord({ request: { request_id: projection.request_id, network_id: projection.network_id, node_id: projection.node_id, request_digest: projection.request_digest }, human_id: auth.human_id as string, rejected_at: now(), reason: value.reason });
        }
        const appended = await input.recordStore.appendIfPending({ request_id: projection.request_id, request_digest: projection.request_digest, record: decision, now: now() });
        let credential;
        if (ownerApprove && input.credentialIssue) {
          credential = await input.credentialIssue.issue({ request_id: projection.request_id, network_id: projection.network_id, node_id: projection.node_id, request_digest: projection.request_digest, human_id: auth.human_id as string, capabilities: [...value.approved_capabilities as string[]], issued_at: appended.record.occurred_at, expires_at: baseRecord.request.expires_at });
        }
        json(response, appended.status === 'duplicate' ? 200 : 201, { schema: PAIRING_HTTP_SCHEMA, status: appended.status === 'duplicate' ? 'existing' : 'recorded', request_id: projection.request_id, lifecycle: appended.record, ...(credential ? { credential_id: credential.credential_id } : {}), side_effects_executed: appended.status === 'recorded' });
      } catch (error) {
        blocked(response, error instanceof Error && error.message === 'pairing-state-conflict' ? 'pairing-state-conflict' : error instanceof Error ? error.message : 'pairing-decision-invalid');
      }
      return;
    }
    const socket = request.socket as TLSSocket;
    if (!socket.authorized || !peerNodeId(socket)) {
      blocked(response, 'client-certificate-required');
      return;
    }
    const nodeId = peerNodeId(socket) as string;
    if (request.method === 'GET' && url.pathname === '/v1/connection') {
      if (!input.connectionReadModel) { blocked(response, 'connection-read-model-unavailable'); return; }
      try { json(response, 200, await input.connectionReadModel.read()); } catch { blocked(response, 'connection-read-model-unavailable'); }
      return;
    }
    if (request.method === 'POST' && url.pathname === '/v1/pairing-requests') {
      let body: unknown;
      try { body = await readBody(request); } catch (error) { blocked(response, error instanceof Error ? error.message : 'json-invalid'); return; }
      const value = body as { request?: PairingRequest; proof?: PairingRequestProof };
      const pairingRequest = value?.request;
      const proof = value?.proof;
      if (!pairingRequest || !proof || typeof pairingRequest !== 'object' || typeof proof !== 'object') { blocked(response, 'pairing-request-invalid'); return; }
      if (pairingRequest.node_id !== nodeId || pairingRequest.identity?.certificate_sha256 !== nodeId) { blocked(response, 'pairing-node-identity-mismatch'); return; }
      try {
        const peer = socket.getPeerCertificate();
        const peerCertificate = new X509Certificate(peer.raw as Buffer);
        if (pairingRequest.identity.certificate_sha256 !== createHash('sha256').update(peerCertificate.raw).digest('hex')) throw new Error('pairing-node-identity-mismatch');
        if (Date.parse(pairingRequest.expires_at) <= Date.parse(now())) throw new Error('pairing-request-expired');
        if (!verifyPairingRequestProof({ request: pairingRequest, proof })) throw new Error('pairing-proof-invalid');
        const record = createPairingRequestedRecord({ request: pairingRequest, occurred_at: now() });
        const appended = await input.recordStore.append(record);
        const records = await input.recordStore.list(pairingRequest.network_id);
        const projection = projectPairingRequests({ network_id: pairingRequest.network_id, records, now: now() }).find((item) => item.request_id === pairingRequest.request_id);
        if (!projection) throw new Error('pairing-request-not-projectable');
        if (projection.status === 'approved' && input.credentialIssue) {
          const approval = records.find((candidate) => candidate.type === 'human-approved' && candidate.request_id === pairingRequest.request_id && candidate.request_digest === projection.request_digest);
          if (approval && approval.type === 'human-approved') await input.credentialIssue.issue({ request_id: pairingRequest.request_id, network_id: pairingRequest.network_id, node_id: pairingRequest.node_id, request_digest: projection.request_digest, human_id: approval.human_id, capabilities: [...approval.approved_capabilities], issued_at: now(), expires_at: pairingRequest.expires_at });
        }
        let session = [...sessions.values()].find((candidate) => candidate.request_id === pairingRequest.request_id && Date.parse(now()) < Date.parse(candidate.expires_at));
        if (!session) {
          const sessionId = randomBytes(18).toString('base64url');
          const token = randomBytes(32).toString('base64url');
          session = { session_id: sessionId, session_token_hash: tokenHash(token), session_token: token, request_id: pairingRequest.request_id, request_digest: pairingRequestDigest(pairingRequest), network_id: pairingRequest.network_id, node_id: nodeId, expires_at: new Date(Math.min(Date.parse(pairingRequest.expires_at), Date.parse(now()) + sessionTtl)).toISOString() };
          sessions.set(sessionId, session);
        }
        const enrollment = projectPairingEnrollment({ network_id: session.network_id, request_id: session.request_id, records: await input.recordStore.list(session.network_id) });
        json(response, appended.status === 'duplicate' ? 200 : 201, { schema: PAIRING_HTTP_SCHEMA, status: appended.status === 'duplicate' ? 'existing' : 'created', ...sessionResponse(session, projection, session.session_token, enrollment), side_effects_executed: appended.status === 'recorded' });
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'pairing-request-invalid';
        blocked(response, reason === 'pairing-event-conflict' ? 'pairing-request-conflict' : reason);
      }
      return;
    }
    const claimMatch = request.method === 'POST' ? url.pathname.match(/^\/v1\/pairing-requests\/([^/]+)\/credential\/claim$/) : null;
    if (claimMatch) {
      if (!input.credentialClaim) { blocked(response, 'credential-claim-unavailable'); return; }
      const requestId = decodeURIComponent(claimMatch[1]);
      const authorization = request.headers.authorization;
      const session = [...sessions.values()].find((candidate) => candidate.request_id === requestId);
      if (!session || !authorization?.startsWith('Bearer ') || tokenHash(authorization.slice(7)) !== session.session_token_hash) { blocked(response, 'pairing-session-invalid'); return; }
      if (session.node_id !== nodeId) { blocked(response, 'pairing-session-node-mismatch'); return; }
      if (Date.parse(now()) >= Date.parse(session.expires_at)) { blocked(response, 'pairing-session-expired'); return; }
      let body: unknown = null;
      try {
        body = await readBody(request);
      } catch (error) {
        blocked(response, error instanceof Error ? error.message : 'json-invalid');
        return;
      }
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 0) { blocked(response, 'credential-claim-request-invalid'); return; }
      try {
        const result = await input.credentialClaim.claim({ request_id: requestId, session_id: session.session_id, network_id: session.network_id, node_id: nodeId });
        json(response, result.status === 'claimed' ? 200 : 200, { schema: PAIRING_HTTP_SCHEMA, status: result.status, request_id: requestId, credential_id: result.credential_id, claimed_at: result.claimed_at, ...(result.token ? { token: result.token } : {}), side_effects_executed: result.status === 'claimed' });
      } catch (error) {
        blocked(response, error instanceof Error ? error.message : 'credential-claim-conflict');
      }
      return;
    }
    const statusMatch = url.pathname.match(/^\/v1\/pairing-requests\/([^/]+)\/status$/);
    if (request.method === 'GET' && statusMatch) {
      const sessionId = decodeURIComponent(statusMatch[1]);
      const authorization = request.headers.authorization;
      const session = sessions.get(sessionId);
      if (!session || !authorization?.startsWith('Bearer ') || tokenHash(authorization.slice(7)) !== session.session_token_hash) { blocked(response, 'pairing-session-invalid'); return; }
      if (session.node_id !== nodeId) { blocked(response, 'pairing-session-node-mismatch'); return; }
      if (Date.parse(now()) >= Date.parse(session.expires_at)) { blocked(response, 'pairing-session-expired'); return; }
      const records = await input.recordStore.list(session.network_id);
      const projection = projectPairingRequests({ network_id: session.network_id, records, now: now() }).find((item) => item.request_id === session.request_id);
      if (!projection) { blocked(response, 'pairing-request-not-found'); return; }
      const enrollment = projectPairingEnrollment({ network_id: session.network_id, request_id: session.request_id, records });
      json(response, 200, { schema: PAIRING_HTTP_SCHEMA, status: 'ok', ...sessionResponse(session, projection, undefined, enrollment), side_effects_executed: false });
      return;
    }
    blocked(response, 'route-not-found');
  });
}
