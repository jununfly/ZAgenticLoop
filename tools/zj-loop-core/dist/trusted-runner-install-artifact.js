import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
export const TRUSTED_RUNNER_INSTALL_ARTIFACT_SCHEMA = 'zj-loop.trusted_runner_install_artifact.v1';
function canonical(value) {
    const json = canonicalize(value);
    if (typeof json !== 'string')
        throw new Error('trusted-runner-install-artifact-canonicalization-invalid');
    return json;
}
function digest(value) { return `sha256:${createHash('sha256').update(canonical(value), 'utf8').digest('hex')}`; }
function unsignedArtifact(value) {
    const { artifact_digest: _, ...unsigned } = value;
    return unsigned;
}
export function trustedRunnerInstallArtifactDigest(value) { return digest(unsignedArtifact(value)); }
export function trustedRunnerCapabilityProfileDigest(value) { return digest({ version: value.version, capabilities: [...new Set(value.capabilities)].sort() }); }
export function createTrustedRunnerInstallArtifact(input) {
    const capabilities = [...new Set(input.capability_profile.capabilities)].sort();
    const unsigned = { schema: TRUSTED_RUNNER_INSTALL_ARTIFACT_SCHEMA, ...input, capability_profile: { version: input.capability_profile.version, capabilities, profile_digest: trustedRunnerCapabilityProfileDigest({ version: input.capability_profile.version, capabilities }) }, side_effects_executed: false };
    const artifact = { ...unsigned, artifact_digest: digest(unsigned) };
    const result = validateTrustedRunnerInstallArtifact(artifact);
    if (result.status === 'blocked')
        throw new Error(result.reason);
    return artifact;
}
export function validateTrustedRunnerInstallArtifact(value) {
    try {
        if (!value || typeof value !== 'object' || Array.isArray(value))
            return { status: 'blocked', reason: 'trusted-runner-install-artifact-schema-invalid' };
        const item = value;
        if (item.schema !== TRUSTED_RUNNER_INSTALL_ARTIFACT_SCHEMA || item.side_effects_executed !== false || item.verification?.status !== 'verified')
            return { status: 'blocked', reason: 'trusted-runner-install-artifact-status-invalid' };
        if (!['macos', 'windows', 'linux'].includes(item.platform) || !item.artifact_id || !item.runner_id || !item.helper_path || !item.helper_version || !item.key_tag || !item.public_key_pem || !item.toolchain?.name || !item.toolchain?.version || !item.capability_profile?.version || !item.verification?.checked_at)
            return { status: 'blocked', reason: 'trusted-runner-install-artifact-fields-invalid' };
        if (!/^sha256:[0-9a-f]{64}$/.test(item.helper_digest) || !/^[0-9a-f]{64}$/.test(item.public_key_fingerprint) || !/^sha256:[0-9a-f]{64}$/.test(item.verification.evidence_digest) || !/^sha256:[0-9a-f]{64}$/.test(item.artifact_digest))
            return { status: 'blocked', reason: 'trusted-runner-install-artifact-digest-invalid' };
        if (!Array.isArray(item.capability_profile.capabilities) || item.capability_profile.capabilities.some((capability) => !['credential-cleanup', 'network-policy', 'output-bounds', 'process-boundary', 'secure-signing', 'worktree-observation'].includes(capability)))
            return { status: 'blocked', reason: 'trusted-runner-install-artifact-capabilities-invalid' };
        if (item.capability_profile.profile_digest !== trustedRunnerCapabilityProfileDigest(item.capability_profile))
            return { status: 'blocked', reason: 'trusted-runner-install-artifact-profile-digest-invalid' };
        if (item.artifact_digest !== trustedRunnerInstallArtifactDigest(item))
            return { status: 'blocked', reason: 'trusted-runner-install-artifact-digest-mismatch' };
        return { status: 'valid' };
    }
    catch {
        return { status: 'blocked', reason: 'trusted-runner-install-artifact-invalid' };
    }
}
