import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
import { parseBoundedJson } from './parse-bounded-json.js';

const MAX_FRAME_BYTES = 64 * 1024;
const DIGEST = /^sha256:[0-9a-f]{64}$/;

export const BOOTSTRAP_CHANNEL_ROLES = Object.freeze(['secret', 'identity-binding', 'status'] as const);
export type BootstrapChannelRole = (typeof BOOTSTRAP_CHANNEL_ROLES)[number];

export type BootstrapReasonDescriptor = {
  code: string;
  lifecycle_stage: 'secret' | 'auth-ready' | 'identity-binding' | 'runtime-ready' | 'worker-connection' | 'worker-handshake' | 'cleanup';
  default_outcome: 'blocked' | 'outcome-uncertain';
  requires_human_review: boolean;
  allows_new_attempt: boolean;
  detail_policy: 'field-name-length-and-digest-only' | 'bounded-cleanup-summary';
};

export const BOOTSTRAP_REASON_DESCRIPTORS: readonly BootstrapReasonDescriptor[] = Object.freeze([
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
  worker_inherited_channels: Object.freeze([] as const),
});

export type BootstrapIdentityFacts = {
  schema: 'zj-loop.worker_identity_facts.v1';
  platform: string;
  kind: string;
  executable_digest: string;
  signer_digest?: string;
  [key: string]: unknown;
};

export type BootstrapExecutionContext = {
  network_id: string;
  execution_id: string;
  attempt: number;
  provider_id: string;
  execution_binding_nonce: string;
  [key: string]: unknown;
};

export type BootstrapBinding = {
  schema: 'zj-loop.bootstrap_binding.v1';
  bootstrap_profile_sha256: string;
  identity_digest: string;
  execution_binding_digest: string;
  execution_binding_nonce: string;
  binding_digest: string;
};

export type BootstrapFrame = {
  schema: string;
  channel_role: BootstrapChannelRole;
  payload: unknown;
};

export type BootstrapLifecycleStage = 'created' | 'channels-armed' | 'sidecar-started' | 'auth-ready' | 'binding-verified' | 'runtime-ready' | 'worker-connected' | 'worker-accepted' | 'cleanup';
export type BootstrapLifecycleStatus = 'pending' | 'runtime-ready' | 'blocked' | 'outcome-uncertain';
export type BootstrapLifecycle = {
  schema: 'zj-loop.bootstrap_lifecycle.v1';
  execution_id: string;
  attempt: number;
  stage: BootstrapLifecycleStage;
  status: BootstrapLifecycleStatus;
  last_now_ms: number;
  reason_code?: string;
  history: readonly BootstrapLifecycleStage[];
};

export const BOOTSTRAP_INITIAL_LIFECYCLE: BootstrapLifecycle = Object.freeze({ schema: 'zj-loop.bootstrap_lifecycle.v1', execution_id: '', attempt: 0, stage: 'created', status: 'pending', last_now_ms: 0, history: Object.freeze(['created'] as const) });

function canonical(value: unknown): string {
  const result = canonicalize(value);
  if (typeof result !== 'string') throw new Error('bootstrap-canonicalization-invalid');
  return result;
}

