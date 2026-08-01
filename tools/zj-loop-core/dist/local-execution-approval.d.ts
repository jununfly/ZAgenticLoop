import { type HumanSigner, type HumanSignerIdentity, type HumanSignature } from './human-signer.js';
import { type LocalExecutionPreflight } from './local-execution-preflight.js';
export declare const LOCAL_EXECUTION_APPROVAL_SCHEMA: "zj-loop.local_execution_approval.v1";
export declare const LOCAL_EXECUTION_APPROVAL_PROFILE: "local-execution-approval-v1-2026-08";
export type LocalExecutionApproval = {
    schema: typeof LOCAL_EXECUTION_APPROVAL_SCHEMA;
    action: 'local.execution.approve';
    canonicalization_profile: typeof LOCAL_EXECUTION_APPROVAL_PROFILE;
    profile_sha256: string;
    network_id: string;
    plan_id: string;
    plan_revision: number;
    task_id: string;
    execution_id: string;
    attempt: number;
    provider_id: string;
    adapter_version: string;
    orchestration_preflight_digest: string;
    preflight_digest: string;
    request_id: string;
    issued_at: string;
    expires_at: string;
    human_id: string;
    public_key_fingerprint: string;
    signature: HumanSignature;
};
type ApprovalInput = {
    signer: HumanSigner;
    preflight: LocalExecutionPreflight;
    request_id: string;
    issued_at: string;
    expires_at: string;
};
export declare function createLocalExecutionApproval(input: ApprovalInput): Promise<LocalExecutionApproval>;
export declare function verifyLocalExecutionApproval(input: {
    approval: LocalExecutionApproval;
    identity: HumanSignerIdentity;
    now: string;
    expected: {
        preflight: LocalExecutionPreflight;
        request_id: string;
    };
}): {
    status: 'accepted';
} | {
    status: 'blocked';
    reason: string;
};
export {};
