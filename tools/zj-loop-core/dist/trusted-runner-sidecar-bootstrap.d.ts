import { type BootstrapFrame } from './bootstrap-protocol.js';
declare const FD_CHANNELS: readonly [Readonly<{
    channel_role: "secret";
    direction: "trusted-runner-to-sidecar";
    ownership: "trusted-runner";
    fd: 3;
    close_on_exec: true;
}>, Readonly<{
    channel_role: "identity-binding";
    direction: "trusted-runner-to-sidecar";
    ownership: "trusted-runner";
    fd: 4;
    close_on_exec: true;
}>, Readonly<{
    channel_role: "status";
    direction: "sidecar-to-trusted-runner";
    ownership: "sidecar";
    fd: 5;
    close_on_exec: true;
}>];
export type TrustedRunnerSidecarLaunchContract = {
    schema: 'zj-loop.trusted_runner_sidecar_launch_contract.v1';
    execution_id: string;
    attempt: number;
    sidecar_argv: string[];
    worker_argv: string[];
    endpoint_path: string;
    bootstrap_profile_sha256: string;
    execution_binding_digest: string;
    fd_channels: typeof FD_CHANNELS;
    worker_inherited_fd_roles: readonly [];
    process_group: {
        owner: 'trusted-runner';
        mode: 'posix-process-group';
        root: 'sidecar';
    };
    secret: {
        content_type: string;
        byte_length: number;
    };
    contract_digest: string;
};
export declare function trustedRunnerSidecarContractDigest(value: Omit<TrustedRunnerSidecarLaunchContract, 'contract_digest'> | TrustedRunnerSidecarLaunchContract): string;
export declare function createTrustedRunnerSidecarLaunchContract(input: {
    execution_id: string;
    attempt: number;
    sidecar_argv: string[];
    worker_argv: string[];
    endpoint_path: string;
    bootstrap_profile_sha256: string;
    execution_binding_digest: string;
    secret_content_type: string;
    secret_byte_length: number;
}): TrustedRunnerSidecarLaunchContract;
export declare function createTrustedRunnerSidecarBootstrap(input: {
    contract: TrustedRunnerSidecarLaunchContract;
    secret: Uint8Array;
    binding_frame: BootstrapFrame;
    cwd?: string;
    env?: Record<string, string>;
}): {
    process_group_id: () => number | null;
    start(): Promise<void>;
    waitForStatus(options: {
        timeout_ms: number;
    }): Promise<BootstrapFrame>;
    cleanup(options: {
        grace_ms: number;
    }): Promise<{
        status: "cleaned";
        process_group_id: number;
    } | {
        status: "outcome-uncertain";
        reason: string;
    }>;
};
export {};
