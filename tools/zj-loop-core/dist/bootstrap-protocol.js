import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
import { parseBoundedJson } from './parse-bounded-json.js';
const MAX_FRAME_BYTES = 64 * 1024;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
export const BOOTSTRAP_CHANNEL_ROLES = Object.freeze(['secret', 'identity-binding', 'status']);
export const BOOTSTRAP_REASON_DESCRIPTORS = Object.freeze([
    Object.freeze({ code: 'bootstrap-secret-timeout', lifecycle_stage: 'secret', default_outcome: 'blocked', requires_human_review: true, allows_new_attempt: true, detail_policy: 'field-name-length-and-digest-only' }),
    Object.freeze({ code: 'bootstrap-auth-ready-timeout', lifecycle_stage: 'auth-ready', default_outcome: 'blocked', requires_human_review: true, allows_new_attempt: true, detail_policy: 'field-name-length-and-digest-only' }),
    Object.freeze({ code: 'bootstrap-binding-invalid', lifecycle_stage: 'identity-binding', default_outcome: 'blocked', requires_human_review: true, allows_new_attempt: true, detail_policy: 'field-name-length-and-digest-only' }),
    Object.freeze({ code: 'bootstrap-runtime-ready-timeout', lifecycle_stage: 'runtime-ready', default_outcome: 'blocked', requires_human_review: true, allows_new_attempt: true, detail_policy: 'field-name-length-and-digest-only' }),
    Object.freeze({ code: 'bootstrap-worker-connection-timeout', lifecycle_stage: 'worker-connection', default_outcome: 'blocked', requires_human_review: true, allows_new_attempt: true, detail_policy: 'field-name-length-and-digest-only' }),
    Object.freeze({ code: 'bootstrap-worker-peer-identity-invalid', lifecycle_stage: 'worker-handshake', default_outcome: 'blocked', requires_human_review: true, allows_new_attempt: true, detail_policy: 'field-name-length-and-digest-only' }),
    Object.freeze({ code: 'bootstrap-worker-hello-invalid', lifecycle_stage: 'worker-handshake', default_outcome: 'blocked', requires_human_review: true, allows_new_attempt: true, detail_policy: 'field-name-length-and-digest-only' }),
    Object.freeze({ code: 'bootstrap-cleanup-uncertain', lifecycle_stage: 'cleanup', default_outcome: 'outcome-uncertain', requires_human_review: true, allows_new_attempt: true, detail_policy: 'bounded-cleanup-summary' }),
]);
export const BOOTSTRAP_PROTOCOL_PROFILE = Object.freeze({
    schema: 'zj-loop.bootstrap_protocol_profile.v1',
    profile_id: 'bootstrap-protocol-v1-2026-08',
    canonicalization: 'jcs-rfc8785',
    frame: Object.freeze({ prefix_bytes: 4, length_encoding: 'uint32be', max_frame_bytes: MAX_FRAME_BYTES, one_frame_per_buffer: true }),
    channel_roles: BOOTSTRAP_CHANNEL_ROLES,
    directions: Object.freeze({
        secret: 'trusted-runner-to-sidecar',
        'identity-binding': 'trusted-runner-to-sidecar',
        status: 'sidecar-to-trusted-runner',
    }),
    reason_descriptors: BOOTSTRAP_REASON_DESCRIPTORS,
    worker_inherited_channels: Object.freeze([]),
});
export const BOOTSTRAP_INITIAL_LIFECYCLE = Object.freeze({ schema: 'zj-loop.bootstrap_lifecycle.v1', execution_id: '', attempt: 0, stage: 'created', status: 'pending', last_now_ms: 0, history: Object.freeze(['created']) });
function canonical(value) {
    const result = canonicalize(value);
    if (typeof result !== 'string')
        throw new Error('bootstrap-canonicalization-invalid');
    return result;
}
function digest(value) {
    return `sha256:${createHash('sha256').update(canonical(value)).digest('hex')}`;
}
function assertDigest(value, field) {
    if (typeof value !== 'string' || !DIGEST.test(value))
        throw new Error(`bootstrap-${field}-invalid`);
}
function assertRole(value) {
    if (typeof value !== 'string' || !BOOTSTRAP_CHANNEL_ROLES.includes(value))
        throw new Error('bootstrap-channel-role-invalid');
}
export function bootstrapProfileSha256() {
    return digest(BOOTSTRAP_PROTOCOL_PROFILE);
}
export function getBootstrapReasonDescriptor(code) {
    return BOOTSTRAP_REASON_DESCRIPTORS.find((descriptor) => descriptor.code === code);
}
const LIFECYCLE_TRANSITIONS = Object.freeze({
    created: Object.freeze({ arm: 'channels-armed' }),
    'channels-armed': Object.freeze({ 'sidecar-started': 'sidecar-started' }),
    'sidecar-started': Object.freeze({ 'auth-ready': 'auth-ready' }),
    'auth-ready': Object.freeze({ 'binding-verified': 'binding-verified' }),
    'binding-verified': Object.freeze({ 'runtime-ready': 'runtime-ready' }),
    'runtime-ready': Object.freeze({ 'worker-connected': 'worker-connected' }),
    'worker-connected': Object.freeze({ 'worker-accepted': 'worker-accepted' }),
    'worker-accepted': Object.freeze({}),
    cleanup: Object.freeze({}),
});
export function advanceBootstrapLifecycle(current, event) {
    if (!current || current.schema !== 'zj-loop.bootstrap_lifecycle.v1' || !Number.isInteger(event.now_ms) || event.now_ms < current.last_now_ms)
        throw new Error('bootstrap-lifecycle-clock-invalid');
    if (current.status === 'blocked' || current.status === 'outcome-uncertain')
        throw new Error('bootstrap-lifecycle-terminal');
    if (event.type === 'cleanup-uncertain')
        return Object.freeze({ ...current, stage: 'cleanup', status: 'outcome-uncertain', reason_code: 'bootstrap-cleanup-uncertain', last_now_ms: event.now_ms, history: Object.freeze([...current.history, 'cleanup']) });
    if (event.type === 'fail') {
        const descriptor = getBootstrapReasonDescriptor(event.reason_code);
        if (!descriptor)
            throw new Error('bootstrap-reason-code-unknown');
        return Object.freeze({ ...current, status: descriptor.default_outcome, reason_code: descriptor.code, last_now_ms: event.now_ms, history: Object.freeze([...current.history, current.stage]) });
    }
    const next = LIFECYCLE_TRANSITIONS[current.stage]?.[event.type];
    if (!next)
        throw new Error('bootstrap-lifecycle-transition-invalid');
    const status = next === 'worker-accepted' ? 'runtime-ready' : current.status;
    return Object.freeze({ ...current, stage: next, status, last_now_ms: event.now_ms, history: Object.freeze([...current.history, next]) });
}
export function createBootstrapBinding(input) {
    if (!input || typeof input !== 'object' || !input.identity || !input.execution)
        throw new Error('bootstrap-binding-input-invalid');
    if (input.identity.schema !== 'zj-loop.worker_identity_facts.v1' || typeof input.identity.platform !== 'string' || typeof input.identity.kind !== 'string')
        throw new Error('bootstrap-identity-facts-invalid');
    assertDigest(input.identity.executable_digest, 'executable-digest');
    if (input.identity.signer_digest !== undefined)
        assertDigest(input.identity.signer_digest, 'signer-digest');
    if (typeof input.execution.network_id !== 'string' || typeof input.execution.execution_id !== 'string' || !Number.isInteger(input.execution.attempt) || input.execution.attempt < 1 || typeof input.execution.provider_id !== 'string' || typeof input.execution.execution_binding_nonce !== 'string' || input.execution.execution_binding_nonce.length < 16)
        throw new Error('bootstrap-execution-context-invalid');
    const identity_digest = digest(input.identity);
    const execution_binding_digest = digest(input.execution);
    const binding = {
        schema: 'zj-loop.bootstrap_binding.v1',
        bootstrap_profile_sha256: bootstrapProfileSha256(),
        identity_digest,
        execution_binding_digest,
        execution_binding_nonce: input.execution.execution_binding_nonce,
    };
    return Object.freeze({ ...binding, binding_digest: digest(binding) });
}
export function encodeBootstrapFrame(frame) {
    if (!frame || typeof frame !== 'object' || frame.schema !== 'zj-loop.bootstrap_frame.v1')
        throw new Error('bootstrap-frame-invalid');
    assertRole(frame.channel_role);
    const payload = new TextEncoder().encode(canonical(frame));
    if (payload.byteLength > MAX_FRAME_BYTES)
        throw new Error('bootstrap-frame-limit-exceeded');
    const result = new Uint8Array(4 + payload.byteLength);
    new DataView(result.buffer).setUint32(0, payload.byteLength);
    result.set(payload, 4);
    return result;
}
export function decodeBootstrapFrame(input) {
    if (!(input instanceof Uint8Array) || input.byteLength < 5)
        throw new Error('bootstrap-frame-invalid');
    const length = new DataView(input.buffer, input.byteOffset, 4).getUint32(0);
    if (length > MAX_FRAME_BYTES)
        throw new Error('bootstrap-frame-limit-exceeded');
    if (input.byteLength !== length + 4)
        throw new Error(input.byteLength > length + 4 ? 'bootstrap-frame-multiple' : 'bootstrap-frame-truncated');
    const value = parseBoundedJson(input.subarray(4));
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('bootstrap-frame-invalid');
    const frame = value;
    if (frame.schema !== 'zj-loop.bootstrap_frame.v1')
        throw new Error('bootstrap-frame-invalid');
    assertRole(frame.channel_role);
    if (!Object.hasOwn(frame, 'payload'))
        throw new Error('bootstrap-frame-invalid');
    if (canonical(value) !== new TextDecoder().decode(input.subarray(4)))
        throw new Error('bootstrap-frame-not-canonical');
    return frame;
}
function directionFor(role) {
    return BOOTSTRAP_PROTOCOL_PROFILE.directions[role];
}
export function createBootstrapTransportFixture() {
    const channels = new Map();
    const send = async (actor, role, value) => {
        assertRole(role);
        const expectedActor = directionFor(role).split('-to-')[0];
        if (actor !== expectedActor)
            throw new Error('bootstrap-channel-direction-invalid');
        const state = channels.get(role) ?? { closed: false };
        if (state.closed || state.frame !== undefined)
            throw new Error('bootstrap-channel-closed');
        state.frame = structuredClone(value);
        channels.set(role, state);
    };
    const receive = async (actor, role) => {
        assertRole(role);
        const expectedActor = directionFor(role).split('-to-')[1];
        if (actor !== expectedActor)
            throw new Error('bootstrap-channel-actor-invalid');
        const state = channels.get(role);
        if (!state || state.closed || state.frame === undefined)
            throw new Error('bootstrap-channel-closed');
        state.closed = true;
        const value = state.frame;
        state.frame = undefined;
        return value;
    };
    const sendEncoded = async (actor, role, frame, chunks) => {
        assertRole(role);
        const expectedActor = directionFor(role).split('-to-')[0];
        if (actor !== expectedActor)
            throw new Error('bootstrap-channel-direction-invalid');
        const state = channels.get(role) ?? { closed: false };
        if (state.closed || state.frame !== undefined || state.chunks !== undefined)
            throw new Error('bootstrap-channel-closed');
        const encoded = encodeBootstrapFrame(frame);
        const sizes = chunks && chunks.length > 0 ? [...chunks] : [encoded.byteLength];
        if (sizes.some((size) => !Number.isInteger(size) || size < 1) || sizes.reduce((total, size) => total + size, 0) !== encoded.byteLength)
            throw new Error('bootstrap-chunk-schedule-invalid');
        const values = [];
        let offset = 0;
        for (const size of sizes) {
            values.push(encoded.slice(offset, offset + size));
            offset += size;
        }
        state.chunks = values;
        channels.set(role, state);
    };
    const receiveEncoded = async (actor, role, input) => {
        assertRole(role);
        if (!Number.isInteger(input.now_ms) || !Number.isInteger(input.deadline_ms) || input.deadline_ms < 0 || input.now_ms < 0)
            throw new Error('bootstrap-clock-invalid');
        const expectedActor = directionFor(role).split('-to-')[1];
        if (actor !== expectedActor)
            throw new Error('bootstrap-channel-actor-invalid');
        const state = channels.get(role);
        if (!state || state.closed || !state.chunks)
            throw new Error('bootstrap-channel-closed');
        if (input.now_ms > input.deadline_ms) {
            state.closed = true;
            state.chunks = undefined;
            throw new Error('bootstrap-channel-timeout');
        }
        state.closed = true;
        const total = state.chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
        const encoded = new Uint8Array(total);
        let offset = 0;
        for (const chunk of state.chunks) {
            encoded.set(chunk, offset);
            offset += chunk.byteLength;
        }
        state.chunks = undefined;
        return decodeBootstrapFrame(encoded);
    };
    return {
        trustedRunner: {
            send: (role, value) => send('trusted-runner', role, value),
            receive: (role) => receive('trusted-runner', role),
            sendEncoded: (role, frame, chunks) => sendEncoded('trusted-runner', role, frame, chunks),
            receiveEncoded: (role, input) => receiveEncoded('trusted-runner', role, input),
        },
        sidecar: {
            send: (role, value) => send('sidecar', role, value),
            receive: (role) => receive('sidecar', role),
            sendEncoded: (role, frame, chunks) => sendEncoded('sidecar', role, frame, chunks),
            receiveEncoded: (role, input) => receiveEncoded('sidecar', role, input),
        },
        worker: { receive: (role) => receive('worker', role), receiveEncoded: (role, input) => receiveEncoded('worker', role, input), inherited_channels: () => [] },
    };
}
