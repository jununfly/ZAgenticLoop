import type { TrustedRunnerProcessBoundary, TrustedRunnerSignature } from './trusted-runner.js';
import { type TrustedEnvironmentProof, type NetworkPolicyMode } from './trusted-environment-proof.js';
export declare const MACOS_TRUSTED_RUNNER_ADAPTER_SCHEMA: "zj-loop.macos_trusted_runner_adapter.v1";
export type MacOSTrustedRunnerObservation = {
    schema: 'zj-loop.macos_trusted_runner_observation.v1';
    status: 'completed' | 'timed-out';
    runner_id: string;
    execution_id: string;
    attempt: number;
    preflight_digest: string;
    proof_digest: string;
    registry_snapshot_digest: string;
    process_boundary: TrustedRunnerProcessBoundary;
    exit_code?: number;
    signal?: number;
    stdout: string;
    stderr: string;
    stdout_digest: string;
    stderr_digest: string;
    stdout_bytes: number;
    stderr_bytes: number;
    output_truncated: boolean;
    environment_proof: TrustedEnvironmentProof;
    signature: TrustedRunnerSignature;
};
export type MacOSTrustedRunnerExecution = {
    runner_id: string;
    execution_id: string;
    attempt: number;
    preflight_digest: string;
    proof_digest: string;
    registry_snapshot_digest: string;
    network_policy: {
        mode: NetworkPolicyMode;
        policy_digest: string;
    };
};
export type MacOSTrustedEnvironment = {
    cwd: string;
    network_policy: {
        mode: NetworkPolicyMode;
    };
    sandbox_policy: string;
    env_allowlist: string[];
    env: Record<string, string>;
};
export type MacOSTrustedRunnerRegistrySnapshot = {
    revision: number;
    digest: string;
    entries: Array<{
        runner_id: string;
        public_key_fingerprint: string;
        status: 'active' | 'revoked';
    }>;
};
export declare function verifyMacOSTrustedRunnerObservation(input: {
    observation: MacOSTrustedRunnerObservation;
    execution: MacOSTrustedRunnerExecution;
    registry: MacOSTrustedRunnerRegistrySnapshot;
    argv: string[];
    environment: MacOSTrustedEnvironment;
}): {
    status: 'accepted';
} | {
    status: 'blocked';
    reasons: string[];
};
export declare function macosTrustedRunnerRegistryDigest(entries: MacOSTrustedRunnerRegistrySnapshot['entries']): string;
export declare function createMacOSTrustedRunnerAdapter(input: {
    helper_path: string;
    helper_digest: string;
    helper_timeout_ms?: number;
    registry: MacOSTrustedRunnerRegistrySnapshot;
}): {
    run(request: {
        key_tag: string;
        execution: MacOSTrustedRunnerExecution;
        argv: string[];
        environment: MacOSTrustedEnvironment;
        timeout_ms: number;
        termination_grace_ms: number;
    }): Promise<{
        status: 'accepted' | 'blocked' | 'outcome-uncertain';
        observation?: MacOSTrustedRunnerObservation;
        reasons?: string[];
    }>;
};
