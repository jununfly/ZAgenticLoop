import type { LocalProcessAdapter } from './local-process-adapter.js';
export type ProviderAuthAuthorityExternalProcessLauncher = {
    start(): Promise<void>;
    readiness(): Promise<{
        status: 'ready';
        socket_path: string;
    } | {
        status: 'blocked';
        reason: 'provider-auth-authority-external-ipc-unavailable';
    }>;
    close(): Promise<void>;
};
export declare function createProviderAuthAuthorityExternalProcessLauncher(input: {
    executable: string;
    args: string[];
    cwd: string;
    socket_path: string;
    process_adapter: LocalProcessAdapter;
    probe_socket?: (socketPath: string) => Promise<boolean>;
    timeout_ms?: number;
    termination_grace_ms?: number;
    close_timeout_ms?: number;
}): ProviderAuthAuthorityExternalProcessLauncher;
export declare function createProviderAuthAuthorityChildProcessLauncher(input: {
    config_path: string;
    process_adapter?: LocalProcessAdapter;
    probe_socket?: (socketPath: string) => Promise<boolean>;
    timeout_ms?: number;
    termination_grace_ms?: number;
    close_timeout_ms?: number;
}): Promise<ProviderAuthAuthorityExternalProcessLauncher>;
