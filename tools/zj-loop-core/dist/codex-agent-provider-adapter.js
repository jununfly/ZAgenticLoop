import { providerResultFromLocalProcess } from './provider-runtime-adapter.js';
export const CODEX_AGENT_PROVIDER_SCHEMA = 'zj-loop.codex_agent_provider.v1';
function absolutePath(value) { return value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\'); }
export function validateCodexExecutionModeBinding(input) {
    if (input.mode !== 'read-only' && input.mode !== 'write-enabled')
        return { status: 'blocked', reason: 'execution-mode-argv-mismatch' };
    return JSON.stringify(input.admitted_args) === JSON.stringify(input.invocation_args)
        ? { status: 'valid' }
        : { status: 'blocked', reason: 'execution-mode-argv-mismatch' };
}
function sortedUnique(files) {
    return [...new Set(files)].sort();
}
export function validateCodexWriteScope(input) {
    if (sortedUnique(input.changed_files).join('\0') !== sortedUnique(input.allowed_files).join('\0'))
        return { status: 'blocked', reason: 'write-scope-file-drift' };
    if (input.uncommitted_files.length > 0)
        return { status: 'blocked', reason: 'write-scope-dirty' };
    if (!/^[0-9a-f]{40}$/.test(input.commit_parent) || input.commit_parent !== input.baseline_commit)
        return { status: 'blocked', reason: 'write-scope-parent-drift' };
    if (!input.diff_check_passed)
        return { status: 'blocked', reason: 'write-scope-diff-check' };
    return { status: 'valid' };
}
export function buildCodexInvocation(input) {
    if (!input.executable || input.executable.includes('\0'))
        throw new Error('codex-executable-required');
    if (!input.cwd || !absolutePath(input.cwd) || input.cwd.includes('\0'))
        throw new Error('codex-cwd-must-be-absolute');
    const mode = input.mode ?? 'read-only';
    if (mode !== 'read-only' && mode !== 'write-enabled')
        throw new Error('codex-execution-mode-invalid');
    return {
        executable: input.executable,
        args: ['exec', '--json', '--ephemeral', '--sandbox', mode === 'write-enabled' ? 'workspace-write' : 'read-only', '--cd', input.cwd, '--skip-git-repo-check'],
        cwd: input.cwd,
    };
}
function withCodexSchema(result, invocation) {
    return { ...result, schema: CODEX_AGENT_PROVIDER_SCHEMA, provider: 'codex', invocation, provider_result: providerResultFromLocalProcess(result) };
}
export function createCodexAgentProviderAdapter(input) {
    if (!input.process_adapter || typeof input.process_adapter.launch !== 'function')
        throw new Error('codex-process-adapter-required');
    return {
        async run(request) {
            if (!request.prompt || request.prompt.trim().length === 0)
                throw new Error('codex-prompt-required');
            const invocation = buildCodexInvocation({ executable: input.executable, cwd: request.cwd, mode: request.mode });
            const launch = {
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
            const handle = await input.process_adapter.launch(launch);
            handle.stdin.end(request.prompt);
            return withCodexSchema(await handle.wait(), invocation);
        },
    };
}
