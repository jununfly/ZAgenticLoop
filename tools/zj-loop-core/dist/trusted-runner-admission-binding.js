import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
import { createLocalExecutionPreflight, validateLocalExecutionPreflight } from './local-execution-preflight.js';
import { trustedRunnerCapabilitiesDigest, validateTrustedRunnerCapabilities } from './trusted-runner-registry.js';
const DIGEST = /^sha256:[0-9a-f]{64}$/;
export function trustedRunnerAdmissionBundleDigest(value) {
    const json = canonicalize(value);
    if (typeof json !== 'string')
        throw new Error('trusted-runner-admission-bundle-canonicalization-invalid');
    return `sha256:${createHash('sha256').update(json, 'utf8').digest('hex')}`;
}
function checkedBinding(input) {
    if (!input || typeof input.network_id !== 'string' || input.network_id.trim().length === 0)
        throw new Error('trusted-runner-admission-binding-network-id-invalid');
    if (!input || typeof input.runner_id !== 'string' || input.runner_id.trim().length === 0)
        throw new Error('trusted-runner-admission-binding-runner-id-invalid');
    if (!Number.isInteger(input.registry_revision) || input.registry_revision < 1)
        throw new Error('trusted-runner-admission-binding-registry-revision-invalid');
    if (!DIGEST.test(input.registry_snapshot_digest))
        throw new Error('trusted-runner-admission-binding-registry-snapshot-digest-invalid');
    if (!Array.isArray(input.required_capabilities) || validateTrustedRunnerCapabilities(input.required_capabilities).status === 'blocked')
        throw new Error('trusted-runner-admission-binding-required-capabilities-invalid');
    if (validateTrustedRunnerCapabilities(input.capabilities).status === 'blocked')
        throw new Error('trusted-runner-admission-binding-capabilities-invalid');
    if (input.capabilities_digest !== trustedRunnerCapabilitiesDigest(input.capabilities))
        throw new Error('trusted-runner-admission-binding-capabilities-digest-invalid');
    return { ...input, required_capabilities: [...new Set(input.required_capabilities)].sort(), capabilities: [...input.capabilities].sort() };
}
export function createAdmissionBoundLocalExecutionPreflight(input) {
    const binding = checkedBinding(input.binding);
    if (input.preflight.network_id !== binding.network_id)
        throw new Error('trusted-runner-admission-binding-network-id-mismatch');
    return createLocalExecutionPreflight({ ...input.preflight, runner_id: binding.runner_id, registry_revision: binding.registry_revision, registry_snapshot_digest: binding.registry_snapshot_digest, capabilities_digest: binding.capabilities_digest });
}
export function createAdmissionBoundTrustedRunnerExecutionContext(input) {
    const binding = checkedBinding(input.binding);
    return { ...input.execution, runner_id: binding.runner_id, registry_revision: binding.registry_revision, registry_snapshot_digest: binding.registry_snapshot_digest, capabilities_digest: binding.capabilities_digest };
}
export function createAdmissionBoundExecution(input) {
    if (input.admission.status !== 'admitted')
        throw new Error('trusted-runner-admission-blocked');
    const binding = checkedBinding(input.admission.binding);
    const preflight = createAdmissionBoundLocalExecutionPreflight({ preflight: input.preflight, binding });
    const execution = createAdmissionBoundTrustedRunnerExecutionContext({ execution: { ...input.execution, execution_id: preflight.execution_id, attempt: preflight.attempt, preflight_digest: preflight.preflight_digest }, binding });
    return { binding, preflight, execution };
}
export function validateAdmissionBoundExecution(input) {
    try {
        if (!input || typeof input !== 'object')
            return { status: 'blocked', reason: 'trusted-runner-admission-bundle-invalid' };
        const value = input;
        const binding = checkedBinding(value.binding);
        if (validateLocalExecutionPreflight(value.preflight).status !== 'valid')
            return { status: 'blocked', reason: 'trusted-runner-admission-preflight-invalid' };
        if (value.preflight.network_id !== binding.network_id || value.preflight.runner_id !== binding.runner_id || value.preflight.registry_revision !== binding.registry_revision || value.preflight.registry_snapshot_digest !== binding.registry_snapshot_digest || value.preflight.capabilities_digest !== binding.capabilities_digest)
            return { status: 'blocked', reason: 'trusted-runner-admission-preflight-binding-invalid' };
        if (value.execution.runner_id !== binding.runner_id || value.execution.registry_revision !== binding.registry_revision || value.execution.registry_snapshot_digest !== binding.registry_snapshot_digest || value.execution.capabilities_digest !== binding.capabilities_digest || value.execution.execution_id !== value.preflight.execution_id || value.execution.attempt !== value.preflight.attempt || value.execution.preflight_digest !== value.preflight.preflight_digest)
            return { status: 'blocked', reason: 'trusted-runner-admission-execution-binding-invalid' };
        return { status: 'valid' };
    }
    catch (error) {
        return { status: 'blocked', reason: error instanceof Error ? error.message : 'trusted-runner-admission-bundle-invalid' };
    }
}
