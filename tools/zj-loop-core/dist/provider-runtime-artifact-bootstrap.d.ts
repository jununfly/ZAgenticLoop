import { type ProviderRuntimeArtifactManifest } from './provider-runtime-artifact-manifest.js';
import { type ProviderRuntimeStartConfig } from './provider-runtime-start-config.js';
export declare const PROVIDER_RUNTIME_ARTIFACT_APPROVAL_CHALLENGE_SCHEMA: "zj-loop.provider_runtime_artifact_approval_challenge.v1";
export type ProviderRuntimeArtifactApprovalChallenge = {
    schema: typeof PROVIDER_RUNTIME_ARTIFACT_APPROVAL_CHALLENGE_SCHEMA;
    challenge_id: string;
    status: 'pending';
    network_id: string;
    node_id: string;
    device_id: string;
    artifact_id: string;
    manifest_digest: string;
    artifact_profile: ProviderRuntimeArtifactManifest['profile'];
    platform: ProviderRuntimeArtifactManifest['platform'];
    created_at: string;
    challenge_digest: string;
};
export type ProviderRuntimeArtifactBootstrapResult = {
    status: 'prepared';
    side_effects_executed: false;
    artifact_path: string;
    runtime_artifact_path: string;
    helper_artifact_path: string;
    manifest_path: string;
    challenge_path: string;
    start_config_path: string;
    manifest: ProviderRuntimeArtifactManifest;
    challenge: ProviderRuntimeArtifactApprovalChallenge;
    start_config: ProviderRuntimeStartConfig;
};
type SignatureFacts = {
    identifier: string;
    team_id: string | null;
    code_directory_hash: string;
    kind: 'ad-hoc' | 'developer-id';
    notarized: boolean;
};
export declare function bootstrapProviderRuntimeArtifact(input: {
    source_runtime_path: string;
    source_helper_path: string;
    artifact_root: string;
    base_config: ProviderRuntimeStartConfig;
    platform?: NodeJS.Platform;
    now?: () => string;
    inspect_signature?: (filePath: string) => Promise<SignatureFacts>;
    sign_artifact?: (filePath: string, identifier: string) => Promise<void>;
}): Promise<ProviderRuntimeArtifactBootstrapResult>;
export {};
