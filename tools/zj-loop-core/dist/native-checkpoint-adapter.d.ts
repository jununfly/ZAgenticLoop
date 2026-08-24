import { type NativeCheckpointAuthority } from './native-checkpoint-fixture.js';
export declare const NATIVE_CHECKPOINT_ADAPTER_INPUT_SCHEMA: "zj-loop.native_checkpoint_adapter_input.v1";
export declare const NATIVE_CHECKPOINT_ADAPTER_OUTPUT_SCHEMA: "zj-loop.native_checkpoint_adapter_output.v1";
export type NativeCheckpointAdapterCheckpointBinding = {
    source_execution_id: string;
    source_task_id: string;
    source_attempt: number;
    source_revision: number;
    checkpoint_namespace: string;
    checkpoint_id: string;
    artifact_ref: string;
    state_digest: string;
};
export type NativeCheckpointAdapterExecutionIdentity = {
    execution_id: string;
    task_id: string;
    attempt: number;
    agent_id: string;
};
export type NativeCheckpointAdapterResume = {
    execution_id: string;
    task_id: string;
    attempt: number;
    agent_id: string;
    checkpoint_namespace: string;
    checkpoint_id: string;
    state_digest: string;
};
export type NativeCheckpointAdapterInput = {
    schema: typeof NATIVE_CHECKPOINT_ADAPTER_INPUT_SCHEMA;
    adapter_id: string;
    network_id: string;
    checkpoint: NativeCheckpointAdapterCheckpointBinding;
    native_execution: NativeCheckpointAdapterExecutionIdentity;
    authority: NativeCheckpointAuthority;
    input_digest: string;
};
export type NativeCheckpointAdapterOutput = {
    schema: typeof NATIVE_CHECKPOINT_ADAPTER_OUTPUT_SCHEMA;
    adapter_id: string;
    network_id: string;
    input_digest: string;
    checkpoint: NativeCheckpointAdapterCheckpointBinding;
    native_execution: NativeCheckpointAdapterExecutionIdentity;
    resume: NativeCheckpointAdapterResume;
    status: 'resumed' | 'duplicate';
    delivery: {
        delivery_id: string;
        disposition: 'accepted' | 'duplicate';
    };
    authority: NativeCheckpointAuthority;
    output_digest: string;
};
export type NativeCheckpointAdapterInputResult = {
    status: 'valid';
    value: NativeCheckpointAdapterInput;
} | {
    status: 'blocked';
    errors: string[];
};
export type NativeCheckpointAdapterOutputResult = {
    status: 'valid';
    value: NativeCheckpointAdapterOutput;
} | {
    status: 'blocked';
    errors: string[];
};
export type NativeCheckpointAdapterBindingResult = {
    status: 'valid';
} | {
    status: 'blocked';
    errors: string[];
};
export declare function nativeCheckpointAdapterInputDigest(value: NativeCheckpointAdapterInput): string;
export declare function nativeCheckpointAdapterOutputDigest(value: NativeCheckpointAdapterOutput): string;
export declare function createNativeCheckpointAdapterInput(input: Omit<NativeCheckpointAdapterInput, 'schema' | 'input_digest'>): NativeCheckpointAdapterInput;
export declare function createNativeCheckpointAdapterOutput(input: {
    input: NativeCheckpointAdapterInput;
    status: 'resumed' | 'duplicate';
    delivery_id: string;
    resume?: NativeCheckpointAdapterResume;
}): NativeCheckpointAdapterOutput;
export declare function validateNativeCheckpointAdapterInput(value: unknown): NativeCheckpointAdapterInputResult;
export declare function validateNativeCheckpointAdapterOutput(value: unknown): NativeCheckpointAdapterOutputResult;
export declare function validateNativeCheckpointAdapterBinding(input: {
    input: NativeCheckpointAdapterInput;
    output: NativeCheckpointAdapterOutput;
}): NativeCheckpointAdapterBindingResult;
