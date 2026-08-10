import { spawn } from 'node:child_process';
export declare const OPN_ENDPOINT_BINDING_SCHEMA: "zj-loop.opn_endpoint_binding.v1";
export type OpnEndpointRuntimeConfig = {
    bind: string;
    port: number;
    network_id: string;
    state_store: string;
    server_key: string;
    server_cert: string;
    client_ca: string;
    artifact_store?: string;
    owner_human_id?: string;
    owner_public_key?: string;
    owner_token?: string;
    session_ttl_minutes?: number;
};
export type OpnEndpointBinding = {
    schema: typeof OPN_ENDPOINT_BINDING_SCHEMA;
    pid: number;
    started_at: string;
    bind: string;
    port: number;
    network_id: string;
    config_digest: string;
    command: string[];
};
export type OpnEndpointStatus = {
    status: 'stopped';
    reason: 'binding-missing' | 'process-not-running';
} | {
    status: 'stale';
    reason: 'pid-invalid' | 'config-mismatch' | 'process-identity-unknown';
    binding: OpnEndpointBinding;
} | {
    status: 'starting';
    binding: OpnEndpointBinding;
} | {
    status: 'running';
    binding: OpnEndpointBinding;
    healthz: 'ok';
} | {
    status: 'unreachable';
    binding: OpnEndpointBinding;
    reason: 'healthz-failed';
};
export declare function opnEndpointConfigDigest(config: OpnEndpointRuntimeConfig): string;
export declare function createOpnEndpointBinding(input: {
    pid: number;
    started_at?: string;
    config: OpnEndpointRuntimeConfig;
    command: string[];
}): OpnEndpointBinding;
export declare function validateOpnEndpointBinding(value: unknown): OpnEndpointBinding;
export declare function readOpnEndpointBinding(path: string): Promise<OpnEndpointBinding | null>;
export declare function isProcessAlive(pid: number, signal?: NodeJS.Signals | 0): boolean;
export declare function classifyOpnEndpointStatus(input: {
    binding: OpnEndpointBinding | null;
    config: OpnEndpointRuntimeConfig;
    process_alive: boolean;
    healthz: 'ok' | 'failed' | 'unknown';
}): OpnEndpointStatus;
export declare function isReadableFile(path: string): Promise<boolean>;
export declare function opnEndpointRuntimePaths(runtime_dir: string): {
    binding: string;
    lock: string;
    log: string;
};
export declare function acquireOpnEndpointLock(pathname: string): Promise<{
    release(): Promise<void>;
}>;
export declare function writeOpnEndpointBinding(pathname: string, binding: OpnEndpointBinding): Promise<void>;
export declare function probeOpnEndpointHealthz(input: {
    bind: string;
    port: number;
    timeout_ms?: number;
}): Promise<'ok' | 'failed'>;
export declare function spawnOpnEndpointServe(input: {
    executable: string;
    script: string;
    args: string[];
    log_path: string;
}): Promise<ReturnType<typeof spawn>>;
