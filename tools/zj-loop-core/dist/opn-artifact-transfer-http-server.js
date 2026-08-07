import { createHash } from 'node:crypto';
import { OPN_ARTIFACT_MAX_BYTES } from './opn-artifact-store.js';
export const OPN_ARTIFACT_TRANSFER_SCHEMA = 'zj-loop.opn_artifact_transfer.v1';
export const OPN_ARTIFACT_TRANSFER_AGGREGATE = 'opn-artifact-transfer';
export const OPN_ARTIFACT_OFFERED_EVENT = 'opn.artifact.offered';
export const OPN_ARTIFACT_STORED_EVENT = 'opn.artifact.stored';
export const OPN_ARTIFACT_VERIFIED_EVENT = 'opn.artifact.verified';
function json(response, statusCode, value) {
    const encoded = JSON.stringify(value);
    response.statusCode = statusCode;
    response.setHeader('content-type', 'application/json; charset=utf-8');
    response.setHeader('content-length', Buffer.byteLength(encoded));
    response.end(encoded);
}
function blocked(response, statusCode, reason) {
    json(response, statusCode, { schema: OPN_ARTIFACT_TRANSFER_SCHEMA, status: 'blocked', reason, side_effects_executed: false });
}
function bearer(request) {
    const value = request.headers.authorization;
    return typeof value === 'string' && /^Bearer\s+\S+$/.test(value) ? value.replace(/^Bearer\s+/, '') : null;
}
function header(request, name) {
    const value = request.headers[name];
    if (Array.isArray(value))
        return value[0] ?? '';
    return value ?? '';
}
async function jsonBody(request) {
    const declared = Number(request.headers['content-length'] ?? 0);
    if (declared > 64 * 1024)
        throw new Error('opn-artifact-metadata-too-large');
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
        const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += part.length;
        if (size > 64 * 1024)
            throw new Error('opn-artifact-metadata-too-large');
        chunks.push(part);
    }
    if (!size)
        throw new Error('json-body-required');
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('json-object-required');
    return value;
}
async function bytesBody(request, maxBytes) {
    const declared = Number(request.headers['content-length'] ?? 0);
    if (!Number.isInteger(declared) || declared < 0 || declared > maxBytes)
        throw new Error('opn-artifact-size-invalid');
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
        const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += part.length;
        if (size > maxBytes)
            throw new Error('opn-artifact-too-large');
        chunks.push(part);
    }
    if (size !== declared)
        throw new Error('opn-artifact-size-mismatch');
    return Buffer.concat(chunks);
}
function digest(value) { return `sha256:${createHash('sha256').update(value).digest('hex')}`; }
function eventId(type, transfer) { return `${type}:${transfer.transfer_id}:${transfer.metadata.artifact_id}`; }
function payloadOf(event) {
    const value = event.payload;
    return value.schema === OPN_ARTIFACT_TRANSFER_SCHEMA && value.transfer ? value : null;
}
export async function projectOpnArtifactTransfers(input) {
    const events = (await input.stateStore.readEvents({ network_id: input.network_id, aggregate_type: OPN_ARTIFACT_TRANSFER_AGGREGATE })).events;
    const records = new Map();
    for (const event of events) {
        const payload = payloadOf(event);
        if (!payload)
            continue;
        const prior = records.get(payload.transfer.transfer_id);
        records.set(payload.transfer.transfer_id, { ...payload.transfer, status: event.event_type === OPN_ARTIFACT_VERIFIED_EVENT ? 'verified' : event.event_type === OPN_ARTIFACT_STORED_EVENT ? 'stored' : prior?.status ?? 'offered' });
    }
    return [...records.values()];
}
export function createOpnArtifactTransferHttpService(input) {
    if (!input.network_id.trim())
        throw new Error('opn-artifact-network-id-required');
    if (!input.stateStore || !input.artifactStore || !input.credentialVerifier)
        throw new Error('opn-artifact-transfer-dependency-required');
    const now = input.now ?? (() => new Date().toISOString());
    const maxBytes = input.max_bytes ?? OPN_ARTIFACT_MAX_BYTES;
    const authorize = async (request, node_id) => {
        const value = bearer(request);
        if (!value)
            return { status: 'blocked', reason: 'opn-artifact-credential-required' };
        const result = await Promise.resolve(input.credentialVerifier.verify({ token: value, node_id, network_id: input.network_id, operation: 'opn.artifact', required_capabilities: [] }));
        return result.status === 'allowed' ? { status: 'allowed' } : { status: 'blocked', reason: result.reason ?? 'opn-artifact-credential-invalid' };
    };
    const append = async (transfer, event_type) => {
        const current = await input.stateStore.getRevision(input.network_id);
        const result = await input.stateStore.appendEvent({ network_id: input.network_id, expected_revision: current, now: now(), event: { event_id: eventId(event_type, transfer), aggregate_type: OPN_ARTIFACT_TRANSFER_AGGREGATE, aggregate_id: transfer.transfer_id, event_type, occurred_at: now(), payload: { schema: OPN_ARTIFACT_TRANSFER_SCHEMA, transfer } } });
        return result.status;
    };
    return {
        async handle({ request, response, node_id }) {
            const url = new URL(request.url ?? '/', 'https://opn-artifact.local');
            if (!url.pathname.startsWith('/v1/artifacts'))
                return false;
            const auth = await authorize(request, node_id);
            if (auth.status !== 'allowed') {
                blocked(response, 403, auth.reason);
                return true;
            }
            if (request.method === 'POST' && url.pathname === '/v1/artifacts') {
                let value;
                try {
                    value = await jsonBody(request);
                }
                catch (error) {
                    blocked(response, 400, error instanceof Error ? error.message : 'opn-artifact-metadata-invalid');
                    return true;
                }
                const metadata = value.metadata && typeof value.metadata === 'object' && !Array.isArray(value.metadata) ? value.metadata : null;
                const transfer_id = typeof value.transfer_id === 'string' ? value.transfer_id : '';
                const target_node_id = typeof value.target_node_id === 'string' ? value.target_node_id : '';
                if (!metadata || metadata.schema !== 'zj-loop.opn_artifact.v1' || typeof metadata.artifact_id !== 'string' || typeof metadata.content_sha256 !== 'string' || typeof metadata.size_bytes !== 'number' || typeof metadata.file_name !== 'string' || typeof metadata.media_type !== 'string' || !transfer_id.trim() || !target_node_id.trim() || metadata.artifact_id !== metadata.content_sha256 || !/^sha256:[0-9a-f]{64}$/.test(metadata.artifact_id) || !Number.isInteger(metadata.size_bytes) || metadata.size_bytes < 0 || metadata.size_bytes > maxBytes) {
                    blocked(response, 400, 'opn-artifact-metadata-invalid');
                    return true;
                }
                const transfer = { metadata: metadata, transfer_id, sender_node_id: node_id, target_node_id, status: 'offered' };
                const existing = (await projectOpnArtifactTransfers({ stateStore: input.stateStore, network_id: input.network_id })).find((item) => item.transfer_id === transfer_id);
                if (existing) {
                    if (JSON.stringify(existing.metadata) !== JSON.stringify(transfer.metadata) || existing.sender_node_id !== node_id) {
                        blocked(response, 409, 'opn-artifact-transfer-conflict');
                        return true;
                    }
                    json(response, 200, { schema: OPN_ARTIFACT_TRANSFER_SCHEMA, status: existing.status, transfer_id, artifact_id: existing.metadata.artifact_id, side_effects_executed: false });
                    return true;
                }
                const result = await append(transfer, OPN_ARTIFACT_OFFERED_EVENT);
                if (result === 'conflict') {
                    blocked(response, 409, 'opn-artifact-transfer-conflict');
                    return true;
                }
                json(response, 202, { schema: OPN_ARTIFACT_TRANSFER_SCHEMA, status: 'offered', transfer_id, artifact_id: transfer.metadata.artifact_id, side_effects_executed: false });
                return true;
            }
            const match = url.pathname.match(/^\/v1\/artifacts\/(.+)$/);
            if (!match) {
                blocked(response, 404, 'route-not-found');
                return true;
            }
            let artifact_id;
            try {
                artifact_id = decodeURIComponent(match[1]);
            }
            catch {
                blocked(response, 400, 'opn-artifact-digest-invalid');
                return true;
            }
            if (!/^sha256:[0-9a-f]{64}$/.test(artifact_id)) {
                blocked(response, 400, 'opn-artifact-digest-invalid');
                return true;
            }
            const transfers = await projectOpnArtifactTransfers({ stateStore: input.stateStore, network_id: input.network_id });
            const transfer = transfers.find((item) => item.metadata.artifact_id === artifact_id && (item.sender_node_id === node_id || item.target_node_id === node_id));
            if (!transfer) {
                blocked(response, 404, 'opn-artifact-not-found');
                return true;
            }
            if (request.method === 'PUT') {
                if (transfer.sender_node_id !== node_id) {
                    blocked(response, 403, 'opn-artifact-sender-required');
                    return true;
                }
                let bytes;
                try {
                    bytes = await bytesBody(request, maxBytes);
                }
                catch (error) {
                    blocked(response, 400, error instanceof Error ? error.message : 'opn-artifact-body-invalid');
                    return true;
                }
                if (bytes.byteLength !== transfer.metadata.size_bytes || digest(bytes) !== artifact_id) {
                    blocked(response, 400, digest(bytes) !== artifact_id ? 'opn-artifact-digest-mismatch' : 'opn-artifact-size-mismatch');
                    return true;
                }
                const stored = await input.artifactStore.put({ bytes, file_name: transfer.metadata.file_name, media_type: transfer.metadata.media_type, expected_digest: artifact_id });
                const storedTransfer = { ...transfer, status: 'stored' };
                await append(storedTransfer, OPN_ARTIFACT_STORED_EVENT);
                await append({ ...storedTransfer, status: 'verified' }, OPN_ARTIFACT_VERIFIED_EVENT);
                json(response, stored.status === 'duplicate' ? 200 : 201, { schema: OPN_ARTIFACT_TRANSFER_SCHEMA, status: 'verified', transfer_id: transfer.transfer_id, artifact_id, content_sha256: artifact_id, size_bytes: bytes.byteLength, side_effects_executed: false });
                return true;
            }
            if (request.method === 'GET') {
                try {
                    const value = await input.artifactStore.read(artifact_id);
                    response.statusCode = 200;
                    response.setHeader('content-type', value.metadata.media_type);
                    response.setHeader('content-length', value.bytes.byteLength);
                    response.setHeader('x-opn-artifact-digest', artifact_id);
                    response.end(value.bytes);
                }
                catch {
                    blocked(response, 409, 'opn-artifact-integrity-failed');
                }
                return true;
            }
            blocked(response, 405, 'method-not-allowed');
            return true;
        },
    };
}
