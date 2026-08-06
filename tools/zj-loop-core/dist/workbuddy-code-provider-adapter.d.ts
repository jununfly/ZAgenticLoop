import type { LocalProcessAdapter, LocalProcessResult } from './local-process-adapter.js';
export declare const WORKBUDDY_CODE_PROVIDER_SCHEMA: "zj-loop.workbuddy_code_provider.v1";
export type WorkBuddyCodeInvocation = {
    executable: string;
    args: string[];
    cwd: string;
    session_id: string;
};
export type WorkBuddyCodeRunInput = {
    cwd: string;
    prompt: string;
    env_allowlist: string[];
    env: Record<string, string>;
    timeout_ms: number;
    termination_grace_ms: number;
    max_stdout_bytes: number;
    max_stderr_bytes: number;
};
export type WorkBuddyCodeRunResult = Omit<LocalProcessResult, 'schema'> & {
    schema: typeof WORKBUDDY_CODE_PROVIDER_SCHEMA;
    provider: 'workbuddy-code';
    invocation: WorkBuddyCodeInvocation;
};
type ProcessAdapter = Pick<LocalProcessAdapter, 'launch'>;
export declare function buildWorkBuddyCodeInvocation(input: {
    executable: string;
    cwd: string;
    session_id: string;
}): WorkBuddyCodeInvocation;
export declare function createWorkBuddyCodeProviderAdapter(input: {
    process_adapter: ProcessAdapter;
    executable: string;
    session_id: string;
}): {
    run(request: WorkBuddyCodeRunInput): Promise<WorkBuddyCodeRunResult>;
};
export {};
