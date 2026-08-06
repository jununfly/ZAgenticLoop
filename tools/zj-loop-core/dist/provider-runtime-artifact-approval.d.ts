import { type HumanSigner, type HumanSignerIdentity, type HumanSignature } from './human-signer.js';
import type { ProviderRuntimeArtifactManifest } from './provider-runtime-artifact-manifest.js';
export declare const PROVIDER_RUNTIME_ARTIFACT_APPROVAL_SCHEMA: "zj-loop.provider_runtime_artifact_approval.v1";
export declare const PROVIDER_RUNTIME_ARTIFACT_APPROVAL_ACTION: "provider.runtime.artifact.approve";
export declare const PROVIDER_RUNTIME_ARTIFACT_APPROVAL_PROFILE: "provider-runtime-artifact-approval-v1-2026-08";
export type ProviderRuntimeArtifactApproval = {
    schema: typeof PROVIDER_RUNTIME_ARTIFACT_APPROVAL_SCHEMA;
    action: typeof PROVIDER_RUNTIME_ARTIFACT_APPROVAL_ACTION;
    canonicalization_profile: typeof PROVIDER_RUNTIME_ARTIFACT_APPROVAL_PROFILE;
    profile_sha256: string;
    approval_id: string;
    revision: number;
    network_id: string;
    node_id: string;
    device_id: string;
    artifact_id: string;
    manifest_digest: string;
    artifact_profile: ProviderRuntimeArtifactManifest['profile'];
    platform: ProviderRuntimeArtifactManifest['platform'];
    issued_at: string;
    expires_at: string;
    human_id: string;
    signer_fingerprint: string;
    side_effects_executed: false;
    canonical_payload_digest: string;
    signature: HumanSignature;
};
export declare function createProviderRuntimeArtifactApproval(input: {
    signer: HumanSigner;
    network_id: string;
    node_id: string;
    device_id: string;
    manifest: Pick<ProviderRuntimeArtifactManifest, 'artifact_id' | 'manifest_digest' | 'profile' | 'platform'>;
    approval_id: string;
    revision: number;
    issued_at: string;
    expires_at: string;
}): Promise<ProviderRuntimeArtifactApproval>;
export declare function validateProviderRuntimeArtifactApproval(input: {
    approval: unknown;
    identity: HumanSignerIdentity;
    expected: {
        network_id: string;
        node_id: string;
        device_id: string;
        manifest: Pick<ProviderRuntimeArtifactManifest, 'artifact_id' | 'manifest_digest' | 'profile' | 'platform'>;
    };
    now?: string;
    revoked?: boolean;
}): {
    status: 'valid';
    approval: ProviderRuntimeArtifactApproval;
} | {
    status: 'blocked';
    reason: string;
};
