import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
export { BOOTSTRAP_CHANNEL_ROLES, BOOTSTRAP_PROTOCOL_PROFILE, BOOTSTRAP_REASON_DESCRIPTORS, bootstrapProfileSha256, getBootstrapReasonDescriptor, } from './bootstrap-protocol.js';
export const ORCHESTRATION_PLAN_PROFILE = 'orchestration-plan-v1-2026-07';
export const ORCHESTRATION_PLAN_CANONICALIZATION = 'jcs-rfc8785';
export const RESOURCE_ISOLATION_STRATEGIES = Object.freeze([
    'read-only-snapshot',
    'git-branch-worktree',
    'isolated-copy',
    'serialized-owner',
    'human-defined',
    'not-applicable',
    'needs-human-grill',
]);
export const RESOURCE_ISOLATION_DESCRIPTORS = Object.freeze([
    Object.freeze({ strategy_id: 'read-only-snapshot', allowed_access_modes: Object.freeze(['read']), required_evidence_fields: Object.freeze(['snapshot_digest']), allows_parallel_write: false, missing_evidence_code: 'resource-isolation-evidence-missing' }),
    Object.freeze({ strategy_id: 'git-branch-worktree', allowed_access_modes: Object.freeze(['read', 'read-write']), required_evidence_fields: Object.freeze(['branch', 'worktree_path', 'merge_owner']), allows_parallel_write: true, missing_evidence_code: 'resource-isolation-evidence-missing' }),
    Object.freeze({ strategy_id: 'isolated-copy', allowed_access_modes: Object.freeze(['read', 'read-write']), required_evidence_fields: Object.freeze(['copy_digest']), allows_parallel_write: true, missing_evidence_code: 'resource-isolation-evidence-missing' }),
    Object.freeze({ strategy_id: 'serialized-owner', allowed_access_modes: Object.freeze(['read', 'read-write', 'append-only']), required_evidence_fields: Object.freeze(['owner_id', 'serialization_key']), allows_parallel_write: false, missing_evidence_code: 'resource-isolation-evidence-missing' }),
    Object.freeze({ strategy_id: 'human-defined', allowed_access_modes: Object.freeze(['read', 'read-write', 'append-only']), required_evidence_fields: Object.freeze(['decision_ref']), allows_parallel_write: false, missing_evidence_code: 'resource-isolation-evidence-missing' }),
    Object.freeze({ strategy_id: 'not-applicable', allowed_access_modes: Object.freeze(['read']), required_evidence_fields: Object.freeze([]), allows_parallel_write: false, missing_evidence_code: 'resource-isolation-evidence-missing' }),
    Object.freeze({ strategy_id: 'needs-human-grill', allowed_access_modes: Object.freeze(['read', 'read-write', 'append-only']), required_evidence_fields: Object.freeze([]), allows_parallel_write: false, missing_evidence_code: 'resource-isolation-human-grill-required' }),
]);
export const CAPABILITY_RISK_DESCRIPTORS = Object.freeze([
    Object.freeze({ capability: 'artifact.read', risk_level: 'low', requires_review: false, requires_human_approval: false, auto_dispatch: true }),
    Object.freeze({ capability: 'artifact.write', risk_level: 'review-required', requires_review: true, requires_human_approval: false, auto_dispatch: false }),
    Object.freeze({ capability: 'credential.issue', risk_level: 'human-approval-required', requires_review: true, requires_human_approval: true, auto_dispatch: false }),
    Object.freeze({ capability: 'network.create', risk_level: 'human-approval-required', requires_review: true, requires_human_approval: true, auto_dispatch: false }),
]);
export const ORCHESTRATION_PLAN_PROTOCOL_PROFILE = Object.freeze({
    schema: 'zj-loop.protocol_profile.v1',
    profile_id: ORCHESTRATION_PLAN_PROFILE,
    canonicalization: ORCHESTRATION_PLAN_CANONICALIZATION,
    schema_version: 'zj-loop.orchestration_plan.v1',
    resource_isolation_strategies: RESOURCE_ISOLATION_STRATEGIES,
    resource_isolation_descriptors: RESOURCE_ISOLATION_DESCRIPTORS,
    capability_risk_descriptors: CAPABILITY_RISK_DESCRIPTORS,
});
export function orchestrationPlanProfileSha256() {
    const value = canonicalize(ORCHESTRATION_PLAN_PROTOCOL_PROFILE);
    if (typeof value !== 'string')
        throw new Error('orchestration-plan-profile-invalid');
    return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}
export function isResourceIsolationStrategy(value) {
    return typeof value === 'string' && RESOURCE_ISOLATION_STRATEGIES.includes(value);
}
export function getResourceIsolationDescriptor(strategy) {
    return RESOURCE_ISOLATION_DESCRIPTORS.find((descriptor) => descriptor.strategy_id === strategy);
}
export function getCapabilityRiskDescriptor(capability) {
    return CAPABILITY_RISK_DESCRIPTORS.find((descriptor) => descriptor.capability === capability);
}
