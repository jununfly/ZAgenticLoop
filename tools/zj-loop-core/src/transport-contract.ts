import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';

export const TRANSPORT_ENVELOPE_SCHEMA = 'zj-loop.transport_envelope.v1' as const;
export const TRANSPORT_ENVELOPE_MAX_BYTES = 64 * 1024;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const ID = /^[^\s]{1,256}$/;

export type TransportArtifactRef = {
  artifact_id: string;
  content_sha256: string;
  kind: 'evidence' | 'artifact';
};

export type TransportEnvelope = {
  schema: typeof TRANSPORT_ENVELOPE_SCHEMA;
  message_id: string;
  network_id: string;
  event_id: string;
  plan_id: string;
  plan_revision: number;
  task_id: string;
  from_node_id: string;
  target_node_id: string;
  notification_kind: string;
  state: 'available' | 'blocked';
  artifact_refs: TransportArtifactRef[];
  created_at: string;
  expires_at: string;
  side_effects_executed: false;
  envelope_digest: string;
};

export type TransportResult =
  | { status: 'accepted'; message_id: string; envelope_digest: string; side_effects_executed: false }
  | { status: 'duplicate'; message_id: string; envelope_digest: string; side_effects_executed: false }
  | { status: 'blocked'; message_id?: string; reason: string; side_effects_executed: false };

export type TransportAdapter = {
  openSession(input: { network_id: string; node_id: string }): Promise<{ session_id: string }>;
  send(input: { session_id: string; envelope: TransportEnvelope }): Promise<TransportResult>;
  receive(input: { session_id: string }): Promise<TransportEnvelope | null>;
  acknowledge(input: { session_id: string; message_id: string; envelope_digest: string }): Promise<TransportResult>;
  closeSession(input: { session_id: string }): Promise<void>;
};

type EnvelopeInput = Omit<TransportEnvelope, 'schema' | 'envelope_digest' | 'side_effects_executed'> & { payload?: never };

function requiredId(value: unknown, error: string): asserts value is string {
  if (typeof value !== 'string' || !ID.test(value)) throw new Error(error);
}

function requiredDigest(value: unknown, error: string): asserts value is string {
  if (typeof value !== 'string' || !DIGEST.test(value)) throw new Error(error);
}

function canonical(value: unknown): string {
  const json = canonicalize(value);
  if (typeof json !== 'string' || Buffer.byteLength(json, 'utf8') > TRANSPORT_ENVELOPE_MAX_BYTES) throw new Error('transport-envelope-too-large');
  return json;
}

function digest(value: Omit<TransportEnvelope, 'envelope_digest'>): string {
  return `sha256:${createHash('sha256').update(canonical(value), 'utf8').digest('hex')}`;
}

function unsigned(value: TransportEnvelope): Omit<TransportEnvelope, 'envelope_digest'> {
  const { envelope_digest: _digest, ...rest } = value;
  return rest;
}

function validateShape(value: unknown): { status: 'valid' } | { status: 'blocked'; reason: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { status: 'blocked', reason: 'transport-envelope-object-invalid' };
  const item = value as Record<string, unknown>;
  const allowed = new Set(['schema', 'message_id', 'network_id', 'event_id', 'plan_id', 'plan_revision', 'task_id', 'from_node_id', 'target_node_id', 'notification_kind', 'state', 'artifact_refs', 'created_at', 'expires_at', 'side_effects_executed', 'envelope_digest']);
  if (Object.keys(item).some((key) => !allowed.has(key) || key === 'payload')) return { status: 'blocked', reason: 'transport-envelope-field-invalid' };
  if (item.schema !== TRANSPORT_ENVELOPE_SCHEMA || item.side_effects_executed !== false) return { status: 'blocked', reason: 'transport-envelope-schema-invalid' };
  for (const key of ['message_id', 'network_id', 'event_id', 'plan_id', 'task_id', 'from_node_id', 'target_node_id', 'notification_kind']) requiredId(item[key], `transport-${key}-invalid`);
  if (!Number.isInteger(item.plan_revision) || (item.plan_revision as number) < 0) return { status: 'blocked', reason: 'transport-plan-revision-invalid' };
  if (item.state !== 'available' && item.state !== 'blocked') return { status: 'blocked', reason: 'transport-state-invalid' };
  if (!Array.isArray(item.artifact_refs) || item.artifact_refs.length === 0 || item.artifact_refs.length > 256) return { status: 'blocked', reason: 'transport-artifact-refs-invalid' };
  for (const ref of item.artifact_refs) {
    if (!ref || typeof ref !== 'object' || Array.isArray(ref)) return { status: 'blocked', reason: 'transport-artifact-ref-invalid' };
    const record = ref as Record<string, unknown>;
    if (Object.keys(record).some((key) => !['artifact_id', 'content_sha256', 'kind'].includes(key)) || record.kind !== 'evidence' && record.kind !== 'artifact') return { status: 'blocked', reason: 'transport-artifact-ref-invalid' };
    requiredDigest(record.artifact_id, 'transport-artifact-id-invalid');
    requiredDigest(record.content_sha256, 'transport-content-digest-invalid');
  }
  if (typeof item.created_at !== 'string' || typeof item.expires_at !== 'string') return { status: 'blocked', reason: 'transport-time-invalid' };
  const created = Date.parse(item.created_at);
  const expires = Date.parse(item.expires_at);
  if (!Number.isFinite(created) || !Number.isFinite(expires) || expires <= created) return { status: 'blocked', reason: 'transport-time-invalid' };
  if (typeof item.envelope_digest !== 'string' || !DIGEST.test(item.envelope_digest)) return { status: 'blocked', reason: 'transport-envelope-digest-invalid' };
  return { status: 'valid' };
}

export function createTransportEnvelope(input: EnvelopeInput): TransportEnvelope {
  if (!input || typeof input !== 'object' || 'envelope_digest' in input || 'payload' in input) throw new Error('transport-envelope-invalid');
  const candidate = { schema: TRANSPORT_ENVELOPE_SCHEMA, ...input, side_effects_executed: false as const };
  const shape = validateShape({ ...candidate, envelope_digest: 'sha256:' + '0'.repeat(64) });
  if (shape.status !== 'valid') throw new Error('transport-envelope-invalid');
  const envelope = { ...candidate, envelope_digest: digest(candidate) };
  canonical(envelope);
  return envelope;
}

export function transportEnvelopeDigest(value: TransportEnvelope): string {
  return digest(unsigned(value));
}

export function validateTransportEnvelope(value: unknown): { status: 'valid' } | { status: 'blocked'; reason: string } {
  const shape = validateShape(value);
  if (shape.status !== 'valid') return shape;
  const item = value as TransportEnvelope;
  try {
    return transportEnvelopeDigest(item) === item.envelope_digest ? shape : { status: 'blocked', reason: 'transport-envelope-digest-invalid' };
  } catch {
    return { status: 'blocked', reason: 'transport-envelope-canonicalization-invalid' };
  }
}
