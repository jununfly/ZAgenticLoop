import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';

export const NATIVE_OPN_TRACER_RELAY_ENVELOPE_SCHEMA = 'zj-loop.native_opn_tracer_relay_envelope.v1' as const;
export type NativeOpnTracerRelayEnvelope = {
  schema: typeof NATIVE_OPN_TRACER_RELAY_ENVELOPE_SCHEMA;
  message_id: string;
  network_id: string;
  event_id: string;
  plan_id: string;
  plan_revision: number;
  from_node_id: string;
  target_node_id: string;
  notification_kind: 'execution-evidence-available' | 'aggregation-available' | 'verification-available' | 'blocked';
  state: 'available' | 'blocked';
  artifact_refs: Array<{ artifact_id: string; content_sha256: string; kind: string }>;
  created_at: string;
  expires_at: string;
  side_effects_executed: false;
  envelope_digest: string;
};
export type NativeOpnTracerRelayInboxResult = { status: 'accepted' | 'duplicate' | 'conflict' | 'blocked'; envelope?: NativeOpnTracerRelayEnvelope; reason?: string };

function text(value: unknown): value is string { return typeof value === 'string' && value.length > 0; }
function digest(value: unknown): value is string { return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/.test(value); }
function unsigned(envelope: NativeOpnTracerRelayEnvelope): Omit<NativeOpnTracerRelayEnvelope, 'envelope_digest'> { const { envelope_digest: _, ...value } = envelope; return value; }
function envelopeDigest(envelope: NativeOpnTracerRelayEnvelope): string { const json = canonicalize(unsigned(envelope)); if (typeof json !== 'string') throw new Error('native-opn-tracer-relay-canonicalization-invalid'); return `sha256:${createHash('sha256').update(json).digest('hex')}`; }

export function createNativeOpnTracerRelayEnvelope(input: Omit<NativeOpnTracerRelayEnvelope, 'schema' | 'side_effects_executed' | 'envelope_digest'>): NativeOpnTracerRelayEnvelope {
  if (!text(input.message_id) || !text(input.network_id) || !text(input.event_id) || !text(input.plan_id) || !Number.isInteger(input.plan_revision) || input.plan_revision < 1 || !text(input.from_node_id) || !text(input.target_node_id) || !['execution-evidence-available', 'aggregation-available', 'verification-available', 'blocked'].includes(input.notification_kind) || !['available', 'blocked'].includes(input.state) || !Array.isArray(input.artifact_refs) || !input.artifact_refs.every((ref) => text(ref.artifact_id) && digest(ref.content_sha256) && ref.artifact_id === ref.content_sha256 && text(ref.kind)) || !text(input.created_at) || !text(input.expires_at) || !Number.isFinite(Date.parse(input.created_at)) || !Number.isFinite(Date.parse(input.expires_at)) || Date.parse(input.expires_at) <= Date.parse(input.created_at)) throw new Error('native-opn-tracer-relay-envelope-invalid');
  const value = { schema: NATIVE_OPN_TRACER_RELAY_ENVELOPE_SCHEMA, ...input, artifact_refs: input.artifact_refs.map((ref) => ({ ...ref })), side_effects_executed: false as const, envelope_digest: '' };
  value.envelope_digest = envelopeDigest(value);
  return value;
}

export function nativeOpnTracerRelayEnvelopeDigest(envelope: NativeOpnTracerRelayEnvelope): string { return envelopeDigest(envelope); }

export function createNativeOpnTracerRelayInbox(input: { network_id: string; node_id: string; now: string }): { accept(envelope: NativeOpnTracerRelayEnvelope): NativeOpnTracerRelayInboxResult } {
  if (!text(input.network_id) || !text(input.node_id) || !Number.isFinite(Date.parse(input.now))) throw new Error('native-opn-tracer-relay-inbox-invalid');
  const seen = new Map<string, string>();
  return {
    accept(envelope) {
      if (nativeOpnTracerRelayEnvelopeDigest(envelope) !== envelope.envelope_digest) return { status: 'blocked', reason: 'relay-envelope-digest-invalid' };
      if (envelope.network_id !== input.network_id) return { status: 'blocked', reason: 'relay-envelope-network-mismatch' };
      if (envelope.target_node_id !== input.node_id) return { status: 'blocked', reason: 'relay-envelope-target-mismatch' };
      if (Date.parse(envelope.expires_at) <= Date.parse(input.now)) return { status: 'blocked', reason: 'relay-envelope-expired' };
      const previous = seen.get(envelope.message_id);
      if (previous) return previous === envelope.envelope_digest ? { status: 'duplicate', envelope } : { status: 'conflict', reason: 'relay-message-id-conflict' };
      seen.set(envelope.message_id, envelope.envelope_digest);
      return { status: 'accepted', envelope };
    },
  };
}
