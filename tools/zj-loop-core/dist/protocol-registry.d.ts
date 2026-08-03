export { BOOTSTRAP_CHANNEL_ROLES, BOOTSTRAP_PROTOCOL_PROFILE, BOOTSTRAP_REASON_DESCRIPTORS, bootstrapProfileSha256, getBootstrapReasonDescriptor, } from './bootstrap-protocol.js';
export declare const ORCHESTRATION_PLAN_PROFILE: "orchestration-plan-v1-2026-07";
export declare const ORCHESTRATION_PLAN_CANONICALIZATION: "jcs-rfc8785";
export declare const RESOURCE_ISOLATION_STRATEGIES: readonly ["read-only-snapshot", "git-branch-worktree", "isolated-copy", "serialized-owner", "human-defined", "not-applicable", "needs-human-grill"];
export type ResourceIsolationStrategy = (typeof RESOURCE_ISOLATION_STRATEGIES)[number];
export type ResourceIsolationDescriptor = {
    strategy_id: ResourceIsolationStrategy;
    allowed_access_modes: readonly ('read' | 'read-write' | 'append-only')[];
    required_evidence_fields: readonly string[];
    allows_parallel_write: boolean;
    missing_evidence_code: 'resource-isolation-evidence-missing' | 'resource-isolation-human-grill-required';
};
export declare const RESOURCE_ISOLATION_DESCRIPTORS: readonly ResourceIsolationDescriptor[];
export type CapabilityRiskLevel = 'low' | 'review-required' | 'human-approval-required';
export type CapabilityRiskDescriptor = {
    capability: string;
    risk_level: CapabilityRiskLevel;
    requires_review: boolean;
    requires_human_approval: boolean;
    auto_dispatch: boolean;
};
export declare const CAPABILITY_RISK_DESCRIPTORS: readonly CapabilityRiskDescriptor[];
export declare const ORCHESTRATION_PLAN_PROTOCOL_PROFILE: Readonly<{
    schema: "zj-loop.protocol_profile.v1";
    profile_id: "orchestration-plan-v1-2026-07";
    canonicalization: "jcs-rfc8785";
    schema_version: "zj-loop.orchestration_plan.v1";
    resource_isolation_strategies: readonly ["read-only-snapshot", "git-branch-worktree", "isolated-copy", "serialized-owner", "human-defined", "not-applicable", "needs-human-grill"];
    resource_isolation_descriptors: readonly ResourceIsolationDescriptor[];
    capability_risk_descriptors: readonly CapabilityRiskDescriptor[];
}>;
export declare function orchestrationPlanProfileSha256(): string;
export declare function isResourceIsolationStrategy(value: unknown): value is ResourceIsolationStrategy;
export declare function getResourceIsolationDescriptor(strategy: unknown): ResourceIsolationDescriptor | undefined;
export declare function getCapabilityRiskDescriptor(capability: unknown): CapabilityRiskDescriptor | undefined;
