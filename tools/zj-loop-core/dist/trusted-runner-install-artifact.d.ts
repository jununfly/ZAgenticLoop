import type { TrustedRunnerCapability } from './trusted-runner-registry.js';
export declare const TRUSTED_RUNNER_INSTALL_ARTIFACT_SCHEMA: "zj-loop.trusted_runner_install_artifact.v1";
type Platform = 'macos' | 'windows' | 'linux';
export type TrustedRunnerInstallArtifact = {
    schema: typeof TRUSTED_RUNNER_INSTALL_ARTIFACT_SCHEMA;
    artifact_id: string;
    platform: Platform;
    runner_id: string;
    helper_path: string;
    helper_digest: string;
    helper_version: string;
    toolchain: {
        name: string;
        version: string;
    };
    key_tag: string;
    public_key_pem: string;
    public_key_fingerprint: string;
    capability_profile: {
        version: string;
        capabilities: TrustedRunnerCapability[];
        profile_digest: string;
    };
    verification: {
        status: 'verified';
        checked_at: string;
        evidence_digest: string;
    };
    side_effects_executed: false;
    artifact_digest: string;
};
export declare function trustedRunnerInstallArtifactDigest(value: TrustedRunnerInstallArtifact): string;
export declare function trustedRunnerCapabilityProfileDigest(value: {
    version: string;
    capabilities: TrustedRunnerCapability[];
}): string;
export declare function createTrustedRunnerInstallArtifact(input: Omit<TrustedRunnerInstallArtifact, 'schema' | 'side_effects_executed' | 'artifact_digest' | 'capability_profile'> & {
    capability_profile: Omit<TrustedRunnerInstallArtifact['capability_profile'], 'profile_digest'>;
}): TrustedRunnerInstallArtifact;
export declare function validateTrustedRunnerInstallArtifact(value: unknown): {
    status: 'valid';
} | {
    status: 'blocked';
    reason: string;
};
export {};
