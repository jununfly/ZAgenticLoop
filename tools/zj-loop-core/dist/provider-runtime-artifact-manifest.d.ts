export declare const PROVIDER_RUNTIME_ARTIFACT_MANIFEST_SCHEMA: "zj-loop.provider_runtime_artifact_manifest.v1";
export type ProviderRuntimeArtifactTrustProfile = 'development-local' | 'production';
export type ProviderRuntimeArtifactManifest = {
    schema: typeof PROVIDER_RUNTIME_ARTIFACT_MANIFEST_SCHEMA;
    artifact_id: string;
    profile: ProviderRuntimeArtifactTrustProfile;
    platform: 'darwin' | 'win32' | 'linux';
    runtime_artifact_digest: string;
    helper_artifact_digest: string;
    runtime_code_directory_hash: string;
    helper_code_directory_hash: string;
    signing: {
        kind: 'ad-hoc' | 'developer-id';
        identifier: string;
        team_id: string | null;
        notarized: boolean;
    };
    version: string;
    created_at: string;
    manifest_digest: string;
};
export declare function providerRuntimeArtifactManifestDigest(value: ProviderRuntimeArtifactManifest): string;
export declare function createProviderRuntimeArtifactManifest(input: Omit<ProviderRuntimeArtifactManifest, 'schema' | 'manifest_digest'>): ProviderRuntimeArtifactManifest;
export declare function validateProviderRuntimeArtifactManifest(input: unknown, options?: {
    profile?: ProviderRuntimeArtifactTrustProfile;
}): {
    status: 'valid';
    manifest: ProviderRuntimeArtifactManifest;
} | {
    status: 'blocked';
    reason: string;
};
export declare function readProviderRuntimeArtifactManifest(filePath: string): Promise<ProviderRuntimeArtifactManifest>;
