import { type ProviderRuntimeIdentityBinding } from './provider-auth-runtime.js';
export declare const PROVIDER_RUNTIME_SERVICE_BINDING_SCHEMA: "zj-loop.provider_runtime_service_binding.v1";
export type ProviderRuntimeServiceBinding = {
    schema: typeof PROVIDER_RUNTIME_SERVICE_BINDING_SCHEMA;
    service_id: string;
    network_id: string;
    socket_path: string;
    provider_id: string;
    provider_executable: string;
    working_directory: string;
    contract_digest: string;
    adapter_contract_digest: string;
    runtime_binding: ProviderRuntimeIdentityBinding;
    pid: number;
    started_at: string;
    binding_digest: string;
};
export declare function createProviderRuntimeServiceBinding(input: Omit<ProviderRuntimeServiceBinding, 'schema' | 'binding_digest'>): ProviderRuntimeServiceBinding;
export declare function validateProviderRuntimeServiceBinding(value: unknown): {
    status: 'valid';
    binding: ProviderRuntimeServiceBinding;
} | {
    status: 'blocked';
    reason: string;
};
export declare function persistProviderRuntimeServiceBinding(filePath: string, binding: ProviderRuntimeServiceBinding): Promise<void>;
export declare function readProviderRuntimeServiceBinding(filePath: string): Promise<ProviderRuntimeServiceBinding>;
