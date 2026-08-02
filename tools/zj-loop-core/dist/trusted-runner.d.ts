import type { ProviderAuthRef } from './provider-auth-runtime.js';
export declare const TRUSTED_RUNNER_PROTOCOL_SCHEMA: "zj-loop.trusted_runner_protocol.v1";
export declare const TRUSTED_RUNNER_PROOF_SCHEMA: "zj-loop.trusted_runner_proof.v1";
export declare const TRUSTED_RUNNER_OBSERVATION_SCHEMA: "zj-loop.trusted_runner_observation.v1";
export type TrustedRunnerExecutionContext = {
    runner_id: string;
    registry_revision: number;
    execution_id: string;
    attempt: number;
    preflight_digest: string;
    registry_snapshot_digest: string;
    capabilities_digest: string;
    provider_auth_ref: ProviderAuthRef;
    helper: {
        helper_id: string;
        helper_version: string;
        protocol_version: typeof TRUSTED_RUNNER_PROTOCOL_SCHEMA;
        executable_digest: string;
    };
};
export type TrustedRunnerProcessBoundary = {
    kind: 'process-group' | 'job-object';
    process_group_id: string | null;
    job_object_id: string | null;
    child_process_count: number;
    all_descendants_terminated: boolean;
    termination_sequence_digest: string;
    orphan_processes_detected: boolean;
    unknown_descendants_detected: boolean;
};
export type TrustedRunnerProof = {
    schema: typeof TRUSTED_RUNNER_PROOF_SCHEMA;
    status: 'signed' | 'blocked';
    runner_id: string;
    runner_version: string;
    registry_revision: number;
    execution_id: string;
    attempt: number;
    preflight_digest: string;
    registry_snapshot_digest: string;
    capabilities_digest: string;
    helper_digest: string;
    issued_at: string;
    expires_at: string;
    proof_digest: string;
    signature: TrustedRunnerSignature;
};
export type TrustedRunnerObservation = {
    schema: typeof TRUSTED_RUNNER_OBSERVATION_SCHEMA;
    status: 'signed' | 'uncertain';
    runner_id: string;
    registry_revision: number;
    execution_id: string;
    attempt: number;
    preflight_digest: string;
    proof_digest: string;
    registry_snapshot_digest: string;
    capabilities_digest: string;
    stdout_digest: string;
    stderr_digest: string;
    stdout_bytes: number;
    stderr_bytes: number;
    output_truncated: boolean;
    process_boundary: TrustedRunnerProcessBoundary;
    signature: TrustedRunnerSignature;
};
export type TrustedRunnerSignature = {
    algorithm: 'ECDSA-P256';
    public_key_pem: string;
    public_key_fingerprint: string;
    signature_base64: string;
};
export type TrustedRunner = {
    prepareExecution(input: {
        execution: TrustedRunnerExecutionContext;
    }): Promise<TrustedRunnerProof>;
    launch(input: {
        execution: TrustedRunnerExecutionContext;
        proof: TrustedRunnerProof;
    }): Promise<{
        status: 'launched';
        execution_id: string;
        attempt: number;
        process_boundary: TrustedRunnerProcessBoundary;
    }>;
    observe(input: {
        execution: TrustedRunnerExecutionContext;
        proof: TrustedRunnerProof;
        launch: {
            process_boundary: TrustedRunnerProcessBoundary;
        };
        output: {
            stdout: string;
            stderr: string;
        };
    }): Promise<TrustedRunnerObservation>;
    verifyBoundary(observation: TrustedRunnerObservation): {
        status: 'proved' | 'blocked';
        reason?: string;
    };
};
export declare function trustedRunnerProofDigest(proof: Omit<TrustedRunnerProof, 'proof_digest' | 'signature'>): string;
export declare function trustedRunnerObservationDigest(observation: Omit<TrustedRunnerObservation, 'signature'>): string;
export declare function createFakeTrustedRunner(input: {
    runner_id: string;
    runner_version?: string;
    now?: () => string;
    expires_in_ms?: number;
    boundary?: TrustedRunnerProcessBoundary;
}): TrustedRunner;
