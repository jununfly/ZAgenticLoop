import { createMacOSProcessAuditPeerIdentityVerifier } from './macos-process-audit-peer-identity.js';
import { createProviderAuthRuntimeIpcLauncher } from './provider-auth-runtime-ipc-launcher.js';
import { createProviderRuntimeArtifactVerifier } from './provider-runtime-artifact-verifier.js';
export function createMacOSProviderRuntimeLauncher(input) {
    if (process.platform !== 'darwin')
        throw new Error('provider-runtime-macos-launcher-platform-unsupported');
    if (!input.resolver || typeof input.resolver.resolve !== 'function')
        throw new Error('provider-runtime-launcher-resolver-required');
    if (!input.macos_helper_path || !input.macos_helper_digest)
        throw new Error('provider-runtime-launcher-macos-helper-required');
    const verify_peer = createMacOSProcessAuditPeerIdentityVerifier({ helper_path: input.macos_helper_path, helper_digest: input.macos_helper_digest });
    const launcher = createProviderAuthRuntimeIpcLauncher({
        socket_path: input.config.socket_path,
        correlation_id: input.config.correlation_id,
        expected_peer_identity_digest: input.config.expected_peer_identity_digest,
        verify_peer,
        runtime: input.runtime,
        resolve_auth_ref: async ({ auth_ref_digest }) => input.resolver.resolve({ auth_ref_digest }),
        contract_digest: input.config.contract_digest,
        adapter_contract_digest: input.config.adapter_contract_digest,
        runtime_binding: input.config.runtime_binding,
        provider_executable: input.config.provider_executable,
        working_directory: input.config.working_directory,
        process_adapter: input.process_adapter,
    });
    if (!input.config.artifact_manifest_path || !input.config.runtime_artifact_path || !input.config.helper_artifact_path)
        return launcher;
    const artifactVerifier = createProviderRuntimeArtifactVerifier({ manifest_path: input.config.artifact_manifest_path, runtime_artifact_path: input.config.runtime_artifact_path, helper_artifact_path: input.config.helper_artifact_path, profile: input.config.artifact_profile });
    return {
        async start() {
            const result = await artifactVerifier.verify();
            if (result.status === 'blocked')
                throw new Error(result.reason);
            await launcher.start();
        },
        readiness: launcher.readiness,
        close: launcher.close,
    };
}
