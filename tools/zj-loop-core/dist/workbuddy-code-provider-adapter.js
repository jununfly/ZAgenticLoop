export const WORKBUDDY_CODE_PROVIDER_SCHEMA = 'zj-loop.workbuddy_code_provider.v1';
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
function absolutePath(value) { return value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\'); }
export function buildWorkBuddyCodeInvocation(input) {
    if (!input.executable || !absolutePath(input.executable) || input.executable.includes('\0'))
        throw new Error('workbuddy-code-executable-required');
    if (!input.cwd || !absolutePath(input.cwd) || input.cwd.includes('\0'))
        throw new Error('workbuddy-code-cwd-must-be-absolute');
    if (!SESSION_ID.test(input.session_id))
        throw new Error('workbuddy-code-session-id-invalid');
    return { executable: input.executable, args: ['--print', '--output-format', 'json', '--tools', 'Read', '--permission-mode', 'dontAsk', '--no-session-persistence', '--session-id', input.session_id], cwd: input.cwd, session_id: input.session_id };
}
export function createWorkBuddyCodeProviderAdapter(input) {
    if (!input.process_adapter || typeof input.process_adapter.launch !== 'function')
        throw new Error('workbuddy-code-process-adapter-required');
    if (!SESSION_ID.test(input.session_id))
        throw new Error('workbuddy-code-session-id-invalid');
    return {
        async run(request) {
            if (!request.prompt || request.prompt.trim().length === 0)
                throw new Error('workbuddy-code-prompt-required');
            const invocation = buildWorkBuddyCodeInvocation({ executable: input.executable, cwd: request.cwd, session_id: input.session_id });
            const launch = { executable: invocation.executable, args: [...invocation.args, request.prompt], cwd: invocation.cwd, env_allowlist: request.env_allowlist, env: request.env, timeout_ms: request.timeout_ms, termination_grace_ms: request.termination_grace_ms, max_stdout_bytes: request.max_stdout_bytes, max_stderr_bytes: request.max_stderr_bytes };
            const handle = await input.process_adapter.launch(launch);
            return { ...await handle.wait(), schema: WORKBUDDY_CODE_PROVIDER_SCHEMA, provider: 'workbuddy-code', invocation };
        },
    };
}
