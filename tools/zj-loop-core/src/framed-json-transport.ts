import canonicalize from 'canonicalize';

export const FRAMED_JSON_TRANSPORT_SCHEMA = 'zj-loop.framed_json_transport.v1' as const;
export const DEFAULT_FRAMED_JSON_MAX_FRAME_BYTES = 64 * 1024;

export type FramedJsonFrame = Record<string, unknown> & { correlation_id: string; sequence: number };
export type FramedJsonValidation = { status: 'valid' } | { status: 'blocked'; reason: string };
export type FramedJsonDecodeResult = { status: 'accepted'; frames: FramedJsonFrame[] } | { status: 'blocked'; reason: string };

function canonical(value: unknown): string {
  const result = canonicalize(value);
  if (typeof result !== 'string') throw new Error('framed-json-canonicalization-invalid');
  return result;
}

function validFrame(value: unknown): value is FramedJsonFrame {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const frame = value as Record<string, unknown>;
  return typeof frame.correlation_id === 'string' && frame.correlation_id.trim() !== '' && !frame.correlation_id.includes('\0')
    && Number.isInteger(frame.sequence) && (frame.sequence as number) >= 1;
}

export function createFramedJsonCodec(input: { max_frame_bytes?: number } = {}) {
  const max = input.max_frame_bytes ?? DEFAULT_FRAMED_JSON_MAX_FRAME_BYTES;
  if (!Number.isInteger(max) || max < 1 || max > 16 * 1024 * 1024) throw new Error('framed-json-max-frame-invalid');
  return {
    encode(value: unknown): Uint8Array {
      if (!validFrame(value)) throw new Error('framed-json-frame-invalid');
      const bytes = new TextEncoder().encode(canonical(value));
      if (bytes.byteLength > max) throw new Error('framed-json-too-large');
      const output = new Uint8Array(4 + bytes.byteLength);
      new DataView(output.buffer).setUint32(0, bytes.byteLength, false);
      output.set(bytes, 4);
      return output;
    },
  };
}

export class FramedJsonDecoder {
  private buffer = new Uint8Array(0);
  private expectedSequence = 1;
  private readonly max: number;
  private readonly correlationId?: string;
  private readonly validate?: (value: unknown) => FramedJsonValidation;

  constructor(input: { max_frame_bytes?: number; correlation_id?: string; validate?: (value: unknown) => FramedJsonValidation } = {}) {
    this.max = input.max_frame_bytes ?? DEFAULT_FRAMED_JSON_MAX_FRAME_BYTES;
    if (!Number.isInteger(this.max) || this.max < 1 || this.max > 16 * 1024 * 1024) throw new Error('framed-json-max-frame-invalid');
    this.correlationId = input.correlation_id;
    this.validate = input.validate;
  }

  push(chunk: Uint8Array): FramedJsonDecodeResult {
    const merged = new Uint8Array(this.buffer.byteLength + chunk.byteLength);
    merged.set(this.buffer);
    merged.set(chunk, this.buffer.byteLength);
    this.buffer = merged;
    const frames: FramedJsonFrame[] = [];
    while (this.buffer.byteLength >= 4) {
      const size = new DataView(this.buffer.buffer, this.buffer.byteOffset, 4).getUint32(0, false);
      if (size < 2 || size > this.max) return { status: 'blocked', reason: 'framed-json-length-invalid' };
      if (this.buffer.byteLength < size + 4) break;
      const payload = this.buffer.slice(4, size + 4);
      this.buffer = this.buffer.slice(size + 4);
      let value: unknown;
      try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(payload)); } catch { return { status: 'blocked', reason: 'framed-json-json-invalid' }; }
      if (!validFrame(value)) return { status: 'blocked', reason: 'framed-json-frame-invalid' };
      if (this.correlationId !== undefined && value.correlation_id !== this.correlationId) return { status: 'blocked', reason: 'framed-json-correlation-mismatch' };
      if (value.sequence !== this.expectedSequence) return { status: 'blocked', reason: 'framed-json-sequence-mismatch' };
      const checked = this.validate?.(value);
      if (checked?.status === 'blocked') return checked;
      this.expectedSequence += 1;
      frames.push(value);
    }
    return { status: 'accepted', frames };
  }

  finish(): FramedJsonDecodeResult { return this.buffer.byteLength === 0 ? { status: 'accepted', frames: [] } : { status: 'blocked', reason: 'framed-json-truncated' }; }
}
