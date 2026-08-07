import { createHash, randomBytes, X509Certificate } from 'node:crypto';
import { createServer } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HUMAN_AUTHORITY_SCHEMA, HUMAN_AUTHORITY_V2_SCHEMA, humanAuthorityV2SigningPayload } from './human-authority.js';
import { createHumanActionDecision } from './human-action.js';
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
    const schema = input.human_device ? HUMAN_AUTHORITY_V2_SCHEMA : HUMAN_AUTHORITY_SCHEMA;
    if (input.human_device) {
        const payload = humanAuthorityV2SigningPayload({ action: input.action, request_id: input.request_id, request_digest: input.request_digest, approved_capabilities: capabilities, human_id: identity.human_id, issued_at: input.issued_at, expires_at: input.expires_at, network_id: input.network_id, device_key_id: input.human_device.device_key_id, device_fingerprint: input.human_device.device_fingerprint });
        const signature = await input.signer.sign({ payload: payload.signing_payload });
        return { schema, human_id: identity.human_id, public_key_fingerprint: identity.public_key_fingerprint, action: input.action, request_id: input.request_id, request_digest: input.request_digest, approved_capabilities: capabilities, issued_at: input.issued_at, expires_at: input.expires_at, payload_digest: payload.payload_digest, signature_base64: signature.signature_base64, network_id: input.network_id, device_key_id: input.human_device.device_key_id, device_fingerprint: input.human_device.device_fingerprint, canonicalization: 'jcs-rfc8785', canonicalization_profile: 'approval-v2-default-2026-07', profile_sha256: payload.profile_sha256 };
    }
    const payloadDigest = digest(canonicalJson({ action: input.action, request_id: input.request_id, request_digest: input.request_digest, approved_capabilities: capabilities, human_id: identity.human_id, issued_at: input.issued_at, expires_at: input.expires_at, network_id: input.network_id, device_key_id: undefined, device_fingerprint: undefined }));
    const signature = await input.signer.sign({ payload: Buffer.from(payloadDigest, 'utf8') });
    return { schema, human_id: identity.human_id, public_key_fingerprint: identity.public_key_fingerprint, action: input.action, request_id: input.request_id, request_digest: input.request_digest, approved_capabilities: capabilities, issued_at: input.issued_at, expires_at: input.expires_at, payload_digest: payloadDigest, signature_base64: signature.signature_base64 };
}
function blocked(response, statusCode, reason) {
    json(response, statusCode, { schema: HUMAN_APPROVAL_UI_SCHEMA, status: 'blocked', reason, side_effects_executed: false });
}
const UI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../ui/human-approval');
const GRAPH_UI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../ui/graph-review');
const OPN_UI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../ui/opn');
const GRAPH_UI_ASSETS = {
    '/ui/graph-review': { file: 'index.html', contentType: 'text/html; charset=utf-8' },
    '/assets/graph-review-ui.css': { file: 'graph-review-ui.css', contentType: 'text/css; charset=utf-8' },
    '/assets/graph-review-ui.js': { file: 'graph-review-ui.js', contentType: 'text/javascript; charset=utf-8' },
};
const OPN_UI_ASSETS = {
    '/ui/opn': { file: 'index.html', contentType: 'text/html; charset=utf-8' },
    '/assets/opn-ui.css': { file: 'opn-ui.css', contentType: 'text/css; charset=utf-8' },
    '/assets/opn-ui.js': { file: 'opn-ui.js', contentType: 'text/javascript; charset=utf-8' },
};
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
        if (request.method === 'GET' && url.pathname === '/ui/connection') {
            if (!validSession(request, sessions, now)) {
                blocked(response, 401, 'ui-session-required');
                return;
            }
            if (!input.upstream.connection) {
                blocked(response, 503, 'connection-read-model-unavailable');
                return;
            }
            try {
                json(response, 200, await input.upstream.connection());
            }
            catch {
                blocked(response, 503, 'connection-read-model-unavailable');
            }
            return;
        }
        if (request.method === 'GET' && url.pathname === '/ui/inbox') {
            if (!validSession(request, sessions, now)) {
                blocked(response, 401, 'ui-session-required');
                return;
            }
            if (!input.upstream.messages) {
                blocked(response, 503, 'inbox-read-model-unavailable');
                return;
            }
            try {
                json(response, 200, { schema: HUMAN_APPROVAL_UI_SCHEMA, status: 'ok', network_id: input.network_id, ...(await input.upstream.messages()), side_effects_executed: false });
            }
            catch {
                blocked(response, 503, 'inbox-read-model-unavailable');
            }
            return;
        }
        if (request.method === 'GET' && url.pathname === '/ui/graph-atoms') {
            if (!validSession(request, sessions, now)) {
                blocked(response, 401, 'ui-session-required');
                return;
            }
            if (!input.upstream.graphAtoms) {
                blocked(response, 503, 'graph-atom-read-model-unavailable');
                return;
            }
            try {
                json(response, 200, { schema: HUMAN_APPROVAL_UI_SCHEMA, status: 'ok', network_id: input.network_id, ...(await input.upstream.graphAtoms()), side_effects_executed: false });
            }
            catch {
                blocked(response, 503, 'graph-atom-read-model-unavailable');
            }
            return;
        }
        if (request.method === 'GET' && url.pathname === '/ui/human-actions') {
            if (!validSession(request, sessions, now)) {
                blocked(response, 401, 'ui-session-required');
                return;
            }
            if (!input.upstream.humanActions) {
                blocked(response, 503, 'human-actions-read-model-unavailable');
                return;
            }
            try {
                json(response, 200, { schema: HUMAN_APPROVAL_UI_SCHEMA, status: 'ok', network_id: input.network_id, ...(await input.upstream.humanActions()), side_effects_executed: false });
            }
            catch {
                blocked(response, 503, 'human-actions-read-model-unavailable');
            }
            return;
        }
        const actionDecisionMatch = request.method === 'POST' ? url.pathname.match(/^\/ui\/human-actions\/([^/]+)\/decision$/) : null;
        if (actionDecisionMatch) {
            if (!validSession(request, sessions, now)) {
                blocked(response, 401, 'ui-session-required');
                return;
            }
            if (request.headers.origin !== `http://${request.headers.host}`) {
                blocked(response, 403, 'ui-origin-invalid');
                return;
            }
            if (!input.upstream.humanActions || !input.upstream.decideHumanAction) {
                blocked(response, 503, 'human-action-decision-unavailable');
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
            const requestId = decodeURIComponent(actionDecisionMatch[1]);
            const requestDigest = typeof body.request_digest === 'string' ? body.request_digest : '';
            const decision = body.decision === 'approved' || body.decision === 'rejected' ? body.decision : null;
            const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
            if (!requestDigest || !decision || !reason) {
                blocked(response, 400, 'human-action-decision-input-invalid');
                return;
            }
            let current;
            try {
                current = (await input.upstream.humanActions()).requests.find((item) => item.request_id === requestId);
            }
            catch {
                blocked(response, 503, 'human-actions-read-model-unavailable');
                return;
            }
            if (!current) {
                blocked(response, 404, 'human-action-request-not-found');
                return;
            }
            if (current.network_id !== input.network_id || current.status !== 'pending' || current.request_digest !== requestDigest) {
                blocked(response, 409, 'human-action-state-conflict');
                return;
            }
            let signed;
            try {
                signed = await createHumanActionDecision({ signer: input.signer, request: current, decision, reason, decided_at: now() });
            }
            catch {
                blocked(response, 400, 'human-action-decision-signing-failed');
                return;
            }
            let result;
            try {
                result = await input.upstream.decideHumanAction({ network_id: input.network_id, request: current, decision: signed });
            }
            catch {
                blocked(response, 503, 'human-action-decision-forwarding-failed');
                return;
            }
            json(response, 201, { schema: HUMAN_APPROVAL_UI_SCHEMA, status: 'recorded', request_id: requestId, decision: signed, result, side_effects_executed: true });
            return;
        }
        if (request.method === 'GET' && url.pathname === '/ui/events') {
            if (!validSession(request, sessions, now)) {
                blocked(response, 401, 'ui-session-required');
                return;
            }
            if (!input.graph) {
                blocked(response, 503, 'graph-upstream-unavailable');
                return;
            }
            try {
                const result = await input.graph.list();
                const events = result.events.map((event) => ({ event_id: event.event.event_id, title: event.event.title, created_at: event.event.created_at, status: event.status, network_id: event.network_id, plan: event.plan, next_action: event.next_action, blocking_reasons: event.blocking_reasons }));
                json(response, 200, { schema: HUMAN_APPROVAL_UI_SCHEMA, status: 'ok', network_id: input.network_id, events, side_effects_executed: false });
            }
            catch {
                blocked(response, 503, 'graph-upstream-unavailable');
            }
            return;
        }
        const graphAcceptMatch = request.method === 'POST' ? url.pathname.match(/^\/ui\/events\/([^/]+)\/accept$/) : null;
        if (graphAcceptMatch) {
            if (!validSession(request, sessions, now)) {
                blocked(response, 401, 'ui-session-required');
                return;
            }
            if (request.headers.origin !== `http://${request.headers.host}`) {
                blocked(response, 403, 'ui-origin-invalid');
                return;
            }
            if (!input.graph?.accept) {
                blocked(response, 503, 'graph-upstream-acceptance-unavailable');
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
            const eventId = decodeURIComponent(graphAcceptMatch[1]);
            const fields = ['network_id', 'plan_id', 'plan_digest', 'review_handoff_digest', 'verification_digest'];
            if (fields.some((field) => typeof body[field] !== 'string' || !body[field].trim()) || !Number.isInteger(body.plan_revision)) {
                blocked(response, 400, 'ui-acceptance-input-invalid');
                return;
            }
            let current;
            try {
                current = (await input.graph.get({ event_id: eventId })).event;
            }
            catch {
                blocked(response, 503, 'graph-upstream-unavailable');
                return;
            }
            if (!current || current.network_id !== input.network_id || current.event.event_id !== eventId) {
                blocked(response, 404, 'graph-event-not-found');
                return;
            }
            if (current.status !== 'review-ready') {
                blocked(response, 409, 'graph-event-not-review-ready');
                return;
            }
            if (body.network_id !== current.network_id || body.plan_id !== current.plan.plan_id || body.plan_revision !== current.plan.plan_revision || body.plan_digest !== current.plan.plan_digest || body.review_handoff_digest !== current.review_handoff.handoff_digest || body.verification_digest !== current.verification.verification_digest) {
                blocked(response, 409, 'graph-acceptance-scope-conflict');
                return;
            }
            let result;
            try {
                result = await input.graph.accept({ network_id: input.network_id, event_id: eventId, plan_id: current.plan.plan_id, plan_revision: current.plan.plan_revision, plan_digest: current.plan.plan_digest, review_handoff_digest: current.review_handoff.handoff_digest, verification_digest: current.verification.verification_digest, accepted_at: now(), signer: input.signer });
            }
            catch {
                blocked(response, 503, 'graph-upstream-acceptance-unavailable');
                return;
            }
            const status = result.status;
            const statusCode = status === 'recorded' ? 201 : status === 'duplicate' ? 200 : status === 'conflict' || status === 'blocked' ? 409 : 503;
            json(response, statusCode, { schema: HUMAN_APPROVAL_UI_SCHEMA, ...result, side_effects_executed: false });
            return;
        }
        const graphEventMatch = request.method === 'GET' ? url.pathname.match(/^\/ui\/events\/([^/]+)$/) : null;
        if (graphEventMatch) {
            if (!validSession(request, sessions, now)) {
                blocked(response, 401, 'ui-session-required');
                return;
            }
            if (!input.graph) {
                blocked(response, 503, 'graph-upstream-unavailable');
                return;
            }
            try {
                const result = await input.graph.get({ event_id: decodeURIComponent(graphEventMatch[1]) });
                if (!result.event || result.event.network_id !== input.network_id || result.event.event.event_id !== decodeURIComponent(graphEventMatch[1])) {
                    blocked(response, 404, 'graph-event-not-found');
                    return;
                }
                json(response, 200, { schema: HUMAN_APPROVAL_UI_SCHEMA, status: 'ok', network_id: input.network_id, event: result.event, side_effects_executed: false });
            }
            catch {
                blocked(response, 503, 'graph-upstream-unavailable');
            }
            return;
        }
        const graphEvidenceMatch = request.method === 'GET' ? url.pathname.match(/^\/ui\/events\/([^/]+)\/evidence$/) : null;
        if (graphEvidenceMatch) {
            if (!validSession(request, sessions, now)) {
                blocked(response, 401, 'ui-session-required');
                return;
            }
            if (!input.graph) {
                blocked(response, 503, 'graph-upstream-unavailable');
                return;
            }
            try {
                const eventId = decodeURIComponent(graphEvidenceMatch[1]);
                const result = await input.graph.evidence({ event_id: eventId });
                json(response, 200, { schema: HUMAN_APPROVAL_UI_SCHEMA, status: 'ok', network_id: input.network_id, event_id: eventId, evidence: result.evidence, side_effects_executed: false });
            }
            catch {
                blocked(response, 503, 'graph-upstream-unavailable');
            }
            return;
        }
        if (request.method === 'GET' && GRAPH_UI_ASSETS[url.pathname]) {
            const asset = GRAPH_UI_ASSETS[url.pathname];
            try {
                const content = await readFile(path.join(GRAPH_UI_ROOT, asset.file));
                response.statusCode = 200;
                response.setHeader('content-type', asset.contentType);
                response.setHeader('content-length', content.byteLength);
                response.end(content);
            }
            catch {
                blocked(response, 503, 'graph-ui-assets-unavailable');
            }
            return;
        }
        if (request.method === 'GET' && OPN_UI_ASSETS[url.pathname]) {
            const asset = OPN_UI_ASSETS[url.pathname];
            try {
                const content = await readFile(path.join(OPN_UI_ROOT, asset.file));
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
            if (!input.human_device?.device_key_id?.trim() || !/^[0-9a-f]{64}$/.test(input.human_device.device_fingerprint)) {
                blocked(response, 400, 'human-device-binding-required');
                return;
            }
            const context = await signApprovalContext({ signer: input.signer, network_id: input.network_id, human_device: input.human_device, action: 'pairing.approve', request_id: requestId, request_digest: requestDigest, approved_capabilities: capabilities, issued_at: now(), expires_at: expiresAt });
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
        async connection() {
            return requestPairingApi(input, `${pathFor('/v1/connection')}`, 'GET');
        },
        async messages() {
            if (!input.network_id?.trim())
                throw new Error('pairing-upstream-network-id-required');
            const result = await requestPairingApi(input, `${pathFor('/v1/owner/inbox')}?network_id=${encodeURIComponent(input.network_id)}`, 'GET');
            return { messages: Array.isArray(result.messages) ? result.messages : [] };
        },
        async humanActions() {
            if (!input.network_id?.trim())
                throw new Error('pairing-upstream-network-id-required');
            const result = await requestPairingApi(input, `${pathFor('/v1/owner/human-actions')}?network_id=${encodeURIComponent(input.network_id)}`, 'GET');
            return { requests: Array.isArray(result.requests) ? result.requests : [] };
        },
        async decideHumanAction(value) {
            return requestPairingApi(input, pathFor(`/v1/owner/human-actions/${encodeURIComponent(value.request.request_id)}/decision`), 'POST', { network_id: value.network_id, request_digest: value.request.request_digest, decision: value.decision });
        },
        async list({ network_id }) {
            const result = await requestPairingApi(input, `${pathFor('/v1/owner/pairing-requests')}?network_id=${encodeURIComponent(network_id)}`, 'GET');
            return { requests: Array.isArray(result.requests) ? result.requests : [] };
        },
        async approve(value) {
            if (!input.device_fingerprint || !input.cert)
                throw new Error('human-device-binding-unavailable');
            let peerFingerprint;
            try {
                peerFingerprint = createHash('sha256').update(new X509Certificate(input.cert).raw).digest('hex');
            }
            catch {
                throw new Error('human-device-binding-invalid');
            }
            if (peerFingerprint !== input.device_fingerprint)
                throw new Error('human-device-binding-mismatch');
            return requestPairingApi(input, pathFor(`/v1/owner/pairing-requests/${encodeURIComponent(value.request_id)}/approve`), 'POST', { network_id: value.network_id, request_digest: value.request_digest, approved_capabilities: value.approved_capabilities, context: value.context });
        },
        async reject(value) {
            return requestPairingApi(input, pathFor(`/v1/owner/pairing-requests/${encodeURIComponent(value.request_id)}/reject`), 'POST', { network_id: value.network_id, request_digest: value.request_digest, reason: value.reason, context: value.context });
        },
    };
}
