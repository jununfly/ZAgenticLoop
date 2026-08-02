import canonicalize from 'canonicalize';
export const PROVIDER_AUTH_IPC_FRAME_SCHEMA = 'zj-loop.provider_auth_ipc_frame.v1';
export const PROVIDER_AUTH_IPC_MAX_FRAME_BYTES = 64 * 1024;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const ID = /^[^\s]{1,256}$/;
const KINDS = ['challenge', 'launch-accepted', 'stdout', 'stderr', 'result', 'error', 'exit', 'cleanup'];
const FRAME_KEYS = new Set(['schema', 'version', 'kind', 'correlation_id', 'sequence', 'network_id', 'node_id', 'provider_runtime_id', 'provider_id', 'execution_id', 'attempt', 'nonce', 'launch_handle_digest', 'payload']);
function canonical(value) {
    const json = canonicalize(value);
    if (typeof json !== 'string')
        throw new Error('provider-auth-ipc-canonicalization-invalid');
    return json;
}
function validId(value) { return typeof value === 'string' && ID.test(value); }
function validDigest(value) { return typeof value === 'string' && DIGEST.test(value); }
function validateFrameShape(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return { status: 'blocked', reason: 'provider-auth-ipc-frame-object-invalid' };
    const item = value;
    if (Object.keys(item).some((key) => !FRAME_KEYS.has(key)))
        return { status: 'blocked', reason: 'provider-auth-ipc-frame-field-invalid' };
    if (item.schema !== PROVIDER_AUTH_IPC_FRAME_SCHEMA || item.version !== 1 || !KINDS.includes(item.kind))
        return { status: 'blocked', reason: 'provider-auth-ipc-frame-schema-invalid' };
    for (const key of ['correlation_id', 'network_id', 'node_id', 'provider_runtime_id', 'provider_id', 'execution_id'])
        if (!validId(item[key]))
            return { status: 'blocked', reason: `provider-auth-ipc-frame-${key}-invalid` };
    if (!Number.isInteger(item.sequence) || item.sequence < 1 || !Number.isInteger(item.attempt) || item.attempt < 1)
        return { status: 'blocked', reason: 'provider-auth-ipc-frame-sequence-invalid' };
    if (item.nonce !== undefined && !validId(item.nonce))
        return { status: 'blocked', reason: 'provider-auth-ipc-frame-nonce-invalid' };
    if (item.launch_handle_digest !== undefined && !validDigest(item.launch_handle_digest))
        return { status: 'blocked', reason: 'provider-auth-ipc-frame-launch-handle-invalid' };
    if (item.payload !== undefined && typeof item.payload !== 'string' && (!item.payload || typeof item.payload !== 'object' || Array.isArray(item.payload)))
        return { status: 'blocked', reason: 'provider-auth-ipc-frame-payload-invalid' };
    const kind = item.kind;
    if (kind === 'challenge' && !validId(item.nonce))
        return { status: 'blocked', reason: 'provider-auth-ipc-challenge-nonce-required' };
    if (['launch-accepted', 'stdout', 'stderr', 'result', 'error', 'exit', 'cleanup'].includes(kind) && !validDigest(item.launch_handle_digest))
        return { status: 'blocked', reason: 'provider-auth-ipc-launch-handle-required' };
    if (['stdout', 'stderr', 'result', 'error', 'exit', 'cleanup'].includes(kind) && item.payload === undefined)
        return { status: 'blocked', reason: 'provider-auth-ipc-payload-required' };
    return { status: 'valid' };
}
export function createProviderAuthIpcFrame(input) {
    const frame = { schema: PROVIDER_AUTH_IPC_FRAME_SCHEMA, version: 1, ...structuredClone(input) };
    if (validateProviderAuthIpcFrame(frame).status === 'blocked')
        throw new Error('provider-auth-ipc-frame-invalid');
    return frame;
}
export function validateProviderAuthIpcFrame(value) {
    return validateFrameShape(value);
}
export function encodeProviderAuthIpcFrame(frame) {
    const validation = validateProviderAuthIpcFrame(frame);
    if (validation.status === 'blocked')
        throw new Error(validation.reason);
    const bytes = new TextEncoder().encode(canonical(frame));
    if (bytes.byteLength > PROVIDER_AUTH_IPC_MAX_FRAME_BYTES)
        throw new Error('provider-auth-ipc-frame-too-large');
    const output = new Uint8Array(4 + bytes.byteLength);
    new DataView(output.buffer).setUint32(0, bytes.byteLength, false);
    output.set(bytes, 4);
    return output;
}
export class ProviderAuthIpcDecoder {
    buffer = new Uint8Array(0);
    expectedSequence = 1;
    correlationId;
    constructor(input = {}) { this.correlationId = input.correlation_id; }
    push(chunk) {
        const merged = new Uint8Array(this.buffer.byteLength + chunk.byteLength);
        merged.set(this.buffer);
        merged.set(chunk, this.buffer.byteLength);
        this.buffer = merged;
        const frames = [];
        while (this.buffer.byteLength >= 4) {
            const size = new DataView(this.buffer.buffer, this.buffer.byteOffset, 4).getUint32(0, false);
            if (size < 2 || size > PROVIDER_AUTH_IPC_MAX_FRAME_BYTES)
                return { status: 'blocked', reason: 'provider-auth-ipc-frame-length-invalid' };
            if (this.buffer.byteLength < size + 4)
                break;
            const payload = this.buffer.slice(4, size + 4);
            this.buffer = this.buffer.slice(size + 4);
            let frame;
            try {
                frame = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(payload));
            }
            catch {
                return { status: 'blocked', reason: 'provider-auth-ipc-frame-json-invalid' };
            }
            const validation = validateProviderAuthIpcFrame(frame);
            if (validation.status === 'blocked')
                return validation;
            const typed = frame;
            if (this.correlationId !== undefined && typed.correlation_id !== this.correlationId)
                return { status: 'blocked', reason: 'provider-auth-ipc-correlation-mismatch' };
            if (typed.sequence !== this.expectedSequence)
                return { status: 'blocked', reason: 'provider-auth-ipc-sequence-mismatch' };
            this.expectedSequence += 1;
            frames.push(typed);
        }
        return { status: 'accepted', frames };
    }
    finish() {
        return this.buffer.byteLength === 0 ? { status: 'accepted', frames: [] } : { status: 'blocked', reason: 'provider-auth-ipc-frame-truncated' };
    }
}
