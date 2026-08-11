import { createHash, randomUUID } from 'node:crypto';
import { validateTransportEnvelope } from './transport-contract.js';
export const OPN_TRANSPORT_HTTP_SCHEMA = 'zj-loop.opn_transport_http.v1';
export const OPN_TRANSPORT_MESSAGE_AGGREGATE = 'opn-transport-message';
export const OPN_TRANSPORT_OFFERED_EVENT = 'opn.transport.message.offered';
export const OPN_TRANSPORT_ACKNOWLEDGED_EVENT = 'opn.transport.message.acknowledged';
export const OPN_TRANSPORT_CANCELLED_EVENT = 'opn.transport.message.cancelled';
const MAX_RECEIVE_WAIT_MS = 30_000;
const RECEIVE_RECHECK_MS = 250;
function json(response, statusCode, body) {
    const encoded = JSON.stringify(body);
    response.statusCode = statusCode;
    response.setHeader('content-type', 'application/json; charset=utf-8');
    response.setHeader('content-length', Buffer.byteLength(encoded));
    response.end(encoded);
}
function blocked(response, statusCode, reason) {
    json(response, statusCode, { schema: OPN_TRANSPORT_HTTP_SCHEMA, status: 'blocked', reason, side_effects_executed: false });
}
async function body(request) {
    const declared = Number(request.headers['content-length'] ?? 0);
    if (declared > 64 * 1024)
        throw new Error('transport-request-too-large');
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
        const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += value.length;
        if (size > 64 * 1024)
            throw new Error('transport-request-too-large');
        chunks.push(value);
    }
    if (size === 0)
        throw new Error('json-body-required');
    let parsed;
    try {
        parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    }
    catch {
        throw new Error('json-invalid');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        throw new Error('json-object-required');
    return parsed;
}
function token(request) {
    const value = request.headers.authorization;
    return typeof value === 'string' && /^Bearer\s+\S+$/.test(value) ? value.replace(/^Bearer\s+/, '') : null;
}
function digest(value) {
    return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex').slice(0, 32);
}
function offeredEventId(envelope) {
    return `${OPN_TRANSPORT_OFFERED_EVENT}:${envelope.message_id}:${envelope.envelope_digest}`;
}
function acknowledgedEventId(envelope) {
    return `${OPN_TRANSPORT_ACKNOWLEDGED_EVENT}:${envelope.message_id}:${envelope.envelope_digest}`;
}
function cancelledEventId(envelope) {
    return `${OPN_TRANSPORT_CANCELLED_EVENT}:${envelope.message_id}:${envelope.envelope_digest}`;
}
function messagePayload(event) {
    const value = event.payload;
    return value.schema === OPN_TRANSPORT_HTTP_SCHEMA && value.envelope ? value : null;
}
export function createOpnTransportHttpService(input) {
    if (!input.network_id.trim())
        throw new Error('opn-transport-network-id-required');
    if (!input.stateStore)
        throw new Error('opn-transport-state-store-required');
    if (!input.credentialVerifier)
        throw new Error('opn-transport-credential-verifier-required');
    const now = input.now ?? (() => new Date().toISOString());
    const sessionTtl = input.session_ttl_ms ?? 50 * 60 * 1000;
    if (!Number.isInteger(sessionTtl) || sessionTtl <= 0)
        throw new Error('opn-transport-session-ttl-invalid');
    const sessions = new Map();
    async function authorize(request, session, node_id) {
        const bearer = token(request);
        if (!bearer)
            return { status: 'blocked', reason: 'transport-credential-required' };
        if (session.node_id !== node_id)
            return { status: 'blocked', reason: 'transport-session-node-mismatch' };
        if (Date.parse(now()) >= Date.parse(session.expires_at))
            return { status: 'blocked', reason: 'transport-session-expired' };
        const result = await Promise.resolve(input.credentialVerifier.verify({ token: bearer, node_id, network_id: session.network_id, operation: 'opn.transport', required_capabilities: [] }));
        if (result.status !== 'allowed' || result.credential_id !== session.credential_id)
            return { status: 'blocked', reason: result.reason ?? 'transport-credential-invalid' };
        return { status: 'allowed' };
    }
    async function messages() {
        const events = (await input.stateStore.readEvents({ network_id: input.network_id, aggregate_type: OPN_TRANSPORT_MESSAGE_AGGREGATE })).events;
        const result = new Map();
        for (const event of events) {
            const payload = messagePayload(event);
            if (!payload)
                continue;
            if (event.event_type === OPN_TRANSPORT_OFFERED_EVENT)
                result.set(payload.envelope.message_id, { envelope: payload.envelope, acknowledged: false, cancelled: false });
            if (event.event_type === OPN_TRANSPORT_ACKNOWLEDGED_EVENT && result.has(payload.envelope.message_id))
                result.get(payload.envelope.message_id).acknowledged = true;
            if (event.event_type === OPN_TRANSPORT_CANCELLED_EVENT && result.has(payload.envelope.message_id))
                result.get(payload.envelope.message_id).cancelled = true;
        }
        return result;
    }
    async function appendCancelled(envelope, reason) {
        const current = await input.stateStore.getRevision(input.network_id);
        const result = await input.stateStore.appendEvent({ network_id: input.network_id, expected_revision: current, now: now(), event: { event_id: cancelledEventId(envelope), aggregate_type: OPN_TRANSPORT_MESSAGE_AGGREGATE, aggregate_id: envelope.message_id, event_type: OPN_TRANSPORT_CANCELLED_EVENT, occurred_at: now(), payload: { schema: OPN_TRANSPORT_HTTP_SCHEMA, envelope, reason } } });
        return result.status;
    }
    async function appendEnvelope(envelope) {
        const existing = (await input.stateStore.readEvents({ network_id: input.network_id, aggregate_type: OPN_TRANSPORT_MESSAGE_AGGREGATE, aggregate_id: envelope.message_id })).events.find((event) => event.event_type === OPN_TRANSPORT_OFFERED_EVENT);
        if (existing) {
            const payload = messagePayload(existing);
            return payload?.envelope.envelope_digest === envelope.envelope_digest ? 'duplicate' : 'conflict';
        }
        const current = await input.stateStore.getRevision(input.network_id);
        const result = await input.stateStore.appendEvent({ network_id: input.network_id, expected_revision: current, now: now(), event: { event_id: offeredEventId(envelope), aggregate_type: OPN_TRANSPORT_MESSAGE_AGGREGATE, aggregate_id: envelope.message_id, event_type: OPN_TRANSPORT_OFFERED_EVENT, occurred_at: envelope.created_at, payload: { schema: OPN_TRANSPORT_HTTP_SCHEMA, envelope } } });
        return result.status;
    }
    async function appendAck(envelope) {
        const existing = (await input.stateStore.readEvents({ network_id: input.network_id, aggregate_type: OPN_TRANSPORT_MESSAGE_AGGREGATE, aggregate_id: envelope.message_id })).events.find((event) => event.event_type === OPN_TRANSPORT_ACKNOWLEDGED_EVENT);
        if (existing)
            return 'duplicate';
        const current = await input.stateStore.getRevision(input.network_id);
        const result = await input.stateStore.appendEvent({ network_id: input.network_id, expected_revision: current, now: now(), event: { event_id: acknowledgedEventId(envelope), aggregate_type: OPN_TRANSPORT_MESSAGE_AGGREGATE, aggregate_id: envelope.message_id, event_type: OPN_TRANSPORT_ACKNOWLEDGED_EVENT, occurred_at: now(), payload: { schema: OPN_TRANSPORT_HTTP_SCHEMA, envelope } } });
        return result.status;
    }
    async function waitForPending(node_id, wait_ms, request, expires_at) {
        const expiry = Date.parse(expires_at);
        const clock = () => Date.parse(now());
        const deadline = Math.min(Date.now() + wait_ms, Date.now() + Math.max(0, expiry - clock()));
        while (true) {
            const pending = [...(await messages()).values()].find((message) => message.envelope.target_node_id === node_id && !message.acknowledged && !message.cancelled);
            if (pending)
                return { envelope: pending.envelope };
            if (clock() >= expiry)
                return { expired: true };
            if (wait_ms === 0 || Date.now() >= deadline || request.aborted || request.destroyed)
                return null;
            await new Promise((resolve) => setTimeout(resolve, Math.min(RECEIVE_RECHECK_MS, Math.max(1, deadline - Date.now()))));
        }
    }
    return {
        async handle({ request, response, node_id }) {
            const url = new URL(request.url ?? '/', 'https://opn-transport.local');
            if (!url.pathname.startsWith('/v1/transport/'))
                return false;
            const sessionMatch = url.pathname.match(/^\/v1\/transport\/sessions\/([^/]+)(?:\/([^/]+))?(?:\/([^/]+))?$/);
            const sessionId = sessionMatch ? decodeURIComponent(sessionMatch[1]) : null;
            const action = sessionMatch?.[2] ?? null;
            const suffix = sessionMatch?.[3] ?? null;
            if (request.method === 'POST' && url.pathname === '/v1/transport/sessions') {
                let value;
                try {
                    value = await body(request);
                }
                catch (error) {
                    blocked(response, 400, error instanceof Error ? error.message : 'json-invalid');
                    return true;
                }
                if (Object.keys(value).sort().join(',') !== 'network_id,node_id,protocol_version' || value.network_id !== input.network_id || value.node_id !== node_id || typeof value.protocol_version !== 'string' || !value.protocol_version.trim()) {
                    blocked(response, 400, 'transport-session-request-invalid');
                    return true;
                }
                const bearer = token(request);
                if (!bearer) {
                    blocked(response, 401, 'transport-credential-required');
                    return true;
                }
                const verification = await Promise.resolve(input.credentialVerifier.verify({ token: bearer, node_id, network_id: input.network_id, operation: 'opn.transport', required_capabilities: [] }));
                if (verification.status !== 'allowed' || !verification.credential_id || !verification.expires_at) {
                    blocked(response, 403, verification.reason ?? 'transport-credential-invalid');
                    return true;
                }
                const session = { session_id: `ots_${randomUUID().replaceAll('-', '')}`, network_id: input.network_id, node_id, credential_id: verification.credential_id, expires_at: new Date(Math.min(Date.parse(verification.expires_at), Date.parse(now()) + sessionTtl)).toISOString() };
                sessions.set(session.session_id, session);
                json(response, 201, { schema: OPN_TRANSPORT_HTTP_SCHEMA, status: 'created', session, side_effects_executed: false });
                return true;
            }
            if (!sessionId || !sessionMatch || (action !== null && suffix === null && action !== 'envelopes' && action !== 'ack') || (action === 'envelopes' && suffix !== null)) {
                blocked(response, 404, 'route-not-found');
                return true;
            }
            const session = sessions.get(sessionId);
            if (!session) {
                blocked(response, 404, 'transport-session-not-found');
                return true;
            }
            const authorization = await authorize(request, session, node_id);
            if (authorization.status !== 'allowed') {
                blocked(response, authorization.reason === 'transport-session-expired' ? 410 : 403, authorization.reason);
                return true;
            }
            if (request.method === 'DELETE' && action === null) {
                sessions.delete(sessionId);
                response.statusCode = 204;
                response.end();
                return true;
            }
            if (request.method === 'POST' && action === 'envelopes') {
                let value;
                try {
                    value = await body(request);
                }
                catch (error) {
                    blocked(response, 400, error instanceof Error ? error.message : 'json-invalid');
                    return true;
                }
                const validation = validateTransportEnvelope(value);
                if (validation.status !== 'valid') {
                    blocked(response, 400, validation.reason);
                    return true;
                }
                const envelope = value;
                if (envelope.network_id !== input.network_id || envelope.from_node_id !== node_id || envelope.from_node_id === envelope.target_node_id) {
                    blocked(response, 403, envelope.network_id !== input.network_id ? 'transport-network-mismatch' : envelope.from_node_id !== node_id ? 'transport-sender-identity-mismatch' : 'transport-self-target-forbidden');
                    return true;
                }
                const result = await appendEnvelope(envelope);
                if (result === 'conflict') {
                    blocked(response, 409, 'transport-message-conflict');
                    return true;
                }
                json(response, result === 'recorded' ? 202 : 200, { schema: OPN_TRANSPORT_HTTP_SCHEMA, status: result === 'recorded' ? 'accepted' : 'duplicate', message_id: envelope.message_id, envelope_digest: envelope.envelope_digest, side_effects_executed: false });
                return true;
            }
            if (request.method === 'GET' && action === 'envelopes') {
                const rawWait = url.searchParams.get('wait_ms');
                const waitMs = rawWait === null ? 0 : Number(rawWait);
                if (!Number.isInteger(waitMs) || waitMs < 0 || waitMs > MAX_RECEIVE_WAIT_MS) {
                    blocked(response, 400, 'transport-receive-wait-invalid');
                    return true;
                }
                const pending = await waitForPending(node_id, waitMs, request, session.expires_at);
                if (pending && 'expired' in pending) {
                    blocked(response, 410, 'transport-session-expired');
                    return true;
                }
                if (!pending) {
                    response.statusCode = 204;
                    response.end();
                    return true;
                }
                json(response, 200, pending.envelope);
                return true;
            }
            if (request.method === 'POST' && action === 'cancel') {
                let value;
                try {
                    value = await body(request);
                }
                catch (error) {
                    blocked(response, 400, error instanceof Error ? error.message : 'json-invalid');
                    return true;
                }
                if (Object.keys(value).sort().join(',') !== 'envelope_digest,message_id,reason' || typeof value.message_id !== 'string' || typeof value.envelope_digest !== 'string' || typeof value.reason !== 'string' || !value.reason.trim()) {
                    blocked(response, 400, 'transport-cancel-request-invalid');
                    return true;
                }
                const message = (await messages()).get(value.message_id);
                if (!message || message.envelope.from_node_id !== node_id || message.envelope.envelope_digest !== value.envelope_digest) {
                    blocked(response, 409, 'transport-cancel-message-mismatch');
                    return true;
                }
                if (message.acknowledged) {
                    blocked(response, 409, 'transport-cancel-after-ack');
                    return true;
                }
                const cancelled = await appendCancelled(message.envelope, value.reason);
                json(response, 200, { schema: OPN_TRANSPORT_HTTP_SCHEMA, status: cancelled === 'duplicate' ? 'duplicate' : 'accepted', message_id: message.envelope.message_id, envelope_digest: message.envelope.envelope_digest, reason: value.reason, side_effects_executed: false });
                return true;
            }
            if (request.method === 'POST' && action === 'ack') {
                let value;
                try {
                    value = await body(request);
                }
                catch (error) {
                    blocked(response, 400, error instanceof Error ? error.message : 'json-invalid');
                    return true;
                }
                if (Object.keys(value).sort().join(',') !== 'envelope_digest,message_id' || typeof value.message_id !== 'string' || typeof value.envelope_digest !== 'string') {
                    blocked(response, 400, 'transport-ack-request-invalid');
                    return true;
                }
                const message = (await messages()).get(value.message_id);
                if (!message || message.envelope.target_node_id !== node_id || message.envelope.envelope_digest !== value.envelope_digest) {
                    blocked(response, 409, 'transport-ack-message-mismatch');
                    return true;
                }
                const result = await appendAck(message.envelope);
                if (result === 'conflict') {
                    blocked(response, 409, 'transport-ack-conflict');
                    return true;
                }
                json(response, 200, { schema: OPN_TRANSPORT_HTTP_SCHEMA, status: result === 'duplicate' ? 'duplicate' : 'accepted', message_id: message.envelope.message_id, envelope_digest: message.envelope.envelope_digest, side_effects_executed: false });
                return true;
            }
            blocked(response, 404, 'route-not-found');
            return true;
        },
    };
}
