export declare const PROVIDER_RUNTIME_ADAPTER_CONTRACT_SCHEMA: "zj-loop.provider_runtime_adapter_contract.v1";
export declare const PROVIDER_RESULT_SCHEMA: "zj-loop.provider_result.v1";
export type ProviderRuntimeAdapterContract = {
    schema: typeof PROVIDER_RUNTIME_ADAPTER_CONTRACT_SCHEMA;
    adapter_id: string;
    adapter_version: string;
    binary_digest: string;
    argv_policy_digest: string;
    invocation_digest: string;
};
export type ProviderResult = {
    schema: typeof PROVIDER_RESULT_SCHEMA;
    status: 'completed' | 'failed' | 'cancelled' | 'timed-out';
    success: boolean;
    exit_code: number | null;
    signal: string | null;
    result?: string;
    stdout_digest: string;
    stderr_digest: string;
    usage_metadata?: Record<string, string | number>;
    evidence_refs?: string[];
};
export type ProviderRuntimeAdapter = {
    contract: ProviderRuntimeAdapterContract;
    invoke(input: {
        execution_id: string;
        attempt: number;
        task: Record<string, unknown>;
        launch_handle_digest: string;
    }): Promise<ProviderResult>;
};
export declare function providerRuntimeAdapterInvocationDigest(input: Pick<ProviderRuntimeAdapterContract, 'adapter_id' | 'adapter_version' | 'binary_digest' | 'argv_policy_digest'>): string;
export declare function providerRuntimeAdapterContractDigest(contract: ProviderRuntimeAdapterContract): string;
export declare function createProviderRuntimeAdapterContract(input: Omit<ProviderRuntimeAdapterContract, 'schema' | 'invocation_digest'>): ProviderRuntimeAdapterContract;
export declare function validateProviderRuntimeAdapterContract(value: unknown): {
    status: 'valid';
    contract: ProviderRuntimeAdapterContract;
} | {
    status: 'blocked';
    reason: string;
};
export declare function validateProviderResult(value: unknown): {
    status: 'valid';
    result: ProviderResult;
} | {
    status: 'blocked';
    reason: string;
};
export declare function providerResultFromLocalProcess(input: {
    status: ProviderResult['status'];
    success: boolean;
    exit_code: number | null;
    signal: string | null;
    stdout: string;
    stderr: string;
}): ProviderResult;
