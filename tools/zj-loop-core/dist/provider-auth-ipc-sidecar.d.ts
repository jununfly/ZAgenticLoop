import { type ProviderAuthRef, type ProviderAuthRuntime, type ProviderLaunchHandle, type ProviderRuntimeIdentityBinding } from './provider-auth-runtime.js';
import { type ProviderResult } from './provider-runtime-adapter.js';
import { type TrustedRunnerPeerIdentityVerifier } from './trusted-runner-peer-identity.js';
export type ProviderRuntimeSidecarInvocation = {
    status: ProviderResult['status'];
    success: boolean;
    pid: number;
    exit_code: number | null;
    signal: string | null;
    stdout: string;
    stderr: string;
    provider_result: ProviderResult;
};
export declare function createProviderAuthRuntimeIpcSidecar(input: {
    socket_path: string;
    correlation_id: string;
    expected_peer_identity_digest: string;
    verify_peer: TrustedRunnerPeerIdentityVerifier;
    runtime_binding: ProviderRuntimeIdentityBinding;
    challenge_ttl_ms?: number;
    runtime: ProviderAuthRuntime;
    auth_ref?: ProviderAuthRef;
    resolve_auth_ref?: (input: {
        auth_ref_digest: string;
        auth_ref?: ProviderAuthRef;
    }) => Promise<ProviderAuthRef | undefined> | ProviderAuthRef | undefined;
    contract_digest: string;
    adapter_contract_digest: string;
    invoke: (input: {
        task: Record<string, unknown>;
        handle: ProviderLaunchHandle;
    }) => Promise<ProviderRuntimeSidecarInvocation>;
    now?: () => string;
}): {
    start(): Promise<void>;
    close(): Promise<void>;
};
