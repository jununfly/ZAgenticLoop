import { ORCHESTRATION_PLAN_CANONICALIZATION, ORCHESTRATION_PLAN_PROFILE, orchestrationPlanProfileSha256, type ResourceIsolationStrategy } from './protocol-registry.js';
export type OrchestrationNodeRole = 'center' | 'execution' | 'aggregation' | 'verification' | 'review-handoff';
export type OrchestrationEdgeType = 'control' | 'data' | 'verification' | 'recovery';
export type TaskStatus = 'planned' | 'ready' | 'claimed' | 'running' | 'blocked' | 'failed' | 'succeeded' | 'verified' | 'cancelled';
export type ResourceBinding = {
    resource_id: string;
    access_mode: 'read' | 'read-write' | 'append-only';
    isolation_strategy: ResourceIsolationStrategy;
    strategy_reason: string;
    merge_owner: string;
    unknowns: string[];
};
export type OrchestrationCapabilityGrant = {
    grant_id: string;
    network_id: string;
    plan_id: string;
    plan_revision: number;
    event_id: string;
    task_id: string;
    assigned_node: string;
    capabilities: string[];
    resource_scope: string[];
    issued_at: string;
    expires_at: string;
    grant_digest: string;
};
export type OrchestrationTask = {
    task_id: string;
    status: TaskStatus;
    inputs: string[];
    outputs: string[];
    resource_bindings: ResourceBinding[];
    capability_grant: OrchestrationCapabilityGrant;
    verification_conditions: string[];
};
export type OrchestrationNode = {
    node_id: string;
    role: OrchestrationNodeRole;
    assigned_node: string;
    task: OrchestrationTask;
};
export type OrchestrationEdge = {
    edge_id: string;
    from_node_id: string;
    to_node_id: string;
    type: OrchestrationEdgeType;
    input_ref?: string;
    output_ref?: string;
};
export type OrchestrationPlan = {
    schema: 'zj-loop.orchestration_plan.v1';
    protocol_version: 'orchestration-plan.v1';
    plan_id: string;
    plan_revision: number;
    network_id: string;
    event_id: string;
    status: 'draft' | 'preflight-ready' | 'dispatchable' | 'completed' | 'blocked' | 'cancelled';
    canonicalization: typeof ORCHESTRATION_PLAN_CANONICALIZATION;
    canonicalization_profile: typeof ORCHESTRATION_PLAN_PROFILE;
    profile_sha256: string;
    center_node_id: string;
    review_handoff_node_id: string;
    nodes: OrchestrationNode[];
    edges: OrchestrationEdge[];
    plan_digest: string;
};
export type PlanError = {
    code: string;
    path: string;
    message: string;
    severity: 'error';
    blocking: true;
};
export type PlanValidation = {
    status: 'valid' | 'blocked';
    errors: PlanError[];
    plan_digest: string;
};
export declare function createOrchestrationPlan(input: unknown): OrchestrationPlan;
export declare function orchestrationPlanDigest(plan: OrchestrationPlan): string;
export { orchestrationPlanProfileSha256 };
export declare function validateOrchestrationPlan(plan: OrchestrationPlan): PlanValidation;
