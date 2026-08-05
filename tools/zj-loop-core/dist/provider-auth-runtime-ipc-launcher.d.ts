import { type LocalProcessAdapter } from './local-process-adapter.js';
import type { ProviderAuthRef, ProviderAuthRuntime, ProviderRuntimeIdentityBinding } from './provider-auth-runtime.js';
import type { TrustedRunnerPeerIdentityVerifier } from './trusted-runner-peer-identity.js';
export type ProviderAuthRuntimeIpcLauncher = {
    start(): Promise<void>;
    readiness(): Promise<{
        status: 'ready';
        socket_path: string;
    } | {
        status: 'blocked';
        reason: 'provider-runtime-ipc-unavailable';
    }>;
    close(): Promise<void>;
};
export declare function createProviderAuthRuntimeIpcLauncher(input: {
    socket_path: string;
    correlation_id: string;
    expected_peer_identity_digest: string;
    verify_peer: TrustedRunnerPeerIdentityVerifier;
    runtime: ProviderAuthRuntime;
    auth_ref?: ProviderAuthRef;
    resolve_auth_ref?: (input: {
        auth_ref_digest: string;
        auth_ref?: ProviderAuthRef;
    }) => Promise<ProviderAuthRef | undefined> | ProviderAuthRef | undefined;
    contract_digest: string;
    adapter_contract_digest: string;
    runtime_binding: ProviderRuntimeIdentityBinding;
    provider_executable: string;
    working_directory: string;
    process_adapter?: LocalProcessAdapter;
    invocation_timeout_ms?: number;
    termination_grace_ms?: number;
}): ProviderAuthRuntimeIpcLauncher;
