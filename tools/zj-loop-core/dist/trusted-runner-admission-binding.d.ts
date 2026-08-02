import { type LocalExecutionPreflight, type LocalExecutionPreflightInput } from './local-execution-preflight.js';
import type { TrustedRunnerExecutionContext } from './trusted-runner.js';
import type { TrustedRunnerAdmissionBinding, TrustedRunnerExecutionAdmissionResult } from './trusted-runner-registry-store.js';
type AdmissionBindingFields = keyof Pick<TrustedRunnerAdmissionBinding, 'runner_id' | 'registry_revision' | 'registry_snapshot_digest' | 'capabilities_digest'>;
export type AdmissionBoundLocalExecutionPreflightInput = Omit<LocalExecutionPreflightInput, AdmissionBindingFields>;
export type AdmissionBoundTrustedRunnerExecutionContextInput = Omit<TrustedRunnerExecutionContext, AdmissionBindingFields>;
export type AdmissionBoundExecutionInput = {
    preflight: AdmissionBoundLocalExecutionPreflightInput;
    execution: Omit<AdmissionBoundTrustedRunnerExecutionContextInput, 'execution_id' | 'attempt' | 'preflight_digest'>;
    admission: TrustedRunnerExecutionAdmissionResult;
};
export type AdmissionBoundExecution = {
    binding: TrustedRunnerAdmissionBinding;
    preflight: LocalExecutionPreflight;
    execution: TrustedRunnerExecutionContext;
};
export declare function trustedRunnerAdmissionBundleDigest(value: AdmissionBoundExecution): string;
export declare function createAdmissionBoundLocalExecutionPreflight(input: {
    preflight: AdmissionBoundLocalExecutionPreflightInput;
    binding: TrustedRunnerAdmissionBinding;
}): LocalExecutionPreflight;
export declare function createAdmissionBoundTrustedRunnerExecutionContext(input: {
    execution: AdmissionBoundTrustedRunnerExecutionContextInput;
    binding: TrustedRunnerAdmissionBinding;
}): TrustedRunnerExecutionContext;
export declare function createAdmissionBoundExecution(input: AdmissionBoundExecutionInput): AdmissionBoundExecution;
export declare function validateAdmissionBoundExecution(input: unknown): {
    status: 'valid';
} | {
    status: 'blocked';
    reason: string;
};
export {};
