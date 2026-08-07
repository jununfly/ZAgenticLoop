import type { Writable } from 'node:stream';
export declare const LOCAL_PROCESS_ADAPTER_SCHEMA: "zj-loop.local_process_adapter.v1";
export type LocalProcessLaunchSpec = {
    executable: string;
    args: string[];
    cwd: string;
    env_allowlist: string[];
    env: Record<string, string>;
    max_stdout_bytes: number;
    max_stderr_bytes: number;
    timeout_ms: number;
    termination_grace_ms: number;
};
export type LocalProcessResult = {
    schema: typeof LOCAL_PROCESS_ADAPTER_SCHEMA;
    status: 'completed' | 'failed' | 'cancelled' | 'timed-out';
    success: boolean;
    pid: number;
    exit_code: number | null;
    signal: NodeJS.Signals | null;
    stdout: string;
    stderr: string;
    reason?: 'spawn-failed' | 'stdout-limit-exceeded' | 'stderr-limit-exceeded' | 'cancelled' | 'timeout';
};
export type LocalProcessHandle = {
    pid: number;
    stdin: Writable;
    wait(): Promise<LocalProcessResult>;
    cancel(): void;
};
export type LocalProcessAdapter = {
    launch(spec: LocalProcessLaunchSpec): Promise<LocalProcessHandle>;
};
export declare function buildLocalProcessSpawn(input: {
    executable: string;
    args: string[];
    platform?: NodeJS.Platform;
    comspec?: string;
}): {
    executable: string;
    args: string[];
    shell: false;
};
export declare function createLocalProcessAdapter(): LocalProcessAdapter;
