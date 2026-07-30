import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
import { validateOrchestrationPlan } from './orchestration-plan.js';
import { verifyOrchestrationPlanApproval } from './orchestration-plan-approval.js';
import { getResourceIsolationDescriptor } from './protocol-registry.js';
export const ORCHESTRATION_PREFLIGHT_SCHEMA = 'zj-loop.orchestration_preflight.v1';
function preflightError(code, path, message) { return { code, path, message, severity: 'error', blocking: true }; }
function digest(value) { const json = canonicalize(value); if (typeof json !== 'string')
    throw new Error('orchestration-preflight-canonicalization-invalid'); return `sha256:${createHash('sha256').update(json).digest('hex')}`; }
export function orchestrationCapabilityGrantDigest(grant) {
    const { grant_digest: _, ...unsigned } = grant;
    return digest(unsigned);
}
export function evaluateOrchestrationPreflight(input) {
    const errors = [];
    const validation = validateOrchestrationPlan(input.plan);
    errors.push(...validation.errors);
    if (!input.approval)
        errors.push(preflightError('human-approval-required', '$.approval', 'Human approval is required before execution-ready'));
    else {
        const approval = verifyOrchestrationPlanApproval({ approval: input.approval.context, identity: input.approval.identity, expected: input.approval.expected, now: input.now });
        if (approval.status === 'blocked')
            errors.push(preflightError(`human-approval-${approval.reason}`, '$.approval', 'Human approval does not match the current Plan'));
    }
    const providerCapabilities = new Set(input.provider_capabilities ?? []);
    const evidenceByResource = new Map(input.isolation_evidence.map((evidence) => [evidence.resource_id, evidence]));
    const taskGrants = [];
    const writeBindings = new Map();
    for (const node of input.plan.nodes) {
        const enrollment = input.enrollment[node.assigned_node];
        if (!enrollment || enrollment.network_id !== input.plan.network_id || enrollment.status !== 'approved')
            errors.push(preflightError('enrollment-not-execution-ready', `$.nodes.${node.node_id}`, 'assigned node enrollment is not approved for this network'));
        const grant = node.task.capability_grant;
        if (grant.grant_digest !== orchestrationCapabilityGrantDigest(grant))
            errors.push(preflightError('capability-grant-digest-invalid', `$.nodes.${node.node_id}.task.capability_grant.grant_digest`, 'grant digest does not match the canonical grant fields'));
        const allowed = new Set([...(enrollment?.capability_ceiling ?? [])]);
        const approvalCapabilities = new Set(input.approval?.context.approved_capabilities ?? []);
        const capabilities = [...new Set(grant.capabilities)].sort();
        for (const capability of capabilities) {
            if (!allowed.has(capability))
                errors.push(preflightError('capability-exceeds-enrollment', `$.nodes.${node.node_id}.task.capability_grant`, `capability ${capability} exceeds enrollment ceiling`));
            if (!approvalCapabilities.has(capability))
                errors.push(preflightError('capability-exceeds-human-approval', `$.nodes.${node.node_id}.task.capability_grant`, `capability ${capability} is not Human-approved`));
            if (input.provider_capabilities && !providerCapabilities.has(capability))
                errors.push(preflightError('provider-capability-missing', `$.nodes.${node.node_id}.task.capability_grant`, `provider lacks capability ${capability}`));
        }
        for (const binding of node.task.resource_bindings) {
            const evidence = evidenceByResource.get(binding.resource_id);
            const descriptor = getResourceIsolationDescriptor(binding.isolation_strategy);
            if (!descriptor || !descriptor.allowed_access_modes.includes(binding.access_mode))
                errors.push(preflightError('resource-isolation-access-mode-invalid', `$.nodes.${node.node_id}.task.resource_bindings`, 'access mode is not allowed by the isolation descriptor'));
            if (descriptor?.strategy_id === 'needs-human-grill')
                errors.push(preflightError('resource-isolation-human-grill-required', `$.nodes.${node.node_id}.task.resource_bindings`, 'resource isolation requires Human Grill'));
            if (!evidence || evidence.strategy !== binding.isolation_strategy || evidence.status !== 'verified' || descriptor?.required_evidence_fields.some((field) => !evidence.evidence[field]))
                errors.push(preflightError(descriptor?.missing_evidence_code ?? 'resource-isolation-evidence-missing', `$.nodes.${node.node_id}.task.resource_bindings`, 'resource isolation lacks verified descriptor evidence'));
            if (binding.access_mode !== 'read') {
                const previous = writeBindings.get(binding.resource_id);
                if (previous && (!descriptor?.allows_parallel_write || previous.strategy === 'not-applicable'))
                    errors.push(preflightError('parallel-resource-write-unsafe', `$.nodes.${node.node_id}.task.resource_bindings`, `resource write overlaps ${previous.node_id}`));
                else
                    writeBindings.set(binding.resource_id, { node_id: node.node_id, strategy: binding.isolation_strategy });
            }
        }
        if (errors.length === 0)
            taskGrants.push({ task_id: grant.task_id, node_id: node.node_id, capabilities, resource_scope: [...grant.resource_scope].sort(), grant_digest: grant.grant_digest });
    }
    const uniqueErrors = [...new Map(errors.map((item) => [`${item.path}:${item.code}:${item.message}`, item])).values()].sort((a, b) => `${a.path}:${a.code}`.localeCompare(`${b.path}:${b.code}`));
    const expiresAt = input.approval?.context.expires_at ?? input.now;
    return { schema: ORCHESTRATION_PREFLIGHT_SCHEMA, status: uniqueErrors.length === 0 ? 'execution-ready' : 'blocked', side_effects_executed: false, plan_id: input.plan.plan_id, plan_revision: input.plan.plan_revision, plan_digest: input.plan.plan_digest, expires_at: expiresAt, errors: uniqueErrors, task_grants: uniqueErrors.length === 0 ? taskGrants : [], isolation: input.isolation_evidence.map((evidence) => ({ ...evidence, evidence: { ...evidence.evidence } })) };
}
