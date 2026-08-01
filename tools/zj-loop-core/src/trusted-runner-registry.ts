import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
import { verifyHumanSignature, type HumanSignature, type HumanSigner, type HumanSignerIdentity } from './human-signer.js';

export const TRUSTED_RUNNER_REGISTRY_MUTATION_SCHEMA = 'zj-loop.trusted_runner_registry_mutation.v1' as const;
const FINGERPRINT = /^[0-9a-f]{64}$/;
type MutationAction = 'register' | 'rotate' | 'revoke';

export type TrustedRunnerRegistryMutation = {
  schema: typeof TRUSTED_RUNNER_REGISTRY_MUTATION_SCHEMA;
  network_id: string;
  mutation_id: string;
  action: MutationAction;
  runner_id: string;
  old_public_key_fingerprint?: string;
  new_public_key_fingerprint?: string;
  reason: string;
  occurred_at: string;
  human_id: string;
  signer_fingerprint: string;
  canonical_payload_digest: string;
  signature: HumanSignature;
  side_effects_executed: false;
};

export type TrustedRunnerRegistryEntry = {
  runner_id: string;
  public_key_fingerprint: string;
  status: 'active' | 'revoked';
};

type Payload = Omit<TrustedRunnerRegistryMutation, 'canonical_payload_digest' | 'signature' | 'side_effects_executed'>;

function payloadBytes(value: Payload): Uint8Array {
  const json = canonicalize(value);
  if (typeof json !== 'string') throw new Error('trusted-runner-registry-canonicalization-invalid');
  return new TextEncoder().encode(json);
}

function payloadDigest(value: Payload): string { return `sha256:${createHash('sha256').update(payloadBytes(value)).digest('hex')}`; }
function text(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0; }
function payloadOf(value: TrustedRunnerRegistryMutation): Payload {
  const { canonical_payload_digest: _, signature: __, side_effects_executed: ___, ...payload } = value;
  return payload;
}

function actionShape(value: TrustedRunnerRegistryMutation): boolean {
  if (!['register', 'rotate', 'revoke'].includes(value.action)) return false;
  if (value.action === 'register') return !value.old_public_key_fingerprint && FINGERPRINT.test(value.new_public_key_fingerprint ?? '');
  if (value.action === 'revoke') return FINGERPRINT.test(value.old_public_key_fingerprint ?? '') && !value.new_public_key_fingerprint;
  return FINGERPRINT.test(value.old_public_key_fingerprint ?? '') && FINGERPRINT.test(value.new_public_key_fingerprint ?? '') && value.old_public_key_fingerprint !== value.new_public_key_fingerprint;
}

export async function createTrustedRunnerRegistryMutation(input: {
  signer: HumanSigner;
  network_id: string;
  mutation_id: string;
  action: MutationAction;
  runner_id: string;
  old_public_key_fingerprint?: string;
  new_public_key_fingerprint?: string;
  reason: string;
  occurred_at: string;
}): Promise<TrustedRunnerRegistryMutation> {
  const identity = await input.signer.getPublicIdentity();
  const payload: Payload = {
    schema: TRUSTED_RUNNER_REGISTRY_MUTATION_SCHEMA,
    network_id: input.network_id,
    mutation_id: input.mutation_id,
    action: input.action,
    runner_id: input.runner_id,
    ...(input.old_public_key_fingerprint ? { old_public_key_fingerprint: input.old_public_key_fingerprint } : {}),
    ...(input.new_public_key_fingerprint ? { new_public_key_fingerprint: input.new_public_key_fingerprint } : {}),
    reason: input.reason,
    occurred_at: input.occurred_at,
    human_id: identity.human_id,
    signer_fingerprint: identity.public_key_fingerprint,
  };
  const mutation = { ...payload, canonical_payload_digest: payloadDigest(payload), signature: await input.signer.sign({ payload: payloadBytes(payload) }), side_effects_executed: false as const };
  if (validateTrustedRunnerRegistryMutation({ mutation, identity }).status !== 'valid') throw new Error('trusted-runner-registry-mutation-invalid');
  return mutation;
}

export function validateTrustedRunnerRegistryMutation(input: { mutation: TrustedRunnerRegistryMutation; identity: HumanSignerIdentity; now?: string }): { status: 'valid' | 'blocked'; errors: string[] } {
  const value = input.mutation;
  const errors: string[] = [];
  if (value.schema !== TRUSTED_RUNNER_REGISTRY_MUTATION_SCHEMA || !text(value.network_id) || !text(value.mutation_id) || !text(value.runner_id) || !text(value.reason) || !Number.isFinite(Date.parse(value.occurred_at))) errors.push('mutation-identity-invalid');
  if (!actionShape(value)) errors.push('mutation-action-shape-invalid');
  if (!FINGERPRINT.test(value.signer_fingerprint) || !FINGERPRINT.test(value.canonical_payload_digest.slice(7)) || value.side_effects_executed !== false) errors.push('mutation-integrity-invalid');
  if (input.identity.human_id !== value.human_id || input.identity.public_key_fingerprint !== value.signer_fingerprint) errors.push('human-identity-mismatch');
  if (value.canonical_payload_digest !== payloadDigest(payloadOf(value))) errors.push('mutation-digest-invalid');
  if (!value.signature || !verifyHumanSignature({ identity: input.identity, payload: payloadBytes(payloadOf(value)), signature: value.signature })) errors.push('mutation-signature-invalid');
  if (input.now && Number.isFinite(Date.parse(input.now)) && Date.parse(value.occurred_at) > Date.parse(input.now)) errors.push('mutation-in-future');
  return { status: errors.length === 0 ? 'valid' : 'blocked', errors };
}

export function applyTrustedRunnerRegistryMutation(input: {
  registry: TrustedRunnerRegistryEntry[];
  history: TrustedRunnerRegistryMutation[];
  mutation: TrustedRunnerRegistryMutation;
  identity: HumanSignerIdentity;
}): { status: 'recorded' | 'duplicate' | 'blocked'; registry: TrustedRunnerRegistryEntry[]; reason?: string } {
  const validation = validateTrustedRunnerRegistryMutation({ mutation: input.mutation, identity: input.identity });
  if (validation.status !== 'valid') return { status: 'blocked', registry: input.registry.map((entry) => ({ ...entry })), reason: validation.errors[0] ?? 'registry-mutation-invalid' };
  const previous = input.history.find((item) => item.mutation_id === input.mutation.mutation_id);
  if (previous) {
    if (previous.canonical_payload_digest === input.mutation.canonical_payload_digest) return { status: 'duplicate', registry: input.registry.map((entry) => ({ ...entry })) };
    return { status: 'blocked', registry: input.registry.map((entry) => ({ ...entry })), reason: 'registry-mutation-id-conflict' };
  }
  const registry = input.registry.map((entry) => ({ ...entry }));
  const current = registry.find((entry) => entry.runner_id === input.mutation.runner_id);
  if (input.mutation.action === 'register') {
    if (current) return { status: 'blocked', registry, reason: 'registry-runner-already-exists' };
    registry.push({ runner_id: input.mutation.runner_id, public_key_fingerprint: input.mutation.new_public_key_fingerprint as string, status: 'active' });
    return { status: 'recorded', registry };
  }
  if (!current || current.status !== 'active' || current.public_key_fingerprint !== input.mutation.old_public_key_fingerprint) return { status: 'blocked', registry, reason: 'registry-current-fingerprint-mismatch' };
  if (input.mutation.action === 'rotate') current.public_key_fingerprint = input.mutation.new_public_key_fingerprint as string;
  else current.status = 'revoked';
  return { status: 'recorded', registry };
}
