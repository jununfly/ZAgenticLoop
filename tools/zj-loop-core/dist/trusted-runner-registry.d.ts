import { type HumanSignature, type HumanSigner, type HumanSignerIdentity } from './human-signer.js';
export declare const TRUSTED_RUNNER_REGISTRY_MUTATION_SCHEMA: "zj-loop.trusted_runner_registry_mutation.v1";
type MutationAction = 'register' | 'rotate' | 'revoke';
export type TrustedRunnerRegistryMutation = {
    schema: typeof TRUSTED_RUNNER_REGISTRY_MUTATION_SCHEMA;
    network_id: string;
    mutation_id: string;
    action: MutationAction;
    runner_id: string;
    old_public_key_fingerprint?: string;
    new_public_key_fingerprint?: string;
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
};
export declare function createTrustedRunnerRegistryMutation(input: {
    signer: HumanSigner;
    network_id: string;
    mutation_id: string;
    action: MutationAction;
    runner_id: string;
    old_public_key_fingerprint?: string;
    new_public_key_fingerprint?: string;
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
export {};
