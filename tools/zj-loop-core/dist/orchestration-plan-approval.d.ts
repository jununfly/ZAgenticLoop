import type { HumanSigner, HumanSignerIdentity, HumanSignature } from './human-signer.js';
import { ORCHESTRATION_PLAN_CANONICALIZATION } from './protocol-registry.js';
export declare const ORCHESTRATION_PLAN_APPROVAL_SCHEMA: "zj-loop.orchestration_plan_approval.v1";
export declare const ORCHESTRATION_PLAN_APPROVAL_PROFILE: "orchestration-plan-approval-v1-2026-07";
export type OrchestrationPlanApprovalInput = {
    network_id: string;
    plan_id: string;
    plan_revision: number;
    plan_digest: string;
    request_id: string;
    approved_capabilities: string[];
    issued_at: string;
    expires_at: string;
    device_key_id: string;
    device_fingerprint: string;
};
export type OrchestrationPlanApproval = OrchestrationPlanApprovalInput & {
    schema: typeof ORCHESTRATION_PLAN_APPROVAL_SCHEMA;
    action: 'orchestration.plan.approve';
    human_id: string;
    public_key_fingerprint: string;
    signature: HumanSignature;
    canonicalization: typeof ORCHESTRATION_PLAN_CANONICALIZATION;
    canonicalization_profile: typeof ORCHESTRATION_PLAN_APPROVAL_PROFILE;
    profile_sha256: string;
};
export type OrchestrationPlanApprovalVerification = {
    status: 'accepted';
} | {
    status: 'blocked';
    reason: string;
};
export declare function orchestrationPlanApprovalProfileSha256(): string;
export declare function createOrchestrationPlanApproval(input: OrchestrationPlanApprovalInput & {
    signer: HumanSigner;
}): Promise<OrchestrationPlanApproval>;
export declare function verifyOrchestrationPlanApproval(input: {
    approval: OrchestrationPlanApproval;
    identity: HumanSignerIdentity;
    expected: OrchestrationPlanApprovalInput;
    now: string;
}): OrchestrationPlanApprovalVerification;
