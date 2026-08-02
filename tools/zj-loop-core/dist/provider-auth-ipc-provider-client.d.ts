import { type ProviderLaunchHandle } from './provider-auth-runtime.js';
import { type ProviderResult } from './provider-runtime-adapter.js';
export type ProviderRuntimeIpcRunResult = {
    status: ProviderResult['status'];
    success: boolean;
    pid: number;
    exit_code: number | null;
    signal: string | null;
    stdout: string;
    stderr: string;
    provider_result: ProviderResult;
    launch_handle: ProviderLaunchHandle;
};
export declare function createProviderRuntimeIpcProvider(input: {
    socket_path: string;
    correlation_id?: string;
    network_id: string;
    node_id: string;
    provider_runtime_id: string;
    provider_id: string;
    execution_id: string;
    attempt: number;
    auth_ref_digest: string;
    contract_digest: string;
    adapter_contract_digest: string;
    timeout_ms?: number;
    task?: Record<string, unknown>;
}): {
    run(input: {
        cwd: string;
        prompt: string;
        executable: string;
    }): Promise<ProviderRuntimeIpcRunResult>;
    getLaunchHandle(): ProviderLaunchHandle | undefined;
};
