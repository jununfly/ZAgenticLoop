import canonicalize from 'canonicalize';

export const PROVIDER_AUTH_IPC_FRAME_SCHEMA = 'zj-loop.provider_auth_ipc_frame.v1' as const;
export const PROVIDER_AUTH_IPC_MAX_FRAME_BYTES = 64 * 1024;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const ID = /^[^\s]{1,256}$/;
const KINDS = ['challenge', 'launch-accepted', 'stdout', 'stderr', 'result', 'error', 'exit', 'cleanup'] as const;
const FRAME_KEYS = new Set(['schema', 'version', 'kind', 'correlation_id', 'sequence', 'network_id', 'node_id', 'provider_runtime_id', 'provider_id', 'execution_id', 'attempt', 'nonce', 'launch_handle_digest', 'payload']);

export type ProviderAuthIpcFrameKind = typeof KINDS[number];
export type ProviderAuthIpcFrame = {
  schema: typeof PROVIDER_AUTH_IPC_FRAME_SCHEMA;
  version: 1;
  kind: ProviderAuthIpcFrameKind;
  correlation_id: string;
  sequence: number;
  network_id: string;
  node_id: string;
  provider_runtime_id: string;
  provider_id: string;
  execution_id: string;
  attempt: number;
  nonce?: string;
  launch_handle_digest?: string;
  payload?: string | Record<string, unknown>;
};

export type ProviderAuthIpcDecodeResult = { status: 'accepted'; frames: ProviderAuthIpcFrame[] } | { status: 'blocked'; reason: string };

function canonical(value: unknown): string {
  const json = canonicalize(value);
  if (typeof json !== 'string') throw new Error('provider-auth-ipc-canonicalization-invalid');
  return json;
}

function validId(value: unknown): value is string { return typeof value === 'string' && ID.test(value); }
function validDigest(value: unknown): value is string { return typeof value === 'string' && DIGEST.test(value); }

function validateFrameShape(value: unknown): { status: 'valid' } | { status: 'blocked'; reason: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { status: 'blocked', reason: 'provider-auth-ipc-frame-object-invalid' };
  const item = value as Record<string, unknown>;
  if (Object.keys(item).some((key) => !FRAME_KEYS.has(key))) return { status: 'blocked', reason: 'provider-auth-ipc-frame-field-invalid' };
  if (item.schema !== PROVIDER_AUTH_IPC_FRAME_SCHEMA || item.version !== 1 || !KINDS.includes(item.kind as ProviderAuthIpcFrameKind)) return { status: 'blocked', reason: 'provider-auth-ipc-frame-schema-invalid' };
  for (const key of ['correlation_id', 'network_id', 'node_id', 'provider_runtime_id', 'provider_id', 'execution_id'] as const) if (!validId(item[key])) return { status: 'blocked', reason: `provider-auth-ipc-frame-${key}-invalid` };
  if (!Number.isInteger(item.sequence) || (item.sequence as number) < 1 || !Number.isInteger(item.attempt) || (item.attempt as number) < 1) return { status: 'blocked', reason: 'provider-auth-ipc-frame-sequence-invalid' };
  if (item.nonce !== undefined && !validId(item.nonce)) return { status: 'blocked', reason: 'provider-auth-ipc-frame-nonce-invalid' };
  if (item.launch_handle_digest !== undefined && !validDigest(item.launch_handle_digest)) return { status: 'blocked', reason: 'provider-auth-ipc-frame-launch-handle-invalid' };
  if (item.payload !== undefined && typeof item.payload !== 'string' && (!item.payload || typeof item.payload !== 'object' || Array.isArray(item.payload))) return { status: 'blocked', reason: 'provider-auth-ipc-frame-payload-invalid' };
  const kind = item.kind as ProviderAuthIpcFrameKind;
  if (kind === 'challenge' && !validId(item.nonce)) return { status: 'blocked', reason: 'provider-auth-ipc-challenge-nonce-required' };
  if (['launch-accepted', 'stdout', 'stderr', 'result', 'error', 'exit', 'cleanup'].includes(kind) && !validDigest(item.launch_handle_digest)) return { status: 'blocked', reason: 'provider-auth-ipc-launch-handle-required' };
  if (['stdout', 'stderr', 'result', 'error', 'exit', 'cleanup'].includes(kind) && item.payload === undefined) return { status: 'blocked', reason: 'provider-auth-ipc-payload-required' };
  return { status: 'valid' };
}

