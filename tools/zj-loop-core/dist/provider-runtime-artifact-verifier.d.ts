import { type ProviderRuntimeArtifactManifest, type ProviderRuntimeArtifactTrustProfile } from './provider-runtime-artifact-manifest.js';
export type ProviderRuntimeArtifactVerification = {
    status: 'verified';
    manifest: ProviderRuntimeArtifactManifest;
} | {
    status: 'blocked';
    reason: string;
};
export declare function createProviderRuntimeArtifactVerifier(input: {
    manifest_path: string;
    runtime_artifact_path: string;
    helper_artifact_path: string;
    profile?: ProviderRuntimeArtifactTrustProfile;
    platform?: NodeJS.Platform;
    inspect_signature?: (filePath: string) => Promise<{
        identifier: string;
        team_id: string | null;
        code_directory_hash: string;
        kind: 'ad-hoc' | 'developer-id';
        notarized: boolean;
    }>;
}): {
    verify(): Promise<ProviderRuntimeArtifactVerification>;
};
