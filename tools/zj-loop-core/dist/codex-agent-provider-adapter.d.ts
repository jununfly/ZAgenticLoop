import type { LocalProcessAdapter, LocalProcessResult } from './local-process-adapter.js';
import { type ProviderResult } from './provider-runtime-adapter.js';
export declare const CODEX_AGENT_PROVIDER_SCHEMA: "zj-loop.codex_agent_provider.v1";
export type CodexExecutionMode = 'read-only' | 'write-enabled';
export type CodexInvocation = {
    executable: string;
    args: string[];
    cwd: string;
};
export type CodexAgentRunInput = {
    cwd: string;
    prompt: string;
    mode?: CodexExecutionMode;
    env_allowlist: string[];
    env: Record<string, string>;
    timeout_ms: number;
    termination_grace_ms: number;
    max_stdout_bytes: number;
    max_stderr_bytes: number;
};
export type CodexAgentRunResult = Omit<LocalProcessResult, 'schema'> & {
    schema: typeof CODEX_AGENT_PROVIDER_SCHEMA;
    provider: 'codex';
    invocation: CodexInvocation;
    provider_result: ProviderResult;
};
type ProcessAdapter = Pick<LocalProcessAdapter, 'launch'>;
export type CodexWriteScopeFacts = {
    allowed_files: string[];
    changed_files: string[];
    uncommitted_files: string[];
    commit_parent: string;
    baseline_commit: string;
    diff_check_passed: boolean;
};
export type CodexWriteScopeResult = {
    status: 'valid';
} | {
    status: 'blocked';
    reason: 'write-scope-file-drift' | 'write-scope-dirty' | 'write-scope-parent-drift' | 'write-scope-diff-check';
};
export declare function validateCodexExecutionModeBinding(input: {
    mode: CodexExecutionMode;
    admitted_args: string[];
    invocation_args: string[];
}): {
    status: 'valid';
} | {
    status: 'blocked';
    reason: 'execution-mode-argv-mismatch';
};
export declare function validateCodexWriteScope(input: CodexWriteScopeFacts): CodexWriteScopeResult;
export declare function buildCodexInvocation(input: {
    executable: string;
    cwd: string;
    mode?: CodexExecutionMode;
}): CodexInvocation;
export declare function createCodexAgentProviderAdapter(input: {
    process_adapter: ProcessAdapter;
    executable: string;
}): {
    run(request: CodexAgentRunInput): Promise<CodexAgentRunResult>;
};
export {};
