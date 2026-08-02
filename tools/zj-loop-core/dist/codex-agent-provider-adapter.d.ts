import type { LocalProcessAdapter, LocalProcessResult } from './local-process-adapter.js';
import { type ProviderResult } from './provider-runtime-adapter.js';
export declare const CODEX_AGENT_PROVIDER_SCHEMA: "zj-loop.codex_agent_provider.v1";
export type CodexInvocation = {
    executable: string;
    args: string[];
    cwd: string;
};
export type CodexAgentRunInput = {
    cwd: string;
    prompt: string;
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
export declare function buildCodexInvocation(input: {
    executable: string;
    cwd: string;
}): CodexInvocation;
export declare function createCodexAgentProviderAdapter(input: {
    process_adapter: ProcessAdapter;
    executable: string;
}): {
    run(request: CodexAgentRunInput): Promise<CodexAgentRunResult>;
};
export {};