function digest(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonical(value)).digest('hex')}`;
}

function assertDigest(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || !DIGEST.test(value)) throw new Error(`bootstrap-${field}-invalid`);
}

function assertRole(value: unknown): asserts value is BootstrapChannelRole {
  if (typeof value !== 'string' || !(BOOTSTRAP_CHANNEL_ROLES as readonly string[]).includes(value)) throw new Error('bootstrap-channel-role-invalid');
}

export function bootstrapProfileSha256(): string {
  return digest(BOOTSTRAP_PROTOCOL_PROFILE);
}

export function getBootstrapReasonDescriptor(code: unknown): BootstrapReasonDescriptor | undefined {
  return BOOTSTRAP_REASON_DESCRIPTORS.find((descriptor) => descriptor.code === code);
}

type BootstrapLifecycleEvent =
  | { type: 'arm'; now_ms: number }
  | { type: 'sidecar-started'; now_ms: number }
  | { type: 'auth-ready'; now_ms: number }
  | { type: 'binding-verified'; now_ms: number }
  | { type: 'runtime-ready'; now_ms: number }
  | { type: 'worker-connected'; now_ms: number }
  | { type: 'worker-accepted'; now_ms: number }
  | { type: 'fail'; now_ms: number; reason_code: string }
  | { type: 'cleanup-uncertain'; now_ms: number };

const LIFECYCLE_TRANSITIONS: Readonly<Record<BootstrapLifecycleStage, Partial<Record<BootstrapLifecycleEvent['type'], BootstrapLifecycleStage>>>> = Object.freeze({
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

export function advanceBootstrapLifecycle(current: BootstrapLifecycle, event: BootstrapLifecycleEvent): BootstrapLifecycle {
  if (!current || current.schema !== 'zj-loop.bootstrap_lifecycle.v1' || !Number.isInteger(event.now_ms) || event.now_ms < current.last_now_ms) throw new Error('bootstrap-lifecycle-clock-invalid');
  if (current.status === 'blocked' || current.status === 'outcome-uncertain') throw new Error('bootstrap-lifecycle-terminal');
  if (event.type === 'cleanup-uncertain') return Object.freeze({ ...current, stage: 'cleanup', status: 'outcome-uncertain', reason_code: 'bootstrap-cleanup-uncertain', last_now_ms: event.now_ms, history: Object.freeze([...current.history, 'cleanup'] as BootstrapLifecycleStage[]) });
  if (event.type === 'fail') {
    const descriptor = getBootstrapReasonDescriptor(event.reason_code);
    if (!descriptor) throw new Error('bootstrap-reason-code-unknown');
    return Object.freeze({ ...current, status: descriptor.default_outcome, reason_code: descriptor.code, last_now_ms: event.now_ms, history: Object.freeze([...current.history, current.stage] as BootstrapLifecycleStage[]) });
  }
  const next = LIFECYCLE_TRANSITIONS[current.stage]?.[event.type];
  if (!next) throw new Error('bootstrap-lifecycle-transition-invalid');
  const status = next === 'worker-accepted' ? 'runtime-ready' : current.status;
  return Object.freeze({ ...current, stage: next, status, last_now_ms: event.now_ms, history: Object.freeze([...current.history, next] as BootstrapLifecycleStage[]) });
}

export function createBootstrapBinding(input: { identity: BootstrapIdentityFacts; execution: BootstrapExecutionContext }): BootstrapBinding {
  if (!input || typeof input !== 'object' || !input.identity || !input.execution) throw new Error('bootstrap-binding-input-invalid');
  if (input.identity.schema !== 'zj-loop.worker_identity_facts.v1' || typeof input.identity.platform !== 'string' || typeof input.identity.kind !== 'string') throw new Error('bootstrap-identity-facts-invalid');
  assertDigest(input.identity.executable_digest, 'executable-digest');
  if (input.identity.signer_digest !== undefined) assertDigest(input.identity.signer_digest, 'signer-digest');
  if (typeof input.execution.network_id !== 'string' || typeof input.execution.execution_id !== 'string' || !Number.isInteger(input.execution.attempt) || input.execution.attempt < 1 || typeof input.execution.provider_id !== 'string' || typeof input.execution.execution_binding_nonce !== 'string' || input.execution.execution_binding_nonce.length < 16) throw new Error('bootstrap-execution-context-invalid');
  const identity_digest = digest(input.identity);
  const execution_binding_digest = digest(input.execution);
  const binding = {
    schema: 'zj-loop.bootstrap_binding.v1' as const,
    bootstrap_profile_sha256: bootstrapProfileSha256(),
    identity_digest,
    execution_binding_digest,
    execution_binding_nonce: input.execution.execution_binding_nonce,
  };
  return Object.freeze({ ...binding, binding_digest: digest(binding) });
}

export function encodeBootstrapFrame(frame: BootstrapFrame): Uint8Array {
  if (!frame || typeof frame !== 'object' || frame.schema !== 'zj-loop.bootstrap_frame.v1') throw new Error('bootstrap-frame-invalid');
  assertRole(frame.channel_role);
  const payload = new TextEncoder().encode(canonical(frame));
  if (payload.byteLength > MAX_FRAME_BYTES) throw new Error('bootstrap-frame-limit-exceeded');
  const result = new Uint8Array(4 + payload.byteLength);
  new DataView(result.buffer).setUint32(0, payload.byteLength);
  result.set(payload, 4);
  return result;
}

export function decodeBootstrapFrame(input: Uint8Array): BootstrapFrame {
  if (!(input instanceof Uint8Array) || input.byteLength < 5) throw new Error('bootstrap-frame-invalid');
  const length = new DataView(input.buffer, input.byteOffset, 4).getUint32(0);
  if (length > MAX_FRAME_BYTES) throw new Error('bootstrap-frame-limit-exceeded');
  if (input.byteLength !== length + 4) throw new Error(input.byteLength > length + 4 ? 'bootstrap-frame-multiple' : 'bootstrap-frame-truncated');
  const value = parseBoundedJson(input.subarray(4));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('bootstrap-frame-invalid');
  const frame = value as Record<string, unknown>;
  if (frame.schema !== 'zj-loop.bootstrap_frame.v1') throw new Error('bootstrap-frame-invalid');
  assertRole(frame.channel_role);
  if (!Object.hasOwn(frame, 'payload')) throw new Error('bootstrap-frame-invalid');
  if (canonical(value) !== new TextDecoder().decode(input.subarray(4))) throw new Error('bootstrap-frame-not-canonical');
  return frame as unknown as BootstrapFrame;
}

type Actor = 'trusted-runner' | 'sidecar' | 'worker';
type Direction = 'trusted-runner-to-sidecar' | 'sidecar-to-trusted-runner';

function directionFor(role: BootstrapChannelRole): Direction {
  return BOOTSTRAP_PROTOCOL_PROFILE.directions[role] as Direction;
}

export function createBootstrapTransportFixture() {
  const channels = new Map<BootstrapChannelRole, { frame?: unknown; chunks?: Uint8Array[]; closed: boolean }>();
  const send = async (actor: Actor, role: BootstrapChannelRole, value: unknown): Promise<void> => {
    assertRole(role);
    const expectedActor = directionFor(role).split('-to-')[0] as Actor;
    if (actor !== expectedActor) throw new Error('bootstrap-channel-direction-invalid');
    const state = channels.get(role) ?? { closed: false };
    if (state.closed || state.frame !== undefined) throw new Error('bootstrap-channel-closed');
    state.frame = structuredClone(value);
    channels.set(role, state);
  };
  const receive = async (actor: Actor, role: BootstrapChannelRole): Promise<unknown> => {
    assertRole(role);
    const expectedActor = directionFor(role).split('-to-')[1] as Actor;
    if (actor !== expectedActor) throw new Error('bootstrap-channel-actor-invalid');
    const state = channels.get(role);
    if (!state || state.closed || state.frame === undefined) throw new Error('bootstrap-channel-closed');
    state.closed = true;
    const value = state.frame;
    state.frame = undefined;
    return value;
  };
  const sendEncoded = async (actor: Actor, role: BootstrapChannelRole, frame: BootstrapFrame, chunks?: readonly number[]): Promise<void> => {
    assertRole(role);
    const expectedActor = directionFor(role).split('-to-')[0] as Actor;
    if (actor !== expectedActor) throw new Error('bootstrap-channel-direction-invalid');
    const state = channels.get(role) ?? { closed: false };
    if (state.closed || state.frame !== undefined || state.chunks !== undefined) throw new Error('bootstrap-channel-closed');
    const encoded = encodeBootstrapFrame(frame);
    const sizes = chunks && chunks.length > 0 ? [...chunks] : [encoded.byteLength];
    if (sizes.some((size) => !Number.isInteger(size) || size < 1) || sizes.reduce((total, size) => total + size, 0) !== encoded.byteLength) throw new Error('bootstrap-chunk-schedule-invalid');
    const values: Uint8Array[] = [];
    let offset = 0;
    for (const size of sizes) { values.push(encoded.slice(offset, offset + size)); offset += size; }
    state.chunks = values;
    channels.set(role, state);
  };
  const receiveEncoded = async (actor: Actor, role: BootstrapChannelRole, input: { now_ms: number; deadline_ms: number }): Promise<BootstrapFrame> => {
    assertRole(role);
    if (!Number.isInteger(input.now_ms) || !Number.isInteger(input.deadline_ms) || input.deadline_ms < 0 || input.now_ms < 0) throw new Error('bootstrap-clock-invalid');
    const expectedActor = directionFor(role).split('-to-')[1] as Actor;
    if (actor !== expectedActor) throw new Error('bootstrap-channel-actor-invalid');
    const state = channels.get(role);
    if (!state || state.closed || !state.chunks) throw new Error('bootstrap-channel-closed');
    if (input.now_ms > input.deadline_ms) { state.closed = true; state.chunks = undefined; throw new Error('bootstrap-channel-timeout'); }
    state.closed = true;
    const total = state.chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    const encoded = new Uint8Array(total);
    let offset = 0;
    for (const chunk of state.chunks) { encoded.set(chunk, offset); offset += chunk.byteLength; }
    state.chunks = undefined;
    return decodeBootstrapFrame(encoded);
  };
  return {
    trustedRunner: {
      send: (role: BootstrapChannelRole, value: unknown) => send('trusted-runner', role, value),
      receive: (role: BootstrapChannelRole) => receive('trusted-runner', role),
      sendEncoded: (role: BootstrapChannelRole, frame: BootstrapFrame, chunks?: readonly number[]) => sendEncoded('trusted-runner', role, frame, chunks),
      receiveEncoded: (role: BootstrapChannelRole, input: { now_ms: number; deadline_ms: number }) => receiveEncoded('trusted-runner', role, input),
    },
    sidecar: {
      send: (role: BootstrapChannelRole, value: unknown) => send('sidecar', role, value),
      receive: (role: BootstrapChannelRole) => receive('sidecar', role),
      sendEncoded: (role: BootstrapChannelRole, frame: BootstrapFrame, chunks?: readonly number[]) => sendEncoded('sidecar', role, frame, chunks),
      receiveEncoded: (role: BootstrapChannelRole, input: { now_ms: number; deadline_ms: number }) => receiveEncoded('sidecar', role, input),
    },
    worker: { receive: (role: BootstrapChannelRole) => receive('worker', role), receiveEncoded: (role: BootstrapChannelRole, input: { now_ms: number; deadline_ms: number }) => receiveEncoded('worker', role, input), inherited_channels: () => [] as BootstrapChannelRole[] },
  };
}
