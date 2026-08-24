import { NATIVE_CHECKPOINT_FIXTURE_SCHEMA, NATIVE_CHECKPOINT_RESUME_ORACLE_SCHEMA } from './native-checkpoint-fixture.js';
import { NATIVE_CHECKPOINT_ADAPTER_INPUT_SCHEMA, NATIVE_CHECKPOINT_ADAPTER_OUTPUT_SCHEMA } from './native-checkpoint-adapter.js';
export declare const NATIVE_CHECKPOINT_ADAPTER_BOUNDARY_SCHEMA: "zj-loop.native_checkpoint_adapter_boundary.v1";
export declare const NATIVE_CHECKPOINT_ADAPTER_CONTRACT_REVISION: 1;
/**
 * The adapter owns compatibility and translation risk, but native-core owns
 * all durable semantics. These values are the removal boundary for the probe.
 */
export declare const NATIVE_CHECKPOINT_ADAPTER_EXIT_BOUNDARY: Readonly<{
    readonly dependency_owner: "adapter";
    readonly version_skew_owner: "adapter";
    readonly state_translation_owner: "adapter";
    readonly exit_owner: "adapter";
    readonly native_fallback: "required";
    readonly provider_opaque_state: "not-persisted";
    readonly side_effects_executed: false;
    readonly on_dependency_missing: "blocked";
    readonly on_version_skew: "blocked";
    readonly on_contract_digest_drift: "blocked";
    readonly on_state_translation_loss: "blocked";
    readonly on_conformance_failure: "remove-and-rerun-native";
    readonly authority: Readonly<{
        resume_admission: "native-core";
        execution_lifecycle: "native-core";
        evidence: "native-core";
        human_acceptance: "native-core";
    }>;
}>;
export type NativeCheckpointAdapterProviderDependency = {
    provider_id: string;
    package_name: string;
    package_version: string;
    checkpoint_schema: string;
    artifact_digest: string;
};
export type NativeCheckpointAdapterNativeContractPin = {
    core_version: string;
    contract_revision: typeof NATIVE_CHECKPOINT_ADAPTER_CONTRACT_REVISION;
    input_schema: typeof NATIVE_CHECKPOINT_ADAPTER_INPUT_SCHEMA;
    output_schema: typeof NATIVE_CHECKPOINT_ADAPTER_OUTPUT_SCHEMA;
    fixture_schema: typeof NATIVE_CHECKPOINT_FIXTURE_SCHEMA;
    oracle_schema: typeof NATIVE_CHECKPOINT_RESUME_ORACLE_SCHEMA;
};
export type NativeCheckpointAdapterBoundaryContract = {
    schema: typeof NATIVE_CHECKPOINT_ADAPTER_BOUNDARY_SCHEMA;
    adapter_id: string;
    adapter_version: string;
    native_contract: NativeCheckpointAdapterNativeContractPin;
    provider_dependency: NativeCheckpointAdapterProviderDependency;
    exit_boundary: typeof NATIVE_CHECKPOINT_ADAPTER_EXIT_BOUNDARY;
    contract_digest: string;
};
export type NativeCheckpointAdapterCompatibilityExpectation = {
    adapter_id: string;
    adapter_version: string;
    core_version: string;
    provider_dependency: NativeCheckpointAdapterProviderDependency;
};
export type NativeCheckpointAdapterBoundaryValidation = {
    status: 'valid';
    contract: NativeCheckpointAdapterBoundaryContract;
} | {
    status: 'blocked';
    errors: string[];
};
export type NativeCheckpointAdapterCompatibilityValidation = {
    status: 'valid';
} | {
    status: 'blocked';
    errors: string[];
};
export type NativeCheckpointAdapterExitObservation = {
    dependency_available: boolean;
    compatibility: 'matched' | 'skewed';
    contract_digest: 'matched' | 'drifted';
    state_translation: 'preserved' | 'lossy';
    conformance: 'passed' | 'failed';
    native_fallback_available: boolean;
};
export type NativeCheckpointAdapterExitDecision = {
    status: 'ready';
    action: 'continue';
    reason: null;
    native_fallback_required: true;
    side_effects_executed: false;
} | {
    status: 'blocked';
    action: 'use-native-fallback' | 'stop';
    reason: 'dependency-missing' | 'version-skew' | 'contract-digest-drift' | 'state-translation-loss' | 'native-fallback-unavailable';
    native_fallback_required: true;
    side_effects_executed: false;
} | {
    status: 'retire';
    action: 'remove-and-rerun-native';
    reason: 'conformance-failure';
    native_fallback_required: true;
    side_effects_executed: false;
};
export declare function nativeCheckpointAdapterBoundaryDigest(value: NativeCheckpointAdapterBoundaryContract): string;
export declare function createNativeCheckpointAdapterBoundaryContract(input: Omit<NativeCheckpointAdapterBoundaryContract, 'schema' | 'contract_digest'>): NativeCheckpointAdapterBoundaryContract;
export declare function validateNativeCheckpointAdapterBoundaryContract(value: unknown): NativeCheckpointAdapterBoundaryValidation;
export declare function validateNativeCheckpointAdapterCompatibility(input: {
    contract: NativeCheckpointAdapterBoundaryContract;
    expected: NativeCheckpointAdapterCompatibilityExpectation;
}): NativeCheckpointAdapterCompatibilityValidation;
export declare function evaluateNativeCheckpointAdapterExit(input: NativeCheckpointAdapterExitObservation): NativeCheckpointAdapterExitDecision;