export function createProviderAuthIpcFrame(input: Omit<ProviderAuthIpcFrame, 'schema' | 'version'>): ProviderAuthIpcFrame {
  const frame = { schema: PROVIDER_AUTH_IPC_FRAME_SCHEMA, version: 1 as const, ...structuredClone(input) };
  if (validateProviderAuthIpcFrame(frame).status === 'blocked') throw new Error('provider-auth-ipc-frame-invalid');
  return frame;
}

export function validateProviderAuthIpcFrame(value: unknown): { status: 'valid' } | { status: 'blocked'; reason: string } {
  return validateFrameShape(value);
}

export function encodeProviderAuthIpcFrame(frame: ProviderAuthIpcFrame): Uint8Array {
  const validation = validateProviderAuthIpcFrame(frame);
  if (validation.status === 'blocked') throw new Error(validation.reason);
  const bytes = new TextEncoder().encode(canonical(frame));
  if (bytes.byteLength > PROVIDER_AUTH_IPC_MAX_FRAME_BYTES) throw new Error('provider-auth-ipc-frame-too-large');
  const output = new Uint8Array(4 + bytes.byteLength);
  new DataView(output.buffer).setUint32(0, bytes.byteLength, false);
  output.set(bytes, 4);
  return output;
}

export class ProviderAuthIpcDecoder {
  private buffer = new Uint8Array(0);
  private expectedSequence = 1;
  private readonly correlationId: string | undefined;

  constructor(input: { correlation_id?: string } = {}) { this.correlationId = input.correlation_id; }

  push(chunk: Uint8Array): ProviderAuthIpcDecodeResult {
    const merged = new Uint8Array(this.buffer.byteLength + chunk.byteLength);
    merged.set(this.buffer);
    merged.set(chunk, this.buffer.byteLength);
    this.buffer = merged;
    const frames: ProviderAuthIpcFrame[] = [];
    while (this.buffer.byteLength >= 4) {
      const size = new DataView(this.buffer.buffer, this.buffer.byteOffset, 4).getUint32(0, false);
      if (size < 2 || size > PROVIDER_AUTH_IPC_MAX_FRAME_BYTES) return { status: 'blocked', reason: 'provider-auth-ipc-frame-length-invalid' };
      if (this.buffer.byteLength < size + 4) break;
      const payload = this.buffer.slice(4, size + 4);
      this.buffer = this.buffer.slice(size + 4);
      let frame: unknown;
      try { frame = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(payload)); } catch { return { status: 'blocked', reason: 'provider-auth-ipc-frame-json-invalid' }; }
      const validation = validateProviderAuthIpcFrame(frame);
      if (validation.status === 'blocked') return validation;
      const typed = frame as ProviderAuthIpcFrame;
      if (this.correlationId !== undefined && typed.correlation_id !== this.correlationId) return { status: 'blocked', reason: 'provider-auth-ipc-correlation-mismatch' };
      if (typed.sequence !== this.expectedSequence) return { status: 'blocked', reason: 'provider-auth-ipc-sequence-mismatch' };
      this.expectedSequence += 1;
      frames.push(typed);
    }
    return { status: 'accepted', frames };
  }

  finish(): ProviderAuthIpcDecodeResult {
    return this.buffer.byteLength === 0 ? { status: 'accepted', frames: [] } : { status: 'blocked', reason: 'provider-auth-ipc-frame-truncated' };
  }
}
