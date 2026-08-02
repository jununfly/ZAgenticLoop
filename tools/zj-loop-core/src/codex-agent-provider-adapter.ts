import type { LocalProcessAdapter, LocalProcessHandle, LocalProcessLaunchSpec, LocalProcessResult } from './local-process-adapter.js';
import { providerResultFromLocalProcess, type ProviderResult } from './provider-runtime-adapter.js';

export const CODEX_AGENT_PROVIDER_SCHEMA = 'zj-loop.codex_agent_provider.v1' as const;

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

export function buildCodexInvocation(input: { executable: string; cwd: string }): CodexInvocation {
  if (!input.executable || input.executable.includes('\0')) throw new Error('codex-executable-required');
  if (!input.cwd || !input.cwd.startsWith('/') || input.cwd.includes('\0')) throw new Error('codex-cwd-must-be-absolute');
  return {
    executable: input.executable,
    args: ['exec', '--json', '--ephemeral', '--sandbox', 'read-only', '--ask-for-approval', 'never', '--cd', input.cwd],
    cwd: input.cwd,
  };
}

function withCodexSchema(result: LocalProcessResult, invocation: CodexInvocation): CodexAgentRunResult {
  return { ...result, schema: CODEX_AGENT_PROVIDER_SCHEMA, provider: 'codex', invocation, provider_result: providerResultFromLocalProcess(result) };
}

export function createCodexAgentProviderAdapter(input: { process_adapter: ProcessAdapter; executable: string }) {
  if (!input.process_adapter || typeof input.process_adapter.launch !== 'function') throw new Error('codex-process-adapter-required');
  return {
    async run(request: CodexAgentRunInput): Promise<CodexAgentRunResult> {
      if (!request.prompt || request.prompt.trim().length === 0) throw new Error('codex-prompt-required');
      const invocation = buildCodexInvocation({ executable: input.executable, cwd: request.cwd });
      const launch: LocalProcessLaunchSpec = {
        executable: invocation.executable,
        args: invocation.args,
        cwd: invocation.cwd,
        env_allowlist: request.env_allowlist,
        env: request.env,
        timeout_ms: request.timeout_ms,
        termination_grace_ms: request.termination_grace_ms,
        max_stdout_bytes: request.max_stdout_bytes,
        max_stderr_bytes: request.max_stderr_bytes,
      };
      const handle: LocalProcessHandle = await input.process_adapter.launch(launch);
      handle.stdin.end(request.prompt);
      return withCodexSchema(await handle.wait(), invocation);
    },
  };
}
