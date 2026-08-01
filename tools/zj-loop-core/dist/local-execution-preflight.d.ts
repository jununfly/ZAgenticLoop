export declare const LOCAL_EXECUTION_PREFLIGHT_SCHEMA: "zj-loop.local_execution_preflight.v1";
export type LocalExecutionPreflight = {
    schema: typeof LOCAL_EXECUTION_PREFLIGHT_SCHEMA;
    status: 'execution-ready';
    side_effects_executed: false;
    network_id: string;
    plan_id: string;
    plan_revision: number;
    task_id: string;
    execution_id: string;
    attempt: number;
    provider_id: string;
    adapter_version: string;
    executable: string;
    executable_digest: string;
    args: string[];
    argv_digest: string;
    cwd: string;
    cwd_digest: string;
    env_allowlist: string[];
    env_policy_digest: string;
    sandbox_policy_digest: string;
    network_policy: {
        mode: 'network-denied' | 'network-allowed';
        policy_digest: string;
    };
    timeout_ms: number;
    termination_grace_ms: number;
    max_stdout_bytes: number;
    max_stderr_bytes: number;
    orchestration_preflight_digest: string;
    issued_at: string;
    expires_at: string;
    preflight_digest: string;
};
export type LocalExecutionPreflightInput = Omit<LocalExecutionPreflight, 'schema' | 'status' | 'side_effects_executed' | 'preflight_digest'>;
export declare function createLocalExecutionPreflight(input: LocalExecutionPreflightInput): LocalExecutionPreflight;
export declare function localExecutionPreflightDigest(value: LocalExecutionPreflight): string;
export declare function validateLocalExecutionPreflight(value: unknown): {
    status: 'valid';
} | {
    status: 'blocked';
    reason: string;
};
