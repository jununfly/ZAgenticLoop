import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HUMAN_AUTHORITY_SCHEMA } from './human-authority.js';
export const HUMAN_APPROVAL_UI_SCHEMA = 'zj-loop.human_approval_ui.v1';
function json(response, statusCode, body) {
    const encoded = JSON.stringify(body);
    response.statusCode = statusCode;
    response.setHeader('content-type', 'application/json; charset=utf-8');
    response.setHeader('content-length', Buffer.byteLength(encoded));
    response.end(encoded);
}
function tokenHash(value) {
    return createHash('sha256').update(value, 'utf8').digest('hex');
}
function cookieValue(request) {
    const cookie = request.headers.cookie ?? '';
    const match = cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith('zj_loop_ui_session='));
    return match ? decodeURIComponent(match.slice('zj_loop_ui_session='.length)) : null;
}
function publicIdentity(identity) {
    return { human_id: identity.human_id, algorithm: identity.algorithm, public_key_fingerprint: identity.public_key_fingerprint };
}
function canonicalJson(value) {
    return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))));
}
function digest(value) {
    return createHash('sha256').update(value, 'utf8').digest('hex');
}
async function signApprovalContext(input) {
    const identity = await Promise.resolve(input.signer.getPublicIdentity());
    const capabilities = [...new Set(input.approved_capabilities)].sort();
    const payloadDigest = digest(canonicalJson({ action: input.action, request_id: input.request_id, request_digest: input.request_digest, approved_capabilities: capabilities, human_id: identity.human_id, issued_at: input.issued_at, expires_at: input.expires_at }));
    const signature = await input.signer.sign({ payload: Buffer.from(payloadDigest, 'utf8') });
    return { schema: HUMAN_AUTHORITY_SCHEMA, human_id: identity.human_id, public_key_fingerprint: identity.public_key_fingerprint, action: input.action, request_id: input.request_id, request_digest: input.request_digest, approved_capabilities: capabilities, issued_at: input.issued_at, expires_at: input.expires_at, payload_digest: payloadDigest, signature_base64: signature.signature_base64 };
}
function blocked(response, statusCode, reason) {
    json(response, statusCode, { schema: HUMAN_APPROVAL_UI_SCHEMA, status: 'blocked', reason, side_effects_executed: false });
}
const UI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../ui/human-approval');
const UI_ASSETS = {
    '/': { file: 'index.html', contentType: 'text/html; charset=utf-8' },
    '/assets/human-approval-ui.css': { file: 'human-approval-ui.css', contentType: 'text/css; charset=utf-8' },
    '/assets/human-approval-ui.js': { file: 'human-approval-ui.js', contentType: 'text/javascript; charset=utf-8' },
};
function validSession(request, sessions, now) {
    const token = cookieValue(request);
    if (!token)
        return false;
    const session = sessions.get(tokenHash(token));
    return Boolean(session && Date.parse(now()) < Date.parse(session.expires_at));
}
async function readBody(request) {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
        const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += value.length;
        if (size > 64 * 1024)
            throw new Error('ui-payload-too-large');
        chunks.push(value);
    }
    let parsed;
    try {
        parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    }
    catch {
        throw new Error('ui-json-invalid');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        throw new Error('ui-json-invalid');
    return parsed;
}
export function createHumanApprovalUiServer(input) {
    if (!input.network_id.trim())
        throw new Error('human-approval-ui-network-id-required');
    const now = input.now ?? (() => new Date().toISOString());
    const bootstrapToken = input.bootstrap_token ?? randomBytes(32).toString('base64url');
    const bootstrapHash = tokenHash(bootstrapToken);
    const sessions = new Map();
    const sessionTtlMs = input.session_ttl_ms ?? 5 * 60 * 1000;
    let bootstrapUsed = false;
    return createServer(async (request, response) => {
        const url = new URL(request.url ?? '/', 'http://127.0.0.1');
        if (request.method === 'GET' && url.pathname === '/ui/bootstrap') {
            if (bootstrapUsed || tokenHash(url.searchParams.get('token') ?? '') !== bootstrapHash) {
                blocked(response, 403, 'bootstrap-token-invalid');
                return;
            }
            bootstrapUsed = true;
            const token = randomBytes(32).toString('base64url');
            sessions.set(tokenHash(token), { token_hash: tokenHash(token), expires_at: new Date(Date.parse(now()) + sessionTtlMs).toISOString() });
            response.statusCode = 302;
            response.setHeader('location', '/');
            response.setHeader('set-cookie', `zj_loop_ui_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/`);
            response.end();
            return;
        }
        if (request.method === 'GET' && url.pathname === '/ui/session') {
            if (!validSession(request, sessions, now)) {
                blocked(response, 401, 'ui-session-required');
                return;
            }
            const identity = await Promise.resolve(input.signer.getPublicIdentity());
            json(response, 200, { schema: HUMAN_APPROVAL_UI_SCHEMA, status: 'ok', human: publicIdentity(identity), network_id: input.network_id, side_effects_executed: false });
            return;
        }
        if (request.method === 'GET' && url.pathname === '/ui/pairing-requests') {
            if (!validSession(request, sessions, now)) {
                blocked(response, 401, 'ui-session-required');
                return;
            }
            let result;
            try {
                result = await input.upstream.list({ network_id: input.network_id });
            }
            catch {
                blocked(response, 503, 'pairing-upstream-unavailable');
                return;
            }
            json(response, 200, { schema: HUMAN_APPROVAL_UI_SCHEMA, status: 'ok', network_id: input.network_id, requests: result.requests, side_effects_executed: false });
            return;
        }
        const evidenceMatch = request.method === 'GET' ? url.pathname.match(/^\/ui\/evidence\/([^/]+)$/) : null;
        if (evidenceMatch) {
            if (!validSession(request, sessions, now)) {
                blocked(response, 401, 'ui-session-required');
                return;
            }
            if (!input.upstream.evidence) {
                blocked(response, 503, 'evidence-upstream-unavailable');
                return;
            }
            try {
                const result = await input.upstream.evidence({ network_id: input.network_id, evidence_id: decodeURIComponent(evidenceMatch[1]) });
                json(response, 200, { schema: HUMAN_APPROVAL_UI_SCHEMA, status: 'ok', network_id: input.network_id, evidence: result, side_effects_executed: false });
            }
            catch {
                blocked(response, 503, 'evidence-upstream-unavailable');
            }
            return;
        }
        const approveMatch = request.method === 'POST' ? url.pathname.match(/^\/ui\/pairing-requests\/([^/]+)\/approve$/) : null;
        if (approveMatch) {
            if (!validSession(request, sessions, now)) {
                blocked(response, 401, 'ui-session-required');
                return;
            }
            if (request.headers.origin !== `http://${request.headers.host}`) {
                blocked(response, 403, 'ui-origin-invalid');
                return;
            }
            if (!input.upstream.approve) {
                blocked(response, 503, 'pairing-upstream-approval-unavailable');
                return;
            }
            let body;
            try {
                body = await readBody(request);
            }
            catch (error) {
                blocked(response, 400, error instanceof Error ? error.message : 'ui-json-invalid');
                return;
            }
            const requestId = decodeURIComponent(approveMatch[1]);
            const requestDigest = typeof body.request_digest === 'string' ? body.request_digest : '';
            const capabilities = Array.isArray(body.approved_capabilities) && body.approved_capabilities.every((value) => typeof value === 'string') ? [...new Set(body.approved_capabilities)].sort() : null;
            if (!requestDigest || !capabilities) {
                blocked(response, 400, 'ui-approval-input-invalid');
                return;
            }
            let current;
            try {
                current = (await input.upstream.list({ network_id: input.network_id })).requests.find((item) => item.request_id === requestId);
            }
            catch {
                blocked(response, 503, 'pairing-upstream-unavailable');
                return;
            }
            if (!current) {
                blocked(response, 404, 'pairing-request-not-found');
                return;
            }
            if (current.status !== 'pending' || current.request_digest !== requestDigest) {
                blocked(response, 409, 'pairing-state-conflict');
                return;
            }
            if (capabilities.some((capability) => !current.requested_capabilities.includes(capability))) {
                blocked(response, 400, 'approved-capabilities-exceed-request');
                return;
            }
            const expiresAt = new Date(Math.min(Date.parse(current.expires_at), Date.parse(now()) + 5 * 60 * 1000)).toISOString();
            const context = await signApprovalContext({ signer: input.signer, action: 'pairing.approve', request_id: requestId, request_digest: requestDigest, approved_capabilities: capabilities, issued_at: now(), expires_at: expiresAt });
            let result;
            try {
                result = await input.upstream.approve({ network_id: input.network_id, request_id: requestId, request_digest: requestDigest, approved_capabilities: capabilities, context });
            }
            catch {
                blocked(response, 503, 'pairing-upstream-unavailable');
                return;
            }
            json(response, 201, { schema: HUMAN_APPROVAL_UI_SCHEMA, status: 'recorded', request_id: requestId, result, side_effects_executed: true });
            return;
        }
        const rejectMatch = request.method === 'POST' ? url.pathname.match(/^\/ui\/pairing-requests\/([^/]+)\/reject$/) : null;
        if (rejectMatch) {
            if (!validSession(request, sessions, now)) {
                blocked(response, 401, 'ui-session-required');
                return;
            }
            if (request.headers.origin !== `http://${request.headers.host}`) {
                blocked(response, 403, 'ui-origin-invalid');
                return;
            }
            if (!input.upstream.reject) {
                blocked(response, 503, 'pairing-upstream-rejection-unavailable');
                return;
            }
            let body;
            try {
                body = await readBody(request);
            }
            catch (error) {
                blocked(response, 400, error instanceof Error ? error.message : 'ui-json-invalid');
                return;
            }
            const requestId = decodeURIComponent(rejectMatch[1]);
            const requestDigest = typeof body.request_digest === 'string' ? body.request_digest : '';
            const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
            const allowedReasons = new Set(['identity-untrusted', 'capability-too-broad', 'endpoint-unexpected', 'request-not-needed', 'duplicate-node', 'human-review-deferred', 'other']);
            if (!requestDigest || !reason || !allowedReasons.has(reason)) {
                blocked(response, 400, 'ui-rejection-input-invalid');
                return;
            }
            let current;
            try {
                current = (await input.upstream.list({ network_id: input.network_id })).requests.find((item) => item.request_id === requestId);
            }
            catch {
                blocked(response, 503, 'pairing-upstream-unavailable');
                return;
            }
            if (!current) {
                blocked(response, 404, 'pairing-request-not-found');
                return;
            }
            if (current.status !== 'pending' || current.request_digest !== requestDigest) {
                blocked(response, 409, 'pairing-state-conflict');
                return;
            }
            const expiresAt = new Date(Math.min(Date.parse(current.expires_at), Date.parse(now()) + 5 * 60 * 1000)).toISOString();
            const context = await signApprovalContext({ signer: input.signer, action: 'pairing.reject', request_id: requestId, request_digest: requestDigest, approved_capabilities: [], issued_at: now(), expires_at: expiresAt });
            let result;
            try {
                result = await input.upstream.reject({ network_id: input.network_id, request_id: requestId, request_digest: requestDigest, reason, context });
            }
            catch {
                blocked(response, 503, 'pairing-upstream-unavailable');
                return;
            }
            json(response, 201, { schema: HUMAN_APPROVAL_UI_SCHEMA, status: 'recorded', request_id: requestId, result, side_effects_executed: true });
            return;
        }
        if (request.method === 'GET' && UI_ASSETS[url.pathname]) {
            const asset = UI_ASSETS[url.pathname];
            try {
                const content = await readFile(path.join(UI_ROOT, asset.file));
                response.statusCode = 200;
                response.setHeader('content-type', asset.contentType);
                response.setHeader('content-length', content.byteLength);
                response.end(content);
            }
            catch {
                blocked(response, 503, 'ui-assets-unavailable');
            }
            return;
        }
        blocked(response, 404, 'route-not-found');
    });
}
async function requestPairingApi(input, pathname, method, body) {
    const endpoint = new URL(input.endpoint);
    if (endpoint.protocol !== 'https:')
        throw new Error('pairing-upstream-https-required');
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const options = { protocol: 'https:', hostname: endpoint.hostname, port: endpoint.port || 443, path: pathname, method, ca: input.ca, cert: input.cert, key: input.key, rejectUnauthorized: true, minVersion: 'TLSv1.2', headers: { ...(input.authorization ? { authorization: input.authorization } : {}), ...(payload === undefined ? {} : { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) }) } };
    return await new Promise((resolve, reject) => {
        const request = httpsRequest(options, (response) => {
            const chunks = [];
            response.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
            response.on('end', () => {
                const text = Buffer.concat(chunks).toString('utf8');
                let parsed;
                try {
                    parsed = JSON.parse(text);
                }
                catch {
                    reject(new Error('pairing-upstream-response-invalid'));
                    return;
                }
                if ((response.statusCode ?? 500) >= 400) {
                    reject(new Error(typeof parsed.reason === 'string' ? parsed.reason : 'pairing-upstream-failed'));
                    return;
                }
                resolve(parsed);
            });
        });
        request.once('error', reject);
        if (payload !== undefined)
            request.write(payload);
        request.end();
    });
}
export function createPairingHttpUpstream(input) {
    const base = new URL(input.endpoint);
    const pathFor = (path) => `${base.pathname.replace(/\/$/, '')}${path}`;
    return {
        async list({ network_id }) {
            const result = await requestPairingApi(input, `${pathFor('/v1/owner/pairing-requests')}?network_id=${encodeURIComponent(network_id)}`, 'GET');
            return { requests: Array.isArray(result.requests) ? result.requests : [] };
        },
        async approve(value) {
            return requestPairingApi(input, pathFor(`/v1/owner/pairing-requests/${encodeURIComponent(value.request_id)}/approve`), 'POST', { network_id: value.network_id, request_digest: value.request_digest, approved_capabilities: value.approved_capabilities, context: value.context });
        },
        async reject(value) {
            return requestPairingApi(input, pathFor(`/v1/owner/pairing-requests/${encodeURIComponent(value.request_id)}/reject`), 'POST', { network_id: value.network_id, request_digest: value.request_digest, reason: value.reason, context: value.context });
        },
    };
}
