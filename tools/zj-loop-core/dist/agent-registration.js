import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
export const AGENT_REGISTRATION_SCHEMA = 'zj-loop.agent_registration.v1';
export const AGENT_REGISTRATION_PROFILE = 'opn-agent-registration-v1-2026-08';
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const ID = /^[^\s]{1,256}$/;
function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function requiredId(value, error) {
    return typeof value === 'string' && ID.test(value) || (() => { throw new Error(error); })();
}
function requiredText(value, error) {
    if (typeof value !== 'string' || !value.trim() || value.length > 256)
        throw new Error(error);
    return true;
}
function normalizeList(value, error) {
    if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== 'string' || !ID.test(item)))
        throw new Error(error);
    return [...new Set(value)].sort();
}
function unsigned(value) {
    const { registration_digest: _, ...rest } = value;
    return rest;
}
function canonical(value) {
    const json = canonicalize(value);
    if (typeof json !== 'string')
        throw new Error('agent-registration-canonicalization-invalid');
    return json;
}
function digest(value) {
    return `sha256:${createHash('sha256').update(canonical(value), 'utf8').digest('hex')}`;
}
export function createAgentRegistration(input) {
    if (!isRecord(input))
        throw new Error('agent-registration-object-invalid');
    const allowed = new Set(['agent_id', 'display_name', 'capabilities', 'accepted_task_kinds', 'evidence_kinds', 'protocol_version', 'identity_ref']);
    if (Object.keys(input).some((key) => !allowed.has(key)))
        throw new Error('agent-registration-field-invalid');
    requiredId(input.agent_id, 'agent-id-invalid');
    requiredText(input.display_name, 'agent-display-name-invalid');
    requiredId(input.protocol_version, 'agent-protocol-version-invalid');
    requiredId(input.identity_ref, 'agent-identity-ref-invalid');
    const candidate = {
        schema: AGENT_REGISTRATION_SCHEMA,
        agent_id: input.agent_id,
        display_name: input.display_name,
        capabilities: normalizeList(input.capabilities, 'agent-capabilities-invalid'),
        accepted_task_kinds: normalizeList(input.accepted_task_kinds, 'agent-task-kinds-invalid'),
        evidence_kinds: normalizeList(input.evidence_kinds, 'agent-evidence-kinds-invalid'),
        protocol_version: input.protocol_version,
        identity_ref: input.identity_ref,
    };
    return { ...candidate, registration_digest: digest(candidate) };
}
export function agentRegistrationDigest(value) {
    return digest(unsigned(value));
}
export function validateAgentRegistration(value) {
    if (!isRecord(value))
        return { status: 'blocked', reason: 'agent-registration-object-invalid' };
    const allowed = new Set(['schema', 'agent_id', 'display_name', 'capabilities', 'accepted_task_kinds', 'evidence_kinds', 'protocol_version', 'identity_ref', 'registration_digest']);
    if (Object.keys(value).some((key) => !allowed.has(key)))
        return { status: 'blocked', reason: 'agent-registration-field-invalid' };
    if (value.schema !== AGENT_REGISTRATION_SCHEMA)
        return { status: 'blocked', reason: 'agent-registration-schema-invalid' };
    try {
        const item = value;
        requiredId(item.agent_id, 'agent-id-invalid');
        requiredText(item.display_name, 'agent-display-name-invalid');
        requiredId(item.protocol_version, 'agent-protocol-version-invalid');
        requiredId(item.identity_ref, 'agent-identity-ref-invalid');
        const capabilities = normalizeList(item.capabilities, 'agent-capabilities-invalid');
        const taskKinds = normalizeList(item.accepted_task_kinds, 'agent-task-kinds-invalid');
        const evidenceKinds = normalizeList(item.evidence_kinds, 'agent-evidence-kinds-invalid');
        if (JSON.stringify(capabilities) !== JSON.stringify(item.capabilities) || JSON.stringify(taskKinds) !== JSON.stringify(item.accepted_task_kinds) || JSON.stringify(evidenceKinds) !== JSON.stringify(item.evidence_kinds))
            return { status: 'blocked', reason: 'agent-registration-normalization-invalid' };
        if (typeof item.registration_digest !== 'string' || !DIGEST.test(item.registration_digest) || item.registration_digest !== agentRegistrationDigest(item))
            return { status: 'blocked', reason: 'agent-registration-digest-invalid' };
        return { status: 'valid' };
    }
    catch (error) {
        return { status: 'blocked', reason: error instanceof Error ? error.message : 'agent-registration-invalid' };
    }
}
