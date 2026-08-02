import { type ProviderAuthIpcFrame } from './provider-auth-ipc-protocol.js';
import { type ProviderLaunchHandle } from './provider-auth-runtime.js';
export type ProviderRuntimeIpcCleanupInput = {
    socket_path: string;
    correlation_id?: string;
    handle: ProviderLaunchHandle;
    network_id: string;
    node_id: string;
    provider_id: string;
    execution_id: string;
    attempt: number;
    timeout_ms?: number;
    cleaned_at?: string;
};
export declare function createProviderRuntimeIpcCleanupCoordinator(input: ProviderRuntimeIpcCleanupInput): () => Promise<{
    status: 'cleaned';
    proof_digest: string;
} | {
    status: 'uncertain';
    reason: string;
}>;
export declare function createProviderRuntimeCleanupRequest(input: {
    correlation_id: string;
    sequence?: number;
    handle: ProviderLaunchHandle;
    network_id: string;
    node_id: string;
    provider_id: string;
    execution_id: string;
    attempt: number;
    cleaned_at: string;
}): ProviderAuthIpcFrame;
