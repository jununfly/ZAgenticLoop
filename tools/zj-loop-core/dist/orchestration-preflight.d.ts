import type { HumanSignerIdentity } from './human-signer.js';
import { type OrchestrationCapabilityGrant, type OrchestrationPlan, type PlanError } from './orchestration-plan.js';
import { type OrchestrationPlanApproval, type OrchestrationPlanApprovalInput } from './orchestration-plan-approval.js';
export declare const ORCHESTRATION_PREFLIGHT_SCHEMA: "zj-loop.orchestration_preflight.v1";
export type IsolationEvidence = {
    resource_id: string;
    strategy: string;
    status: 'verified' | 'missing';
    evidence: Record<string, string>;
};
export type EnrollmentCapability = {
    node_id: string;
    network_id: string;
    status: 'approved' | 'pending' | 'revoked';
    capability_ceiling: string[];
};
export type OrchestrationPreflightInput = {
    plan: OrchestrationPlan;
    approval?: {
        context: OrchestrationPlanApproval;
        identity: HumanSignerIdentity;
        expected: OrchestrationPlanApprovalInput;
    };
    enrollment: Record<string, EnrollmentCapability>;
    isolation_evidence: IsolationEvidence[];
    provider_capabilities?: string[];
    now: string;
};
export type OrchestrationPreflightResult = {
    schema: typeof ORCHESTRATION_PREFLIGHT_SCHEMA;
    status: 'execution-ready' | 'blocked';
    side_effects_executed: false;
    plan_id: string;
    plan_revision: number;
    plan_digest: string;
    expires_at: string;
    errors: PlanError[];
    task_grants: Array<{
        task_id: string;
        node_id: string;
        capabilities: string[];
        resource_scope: string[];
        grant_digest?: string;
    }>;
    isolation: IsolationEvidence[];
};
export declare function orchestrationCapabilityGrantDigest(grant: OrchestrationCapabilityGrant): string;
export declare function evaluateOrchestrationPreflight(input: OrchestrationPreflightInput): OrchestrationPreflightResult;
