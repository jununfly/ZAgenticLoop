import { createServer } from 'node:https';
import { createHash } from 'node:crypto';
export const STATE_STORE_HTTP_SCHEMA = 'zj-loop.state_store_http.v1';
const MAX_HTTP_BODY_BYTES = 512 * 1024;
function sendJson(response, statusCode, body) {
    const encoded = JSON.stringify(body);
    response.statusCode = statusCode;
    response.setHeader('content-type', 'application/json; charset=utf-8');
    response.setHeader('content-length', Buffer.byteLength(encoded));
    response.end(encoded);
}
async function readJsonBody(request) {
    const declaredLength = Number(request.headers['content-length'] ?? 0);
    if (declaredLength > MAX_HTTP_BODY_BYTES)
        throw new Error('payload-too-large');
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.length;
        if (size > MAX_HTTP_BODY_BYTES)
            throw new Error('payload-too-large');
        chunks.push(buffer);
    }
    if (size === 0)
        throw new Error('json-body-required');
    try {
        return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    }
    catch {
        throw new Error('json-invalid');
    }
}
export function createStateStoreServer(input) {
    return createServer({ ...input.tls, requestCert: true, rejectUnauthorized: false }, async (request, response) => {
        if (request.method === 'GET' && request.url === '/healthz') {
            sendJson(response, 200, { schema: STATE_STORE_HTTP_SCHEMA, status: 'ok', side_effects_executed: false });
            return;
        }
        if (!request.socket.authorized) {
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
            let body;
            try {
                body = await readJsonBody(request);
            }
            catch (error) {
                const reason = error instanceof Error ? error.message : 'json-invalid';
                sendJson(response, reason === 'payload-too-large' ? 413 : 400, { schema: STATE_STORE_HTTP_SCHEMA, status: 'blocked', reason, side_effects_executed: false });
                return;
            }
            if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || typeof body.network_id !== 'string' || 'owner_id' in body) {
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
                const result = await input.store.createNetwork({ network_id: body.network_id, owner_id: human.human_id });
                if (result.status === 'conflict') {
                    sendJson(response, 409, { schema: STATE_STORE_HTTP_SCHEMA, status: 'blocked', reason: result.reason ?? 'network-conflict', side_effects_executed: false });
                }
                else {
                    sendJson(response, result.status === 'recorded' ? 201 : 200, { schema: STATE_STORE_HTTP_SCHEMA, status: 'ok', network_id: body.network_id, owner_id: human.human_id, revision: result.revision, side_effects_executed: result.status === 'recorded' });
                }
            }
            catch {
                sendJson(response, 503, { schema: STATE_STORE_HTTP_SCHEMA, status: 'blocked', reason: 'state-store-failure', side_effects_executed: false });
            }
            return;
        }
        const eventMatch = url.pathname.match(/^\/v1\/networks\/([^/]+)\/events$/);
        if (request.method === 'POST' && eventMatch) {
            let body;
            try {
                body = await readJsonBody(request);
            }
            catch (error) {
                const reason = error instanceof Error ? error.message : 'json-invalid';
                sendJson(response, reason === 'payload-too-large' ? 413 : 400, { schema: STATE_STORE_HTTP_SCHEMA, status: 'blocked', reason, side_effects_executed: false });
                return;
            }
            const networkId = decodeURIComponent(eventMatch[1]);
            const eventBody = body;
            const event = eventBody && typeof eventBody === 'object' && !Array.isArray(eventBody) ? eventBody.event : undefined;
            const eventKeys = event && typeof event === 'object' && !Array.isArray(event) ? Object.keys(event).sort() : [];
            const bodyKeys = body && typeof body === 'object' && !Array.isArray(body) ? Object.keys(body).sort() : [];
            if (bodyKeys.join(',') !== 'event,expected_revision' || !Number.isInteger(eventBody.expected_revision) || eventBody.expected_revision < 1 || !event || Array.isArray(event) || eventKeys.join(',') !== 'aggregate_id,aggregate_type,event_id,event_type,occurred_at,payload' || Object.values(event).some((value) => value === undefined) || !['event_id', 'aggregate_type', 'aggregate_id', 'event_type', 'occurred_at'].every((key) => typeof event[key] === 'string')) {
                sendJson(response, 400, { schema: STATE_STORE_HTTP_SCHEMA, status: 'blocked', reason: 'event-request-invalid', side_effects_executed: false });
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
            const peer = request.socket.getPeerCertificate();
            if (!peer.raw) {
                sendJson(response, 401, { schema: STATE_STORE_HTTP_SCHEMA, status: 'blocked', reason: 'client-identity-unavailable', side_effects_executed: false });
                return;
            }
            const verification = await Promise.resolve(input.credentialVerifier.verify({
                token: authorization.replace(/^Bearer\s+/, ''),
                node_id: createHash('sha256').update(peer.raw).digest('hex'),
                network_id: networkId,
                operation: `${request.method} ${url.pathname}`,
                event_id: event.event_id,
                task_id: event.aggregate_type === 'task' ? event.aggregate_id : undefined,
            }));
            if (verification.status !== 'allowed') {
                sendJson(response, 403, { schema: STATE_STORE_HTTP_SCHEMA, status: 'blocked', reason: verification.reason ?? 'credential-invalid', side_effects_executed: false });
                return;
            }
            if (!input.store) {
                sendJson(response, 503, { schema: STATE_STORE_HTTP_SCHEMA, status: 'blocked', reason: 'state-store-unavailable', side_effects_executed: false });
                return;
            }
            try {
                const result = await input.store.appendEvent({ network_id: networkId, expected_revision: eventBody.expected_revision, event: event });
                if (result.status === 'conflict') {
                    sendJson(response, 409, { schema: STATE_STORE_HTTP_SCHEMA, status: 'blocked', reason: result.reason ?? 'event-conflict', current_revision: result.current_revision, side_effects_executed: false });
                }
                else {
                    sendJson(response, result.status === 'recorded' ? 201 : 200, { schema: STATE_STORE_HTTP_SCHEMA, status: result.status, network_id: networkId, event_id: event.event_id, revision: result.revision, current_revision: result.current_revision, side_effects_executed: result.status === 'recorded' });
                }
            }
            catch (error) {
                const reason = error instanceof Error ? error.message : 'state-store-failure';
                const statusCode = reason === 'network-not-found' ? 404 : ['event-id-required', 'aggregate-type-required', 'aggregate-id-required', 'event-type-required', 'event-occurred-at-required', 'payload-json-invalid', 'payload-json-circular', 'payload-too-large', 'expected-revision-invalid'].includes(reason) ? 400 : 503;
                sendJson(response, statusCode, { schema: STATE_STORE_HTTP_SCHEMA, status: 'blocked', reason, side_effects_executed: false });
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
        const peer = request.socket.getPeerCertificate();
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
        const eventReadMatch = url.pathname.match(/^\/v1\/networks\/([^/]+)\/events$/);
        if (request.method === 'GET' && eventReadMatch) {
            if (!input.store) {
                sendJson(response, 503, { schema: STATE_STORE_HTTP_SCHEMA, status: 'blocked', reason: 'state-store-unavailable', side_effects_executed: false });
                return;
            }
            const afterRevisionText = url.searchParams.get('after_revision');
            const afterRevision = afterRevisionText === null ? undefined : Number(afterRevisionText);
            if (afterRevisionText !== null && (afterRevision === undefined || !Number.isInteger(afterRevision) || afterRevision < 0)) {
                sendJson(response, 400, { schema: STATE_STORE_HTTP_SCHEMA, status: 'blocked', reason: 'after-revision-invalid', side_effects_executed: false });
                return;
            }
            try {
                const networkId = decodeURIComponent(eventReadMatch[1]);
                const snapshot = await input.store.readEvents({
                    network_id: networkId,
                    after_revision: afterRevision,
                    aggregate_type: url.searchParams.get('aggregate_type') ?? undefined,
                    aggregate_id: url.searchParams.get('aggregate_id') ?? undefined,
                });
                sendJson(response, 200, { schema: STATE_STORE_HTTP_SCHEMA, status: 'ok', network_id: networkId, snapshot_revision: snapshot.snapshot_revision, events: snapshot.events, side_effects_executed: false });
            }
            catch (error) {
                const reason = error instanceof Error && error.message === 'network-not-found' ? 'network-not-found' : 'state-store-failure';
                sendJson(response, reason === 'network-not-found' ? 404 : 503, { schema: STATE_STORE_HTTP_SCHEMA, status: 'blocked', reason, side_effects_executed: false });
            }
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
            }
            catch (error) {
                const reason = error instanceof Error && error.message === 'network-not-found' ? 'network-not-found' : 'state-store-failure';
                sendJson(response, reason === 'network-not-found' ? 404 : 503, { schema: STATE_STORE_HTTP_SCHEMA, status: 'blocked', reason, side_effects_executed: false });
            }
            return;
        }
        sendJson(response, 404, { schema: STATE_STORE_HTTP_SCHEMA, status: 'blocked', reason: 'route-not-found', side_effects_executed: false });
    });
}
