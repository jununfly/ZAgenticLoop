import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
export const LOCAL_PROCESS_ADAPTER_SCHEMA = 'zj-loop.local_process_adapter.v1';
const MAX_OUTPUT_BYTES = 10 * 1024 * 1024;
const ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;
function requireText(value, error) {
    if (typeof value !== 'string' || value.length === 0 || value.includes('\0'))
        throw new Error(error);
}
function absolutePath(value) {
    return typeof value === 'string' && (value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\'));
}
function validateSpec(spec) {
    if (!spec || typeof spec !== 'object')
        throw new Error('local-process-spec-invalid');
    requireText(spec.executable, 'local-process-executable-required');
    if (!absolutePath(spec.executable))
        throw new Error('local-process-executable-must-be-absolute');
    if (!Array.isArray(spec.args) || !spec.args.every((arg) => typeof arg === 'string' && !arg.includes('\0')))
        throw new Error('local-process-args-invalid');
    requireText(spec.cwd, 'local-process-cwd-required');
    if (!absolutePath(spec.cwd))
        throw new Error('local-process-cwd-must-be-absolute');
    if (!Array.isArray(spec.env_allowlist) || new Set(spec.env_allowlist).size !== spec.env_allowlist.length || !spec.env_allowlist.every((key) => typeof key === 'string' && ENV_KEY.test(key)))
        throw new Error('local-process-env-allowlist-invalid');
    if (!spec.env || typeof spec.env !== 'object' || Array.isArray(spec.env))
        throw new Error('local-process-env-invalid');
    for (const [key, value] of Object.entries(spec.env)) {
        if (!spec.env_allowlist.includes(key))
            throw new Error('local-process-env-not-allowlisted');
        if (!ENV_KEY.test(key) || typeof value !== 'string' || value.includes('\0'))
            throw new Error('local-process-env-invalid');
    }
    for (const [value, error] of [[spec.max_stdout_bytes, 'local-process-stdout-bound-invalid'], [spec.max_stderr_bytes, 'local-process-stderr-bound-invalid']]) {
        if (!Number.isInteger(value) || value < 1 || value > MAX_OUTPUT_BYTES)
            throw new Error(error);
    }
    for (const [value, error] of [[spec.timeout_ms, 'local-process-timeout-invalid'], [spec.termination_grace_ms, 'local-process-termination-grace-invalid']]) {
        if (!Number.isInteger(value) || value < 1)
            throw new Error(error);
    }
}
async function validateCwd(cwd) {
    try {
        if (!(await stat(cwd)).isDirectory())
            throw new Error('local-process-cwd-not-directory');
    }
    catch (error) {
        if (error instanceof Error && error.message === 'local-process-cwd-not-directory')
            throw error;
        throw new Error('local-process-cwd-unavailable');
    }
}
function kill(child) {
    if (!child.killed && child.exitCode === null)
        child.kill('SIGTERM');
}
export function createLocalProcessAdapter() {
    return {
        async launch(spec) {
            validateSpec(spec);
            await validateCwd(spec.cwd);
            const child = spawn(spec.executable, spec.args, {
                cwd: spec.cwd,
                env: Object.fromEntries(Object.entries(spec.env)),
                shell: false,
                stdio: ['pipe', 'pipe', 'pipe'],
                windowsHide: true,
            });
            const pid = child.pid;
            if (!pid)
                throw new Error('local-process-spawn-failed');
            let stdout = Buffer.alloc(0);
            let stderr = Buffer.alloc(0);
            let terminationReason;
            let settled = false;
            let graceTimer;
            let timeoutTimer;
            let resolveWait;
            const waitPromise = new Promise((resolve) => { resolveWait = resolve; });
            const terminate = (reason) => {
                terminationReason ??= reason;
                kill(child);
                if (!graceTimer)
                    graceTimer = setTimeout(() => {
                        if (!child.killed && child.exitCode === null)
                            child.kill('SIGKILL');
                    }, spec.termination_grace_ms);
            };
            const append = (current, chunk, bound, reason) => {
                const next = Buffer.concat([current, chunk]);
                if (next.byteLength > bound) {
                    terminate(reason);
                    return next.subarray(0, bound);
                }
                return next;
            };
            child.stdout.on('data', (chunk) => { stdout = append(stdout, chunk, spec.max_stdout_bytes, 'stdout-limit-exceeded'); });
            child.stderr.on('data', (chunk) => { stderr = append(stderr, chunk, spec.max_stderr_bytes, 'stderr-limit-exceeded'); });
            child.once('error', () => {
                if (settled)
                    return;
                settled = true;
                if (timeoutTimer)
                    clearTimeout(timeoutTimer);
                if (graceTimer)
                    clearTimeout(graceTimer);
                resolveWait({ schema: LOCAL_PROCESS_ADAPTER_SCHEMA, status: 'failed', success: false, pid, exit_code: null, signal: null, stdout: stdout.toString('utf8'), stderr: stderr.toString('utf8'), reason: terminationReason ?? 'spawn-failed' });
            });
            child.once('close', (exitCode, signal) => {
                if (settled)
                    return;
                settled = true;
                if (timeoutTimer)
                    clearTimeout(timeoutTimer);
                if (graceTimer)
                    clearTimeout(graceTimer);
                const status = terminationReason === 'timeout' ? 'timed-out' : terminationReason === 'cancelled' ? 'cancelled' : terminationReason ? 'failed' : exitCode === 0 ? 'completed' : 'failed';
                resolveWait({ schema: LOCAL_PROCESS_ADAPTER_SCHEMA, status, success: status === 'completed', pid, exit_code: exitCode, signal, stdout: stdout.toString('utf8'), stderr: stderr.toString('utf8'), ...(terminationReason ? { reason: terminationReason } : {}) });
            });
            timeoutTimer = setTimeout(() => terminate('timeout'), spec.timeout_ms);
            return { pid, stdin: child.stdin, wait: () => waitPromise, cancel: () => terminate('cancelled') };
        },
    };
}
