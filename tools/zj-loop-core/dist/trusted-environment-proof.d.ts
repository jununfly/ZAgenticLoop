export declare const TRUSTED_ENVIRONMENT_PROOF_SCHEMA: "zj-loop.trusted_environment_proof.v1";
export type NetworkPolicyMode = 'network-denied' | 'network-allowed';
export type TrustedNetworkPolicy = {
    mode: NetworkPolicyMode;
    policy_digest: string;
    status: 'proved' | 'blocked';
    evidence_digest: string;
};
export type TrustedEnvironmentExecution = {
    execution_id: string;
    attempt: number;
    preflight_digest: string;
    registry_snapshot_digest: string;
    argv_digest: string;
    cwd_digest: string;
    env_policy_digest: string;
    sandbox_policy_digest: string;
    network_policy: Pick<TrustedNetworkPolicy, 'mode' | 'policy_digest'>;
};
export type TrustedEnvironmentProof = {
    schema: typeof TRUSTED_ENVIRONMENT_PROOF_SCHEMA;
    status: 'signed' | 'blocked';
    proof_source: 'trusted-runner' | 'agent-self-report';
    proof_stage: 'pre-launch' | 'post-launch';
    runner_isolation: 'separate-process' | 'protected-sandbox' | 'same-process';
    runner_id: string;
    runner_version: string;
    execution_id: string;
    attempt: number;
    preflight_digest: string;
    registry_snapshot_digest: string;
    argv_digest: string;
    cwd_digest: string;
    env_policy_digest: string;
    sandbox_policy_digest: string;
    network_policy: TrustedNetworkPolicy;
    credentials: {
        status: 'clean' | 'blocked';
        evidence_digest: string;
        allowlist_digest: string;
    };
    issued_at: string;
    expires_at: string;
    proof_digest: string;
    signature: {
        algorithm: 'ECDSA-P256';
        public_key_pem: string;
        public_key_fingerprint: string;
        signature_base64: string;
    };
};
export type TrustedEnvironmentRegistry = {
    revision: number;
    digest: string;
    entries: Array<{
        runner_id: string;
        public_key_fingerprint: string;
        status: 'active' | 'revoked';
    }>;
};
export declare function createMacOSSeatbeltPolicy(mode: NetworkPolicyMode): string;
export declare function macosEnvironmentPolicyDigests(input: {
    network_policy: Pick<TrustedNetworkPolicy, 'mode'>;
    sandbox_policy: string;
    env_allowlist: string[];
    env: Record<string, string>;
}): {
    sandbox_policy_digest: string;
    env_policy_digest: string;
    policy_digest: string;
};
export declare function validateMacOSTrustedEnvironmentPolicy(input: {
    network_policy: Pick<TrustedNetworkPolicy, 'mode'>;
    sandbox_policy: string;
    env_allowlist: string[];
    env: Record<string, string>;
}): {
    status: 'accepted';
} | {
    status: 'blocked';
    reasons: string[];
};
export declare function trustedEnvironmentProofDigest(value: Omit<TrustedEnvironmentProof, 'proof_digest' | 'signature'>): string;
export declare function trustedEnvironmentRegistryDigest(entries: TrustedEnvironmentRegistry['entries']): string;
export declare function verifyTrustedEnvironmentProof(input: {
    proof: TrustedEnvironmentProof;
    execution: TrustedEnvironmentExecution;
    registry: TrustedEnvironmentRegistry;
    now?: string;
}): {
    status: 'accepted';
} | {
    status: 'blocked';
    reasons: string[];
};
export declare function createFakeTrustedEnvironmentProof(input: {
    runner_id: string;
    execution: TrustedEnvironmentExecution;
    now?: () => string;
    expires_in_ms?: number;
    network_policy_evidence_digest: string;
    credential_evidence_digest: string;
    allowlist_digest?: string;
}): {
    execution: TrustedEnvironmentExecution;
    proof: TrustedEnvironmentProof;
    registry: TrustedEnvironmentRegistry;
    private_key_pem: string;
};
