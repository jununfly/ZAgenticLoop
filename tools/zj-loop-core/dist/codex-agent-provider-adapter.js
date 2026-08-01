export const CODEX_AGENT_PROVIDER_SCHEMA = 'zj-loop.codex_agent_provider.v1';
export function buildCodexInvocation(input) {
    if (!input.executable || input.executable.includes('\0'))
        throw new Error('codex-executable-required');
    if (!input.cwd || !input.cwd.startsWith('/') || input.cwd.includes('\0'))
        throw new Error('codex-cwd-must-be-absolute');
    return {
        executable: input.executable,
        args: ['exec', '--json', '--ephemeral', '--sandbox', 'read-only', '--ask-for-approval', 'never', '--cd', input.cwd],
        cwd: input.cwd,
    };
}
function withCodexSchema(result, invocation) {
    return { ...result, schema: CODEX_AGENT_PROVIDER_SCHEMA, provider: 'codex', invocation };
}
export function createCodexAgentProviderAdapter(input) {
    if (!input.process_adapter || typeof input.process_adapter.launch !== 'function')
        throw new Error('codex-process-adapter-required');
    return {
        async run(request) {
            if (!request.prompt || request.prompt.trim().length === 0)
                throw new Error('codex-prompt-required');
            const invocation = buildCodexInvocation({ executable: input.executable, cwd: request.cwd });
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
