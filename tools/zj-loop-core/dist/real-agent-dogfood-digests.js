import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
export const REAL_AGENT_DOGFOOD_DIGEST_PROFILE = 'zj-loop.real-agent-dogfood-digest.v1';
const DIGEST = /^sha256:[0-9a-f]{64}$/;
function digest(value) {
    const encoded = canonicalize(value);
    if (typeof encoded !== 'string')
        throw new Error('real-agent-dogfood-digest-canonicalization-invalid');
    return `sha256:${createHash('sha256').update(encoded, 'utf8').digest('hex')}`;
}
function requireDigest(value, name) {
    if (!DIGEST.test(value))
        throw new Error(`${name}-invalid`);
}
export function realAgentDogfoodExecutionBindingDigest(input) {
    requireDigest(input.plan_definition_digest, 'plan-definition-digest');
    requireDigest(input.human_approval_digest, 'human-approval-digest');
    requireDigest(input.adapter_contract_digest, 'adapter-contract-digest');
    requireDigest(input.runtime_identity_digest, 'runtime-identity-digest');
    if (!input.execution_id.trim() || !Number.isInteger(input.attempt) || input.attempt < 1 || !input.provider_id.trim() || !Array.isArray(input.resource_scope) || input.resource_scope.some((value) => !value.trim()) || !input.network_policy.trim() || !Number.isInteger(input.timeout_ms) || input.timeout_ms <= 0)
        throw new Error('execution-binding-input-invalid');
    return digest({
        schema: 'zj-loop.real-agent-dogfood.execution-binding.v1',
        digest_profile: REAL_AGENT_DOGFOOD_DIGEST_PROFILE,
        plan_definition_digest: input.plan_definition_digest,
        execution_id: input.execution_id,
        attempt: input.attempt,
        human_approval_digest: input.human_approval_digest,
        provider_id: input.provider_id,
        adapter_contract_digest: input.adapter_contract_digest,
        resource_scope: [...input.resource_scope].sort(),
        network_policy: input.network_policy,
        timeout_ms: input.timeout_ms,
        runtime_identity_digest: input.runtime_identity_digest,
    });
}
export function realAgentDogfoodCoordinatorLeaseDigest(input) {
    requireDigest(input.execution_binding_digest, 'execution-binding-digest');
    if (!input.execution_id.trim() || !input.session_id.trim() || !input.lease_id.trim() || !input.human_id.trim() || !input.coordinator_id.trim() || !Number.isFinite(Date.parse(input.expires_at)))
        throw new Error('coordinator-lease-digest-input-invalid');
    return digest({
        schema: 'zj-loop.real-agent-dogfood.coordinator-lease.v1',
        digest_profile: REAL_AGENT_DOGFOOD_DIGEST_PROFILE,
        execution_binding_digest: input.execution_binding_digest,
        execution_id: input.execution_id,
        session_id: input.session_id,
        lease_id: input.lease_id,
        human_id: input.human_id,
        coordinator_id: input.coordinator_id,
        expires_at: input.expires_at,
    });
}
