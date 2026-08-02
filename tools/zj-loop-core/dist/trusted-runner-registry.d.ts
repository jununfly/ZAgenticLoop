import { type HumanSignature, type HumanSigner, type HumanSignerIdentity } from './human-signer.js';
export declare const TRUSTED_RUNNER_REGISTRY_MUTATION_SCHEMA: "zj-loop.trusted_runner_registry_mutation.v1";
export declare const TRUSTED_RUNNER_CAPABILITY_SCHEMA: "zj-loop.trusted_runner_capability.v1";
export declare const TRUSTED_RUNNER_CAPABILITIES: readonly ["credential-cleanup", "network-policy", "output-bounds", "process-boundary", "secure-signing", "worktree-observation"];
export type TrustedRunnerCapability = typeof TRUSTED_RUNNER_CAPABILITIES[number];
export type TrustedRunnerRegistryMutationAction = 'register' | 'rotate' | 'revoke' | 'update-capabilities';
export type TrustedRunnerRegistryMutation = {
    schema: typeof TRUSTED_RUNNER_REGISTRY_MUTATION_SCHEMA;
    network_id: string;
    mutation_id: string;
    action: TrustedRunnerRegistryMutationAction;
    runner_id: string;
    platform?: 'macos' | 'windows' | 'linux';
    helper_version?: string;
    helper_digest?: string;
    capability_profile_digest?: string;
    old_public_key_fingerprint?: string;
    new_public_key_fingerprint?: string;
    old_capabilities_digest?: string;
    capabilities?: string[];
    expected_revision?: number;
    reason: string;
    occurred_at: string;
    human_id: string;
    signer_fingerprint: string;
    canonical_payload_digest: string;
    signature: HumanSignature;
    side_effects_executed: false;
};
export type TrustedRunnerRegistryEntry = {
    runner_id: string;
    public_key_fingerprint: string;
    status: 'active' | 'revoked';
    platform?: 'macos' | 'windows' | 'linux';
    helper_version?: string;
    helper_digest?: string;
    capability_profile_digest?: string;
    capabilities?: string[];
};
export declare function validateTrustedRunnerCapabilities(capabilities?: string[]): {
    status: 'valid' | 'blocked';
    errors: string[];
};
export declare function trustedRunnerCapabilitiesDigest(capabilities?: string[]): string;
export declare function createTrustedRunnerRegistryMutation(input: {
    signer: HumanSigner;
    network_id: string;
    mutation_id: string;
    action: TrustedRunnerRegistryMutationAction;
    runner_id: string;
    platform?: 'macos' | 'windows' | 'linux';
    helper_version?: string;
    helper_digest?: string;
    capability_profile_digest?: string;
    old_public_key_fingerprint?: string;
    new_public_key_fingerprint?: string;
    old_capabilities_digest?: string;
    capabilities?: string[];
    expected_revision?: number;
    reason: string;
    occurred_at: string;
}): Promise<TrustedRunnerRegistryMutation>;
export declare function validateTrustedRunnerRegistryMutation(input: {
    mutation: TrustedRunnerRegistryMutation;
    identity: HumanSignerIdentity;
    now?: string;
}): {
    status: 'valid' | 'blocked';
    errors: string[];
};
export declare function applyTrustedRunnerRegistryMutation(input: {
    registry: TrustedRunnerRegistryEntry[];
    history: TrustedRunnerRegistryMutation[];
    mutation: TrustedRunnerRegistryMutation;
    identity: HumanSignerIdentity;
}): {
    status: 'recorded' | 'duplicate' | 'blocked';
    registry: TrustedRunnerRegistryEntry[];
    reason?: string;
};
