import type { LocalProcessAdapter, LocalProcessHandle, LocalProcessLaunchSpec, LocalProcessResult } from './local-process-adapter.js';
import { providerResultFromLocalProcess, type ProviderResult } from './provider-runtime-adapter.js';

export const CODEX_AGENT_PROVIDER_SCHEMA = 'zj-loop.codex_agent_provider.v1' as const;

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

export type CodexWriteScopeResult = { status: 'valid' } | { status: 'blocked'; reason: 'write-scope-file-drift' | 'write-scope-dirty' | 'write-scope-parent-drift' | 'write-scope-diff-check' };

export function validateCodexExecutionModeBinding(input: { mode: CodexExecutionMode; admitted_args: string[]; invocation_args: string[] }): { status: 'valid' } | { status: 'blocked'; reason: 'execution-mode-argv-mismatch' } {
  if (input.mode !== 'read-only' && input.mode !== 'write-enabled') return { status: 'blocked', reason: 'execution-mode-argv-mismatch' };
  return JSON.stringify(input.admitted_args) === JSON.stringify(input.invocation_args)
    ? { status: 'valid' }
    : { status: 'blocked', reason: 'execution-mode-argv-mismatch' };
}

function sortedUnique(files: string[]): string[] {
  return [...new Set(files)].sort();
}

export function validateCodexWriteScope(input: CodexWriteScopeFacts): CodexWriteScopeResult {
  if (sortedUnique(input.changed_files).join('\0') !== sortedUnique(input.allowed_files).join('\0')) return { status: 'blocked', reason: 'write-scope-file-drift' };
  if (input.uncommitted_files.length > 0) return { status: 'blocked', reason: 'write-scope-dirty' };
  if (!/^[0-9a-f]{40}$/.test(input.commit_parent) || input.commit_parent !== input.baseline_commit) return { status: 'blocked', reason: 'write-scope-parent-drift' };
  if (!input.diff_check_passed) return { status: 'blocked', reason: 'write-scope-diff-check' };
  return { status: 'valid' };
}

export function buildCodexInvocation(input: { executable: string; cwd: string; mode?: CodexExecutionMode }): CodexInvocation {
  if (!input.executable || input.executable.includes('\0')) throw new Error('codex-executable-required');
  if (!input.cwd || !input.cwd.startsWith('/') || input.cwd.includes('\0')) throw new Error('codex-cwd-must-be-absolute');
  const mode = input.mode ?? 'read-only';
  if (mode !== 'read-only' && mode !== 'write-enabled') throw new Error('codex-execution-mode-invalid');
  return {
    executable: input.executable,
    args: ['exec', '--json', '--ephemeral', '--sandbox', mode === 'write-enabled' ? 'workspace-write' : 'read-only', '--ask-for-approval', 'never', '--cd', input.cwd],
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
      const invocation = buildCodexInvocation({ executable: input.executable, cwd: request.cwd, mode: request.mode });
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
