import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
import { verifyHumanSignature } from './human-signer.js';
export const TRUSTED_RUNNER_REGISTRY_MUTATION_SCHEMA = 'zj-loop.trusted_runner_registry_mutation.v1';
export const TRUSTED_RUNNER_CAPABILITY_SCHEMA = 'zj-loop.trusted_runner_capability.v1';
export const TRUSTED_RUNNER_CAPABILITIES = ['credential-cleanup', 'network-policy', 'output-bounds', 'process-boundary', 'secure-signing', 'worktree-observation'];
const FINGERPRINT = /^[0-9a-f]{64}$/;
function payloadBytes(value) {
    const json = canonicalize(value);
    if (typeof json !== 'string')
        throw new Error('trusted-runner-registry-canonicalization-invalid');
    return new TextEncoder().encode(json);
}
function payloadDigest(value) { return `sha256:${createHash('sha256').update(payloadBytes(value)).digest('hex')}`; }
function normalizeCapabilities(capabilities = []) { return [...capabilities].sort(); }
export function validateTrustedRunnerCapabilities(capabilities = []) {
    const errors = [];
    if (!Array.isArray(capabilities) || new Set(capabilities).size !== capabilities.length || !capabilities.every((capability) => typeof capability === 'string' && TRUSTED_RUNNER_CAPABILITIES.includes(capability)))
        errors.push('registry-capability-unknown');
    return { status: errors.length === 0 ? 'valid' : 'blocked', errors };
}
export function trustedRunnerCapabilitiesDigest(capabilities = []) { return `sha256:${createHash('sha256').update(canonicalize(normalizeCapabilities(capabilities)), 'utf8').digest('hex')}`; }
function text(value) { return typeof value === 'string' && value.trim().length > 0; }
function payloadOf(value) {
    const { canonical_payload_digest: _, signature: __, side_effects_executed: ___, ...payload } = value;
    return payload;
}
function actionShape(value) {
    if (!['register', 'rotate', 'revoke', 'update-capabilities'].includes(value.action))
        return false;
    if (value.capabilities !== undefined && validateTrustedRunnerCapabilities(value.capabilities).status === 'blocked')
        return false;
    if (value.action === 'register')
        return !value.old_public_key_fingerprint && FINGERPRINT.test(value.new_public_key_fingerprint ?? '');
    if (value.action === 'revoke')
        return FINGERPRINT.test(value.old_public_key_fingerprint ?? '') && !value.new_public_key_fingerprint;
    if (value.action === 'update-capabilities')
        return !value.old_public_key_fingerprint && !value.new_public_key_fingerprint && /^sha256:[0-9a-f]{64}$/.test(value.old_capabilities_digest ?? '') && Array.isArray(value.capabilities);
    return FINGERPRINT.test(value.old_public_key_fingerprint ?? '') && FINGERPRINT.test(value.new_public_key_fingerprint ?? '') && value.old_public_key_fingerprint !== value.new_public_key_fingerprint;
}
export async function createTrustedRunnerRegistryMutation(input) {
    const identity = await input.signer.getPublicIdentity();
    const payload = {
        schema: TRUSTED_RUNNER_REGISTRY_MUTATION_SCHEMA,
        network_id: input.network_id,
        mutation_id: input.mutation_id,
        action: input.action,
        runner_id: input.runner_id,
        ...(input.old_public_key_fingerprint ? { old_public_key_fingerprint: input.old_public_key_fingerprint } : {}),
        ...(input.new_public_key_fingerprint ? { new_public_key_fingerprint: input.new_public_key_fingerprint } : {}),
        ...(input.old_capabilities_digest ? { old_capabilities_digest: input.old_capabilities_digest } : {}),
        ...(input.capabilities ? { capabilities: normalizeCapabilities(input.capabilities) } : {}),
        reason: input.reason,
        occurred_at: input.occurred_at,
        ...(input.expected_revision !== undefined ? { expected_revision: input.expected_revision } : {}),
        human_id: identity.human_id,
        signer_fingerprint: identity.public_key_fingerprint,
    };
    const mutation = { ...payload, canonical_payload_digest: payloadDigest(payload), signature: await input.signer.sign({ payload: payloadBytes(payload) }), side_effects_executed: false };
    if (validateTrustedRunnerRegistryMutation({ mutation, identity }).status !== 'valid')
        throw new Error('trusted-runner-registry-mutation-invalid');
    return mutation;
}
export function validateTrustedRunnerRegistryMutation(input) {
    const value = input.mutation;
    const errors = [];
    if (value.schema !== TRUSTED_RUNNER_REGISTRY_MUTATION_SCHEMA || !text(value.network_id) || !text(value.mutation_id) || !text(value.runner_id) || !text(value.reason) || !Number.isFinite(Date.parse(value.occurred_at)))
        errors.push('mutation-identity-invalid');
    if (value.expected_revision !== undefined && (!Number.isInteger(value.expected_revision) || value.expected_revision < 1))
        errors.push('mutation-revision-invalid');
    if (!actionShape(value))
        errors.push('mutation-action-shape-invalid');
    if (!FINGERPRINT.test(value.signer_fingerprint) || !FINGERPRINT.test(value.canonical_payload_digest.slice(7)) || value.side_effects_executed !== false)
        errors.push('mutation-integrity-invalid');
    if (input.identity.human_id !== value.human_id || input.identity.public_key_fingerprint !== value.signer_fingerprint)
        errors.push('human-identity-mismatch');
    if (value.canonical_payload_digest !== payloadDigest(payloadOf(value)))
        errors.push('mutation-digest-invalid');
    if (!value.signature || !verifyHumanSignature({ identity: input.identity, payload: payloadBytes(payloadOf(value)), signature: value.signature }))
        errors.push('mutation-signature-invalid');
    if (input.now && Number.isFinite(Date.parse(input.now)) && Date.parse(value.occurred_at) > Date.parse(input.now))
        errors.push('mutation-in-future');
    return { status: errors.length === 0 ? 'valid' : 'blocked', errors };
}
export function applyTrustedRunnerRegistryMutation(input) {
    const validation = validateTrustedRunnerRegistryMutation({ mutation: input.mutation, identity: input.identity });
    if (validation.status !== 'valid')
        return { status: 'blocked', registry: input.registry.map((entry) => ({ ...entry })), reason: validation.errors[0] ?? 'registry-mutation-invalid' };
    const previous = input.history.find((item) => item.mutation_id === input.mutation.mutation_id);
    if (previous) {
        if (previous.canonical_payload_digest === input.mutation.canonical_payload_digest)
            return { status: 'duplicate', registry: input.registry.map((entry) => ({ ...entry })) };
        return { status: 'blocked', registry: input.registry.map((entry) => ({ ...entry })), reason: 'registry-mutation-id-conflict' };
    }
    const registry = input.registry.map((entry) => ({ ...entry }));
    const current = registry.find((entry) => entry.runner_id === input.mutation.runner_id);
    if (input.mutation.action === 'register') {
        if (current)
            return { status: 'blocked', registry, reason: 'registry-runner-already-exists' };
        registry.push({ runner_id: input.mutation.runner_id, public_key_fingerprint: input.mutation.new_public_key_fingerprint, status: 'active', ...(input.mutation.capabilities ? { capabilities: normalizeCapabilities(input.mutation.capabilities) } : {}) });
        return { status: 'recorded', registry };
    }
    if (!current || current.status !== 'active' || (input.mutation.action !== 'update-capabilities' && current.public_key_fingerprint !== input.mutation.old_public_key_fingerprint))
        return { status: 'blocked', registry, reason: 'registry-current-fingerprint-mismatch' };
    if (input.mutation.action === 'update-capabilities' && input.mutation.old_capabilities_digest !== trustedRunnerCapabilitiesDigest(current.capabilities))
        return { status: 'blocked', registry, reason: 'registry-current-capabilities-mismatch' };
    if (input.mutation.action === 'rotate')
        current.public_key_fingerprint = input.mutation.new_public_key_fingerprint;
    else if (input.mutation.action === 'revoke')
        current.status = 'revoked';
    else
        current.capabilities = normalizeCapabilities(input.mutation.capabilities ?? []);
    return { status: 'recorded', registry };
}
