export declare const REAL_AGENT_DOGFOOD_DIGEST_PROFILE: "zj-loop.real-agent-dogfood-digest.v1";
export declare function realAgentDogfoodExecutionBindingDigest(input: {
    plan_definition_digest: string;
    execution_id: string;
    attempt: number;
    human_approval_digest: string;
    provider_id: string;
    adapter_contract_digest: string;
    resource_scope: readonly string[];
    network_policy: string;
    timeout_ms: number;
    runtime_identity_digest: string;
}): string;
export declare function realAgentDogfoodCoordinatorLeaseDigest(input: {
    execution_binding_digest: string;
    execution_id: string;
    session_id: string;
    lease_id: string;
    human_id: string;
    coordinator_id: string;
    expires_at: string;
}): string;
export declare function realAgentDogfoodWorkerLeaseDigest(input: {
    execution_binding_digest: string;
    execution_id: string;
    lease_id: string;
    worker_id: string;
    expires_at: string;
}): string;
