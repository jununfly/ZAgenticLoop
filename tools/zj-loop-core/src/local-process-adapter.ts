import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { stat } from 'node:fs/promises';
import type { Writable } from 'node:stream';

export const LOCAL_PROCESS_ADAPTER_SCHEMA = 'zj-loop.local_process_adapter.v1' as const;
const MAX_OUTPUT_BYTES = 10 * 1024 * 1024;
const ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

export type LocalProcessLaunchSpec = {
  executable: string;
  args: string[];
  cwd: string;
  env_allowlist: string[];
  env: Record<string, string>;
  max_stdout_bytes: number;
  max_stderr_bytes: number;
  timeout_ms: number;
  termination_grace_ms: number;
};

export type LocalProcessResult = {
  schema: typeof LOCAL_PROCESS_ADAPTER_SCHEMA;
  status: 'completed' | 'failed' | 'cancelled' | 'timed-out';
  success: boolean;
  pid: number;
  exit_code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  reason?: 'spawn-failed' | 'stdout-limit-exceeded' | 'stderr-limit-exceeded' | 'cancelled' | 'timeout';
};

export type LocalProcessHandle = {
  pid: number;
  stdin: Writable;
  wait(): Promise<LocalProcessResult>;
  cancel(): void;
};

export type LocalProcessAdapter = {
  launch(spec: LocalProcessLaunchSpec): Promise<LocalProcessHandle>;
};

function requireText(value: unknown, error: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) throw new Error(error);
}

function validateSpec(spec: LocalProcessLaunchSpec): void {
  if (!spec || typeof spec !== 'object') throw new Error('local-process-spec-invalid');
  requireText(spec.executable, 'local-process-executable-required');
  if (!spec.executable.startsWith('/')) throw new Error('local-process-executable-must-be-absolute');
  if (!Array.isArray(spec.args) || !spec.args.every((arg) => typeof arg === 'string' && !arg.includes('\0'))) throw new Error('local-process-args-invalid');
  requireText(spec.cwd, 'local-process-cwd-required');
  if (!spec.cwd.startsWith('/')) throw new Error('local-process-cwd-must-be-absolute');
  if (!Array.isArray(spec.env_allowlist) || new Set(spec.env_allowlist).size !== spec.env_allowlist.length || !spec.env_allowlist.every((key) => typeof key === 'string' && ENV_KEY.test(key))) throw new Error('local-process-env-allowlist-invalid');
  if (!spec.env || typeof spec.env !== 'object' || Array.isArray(spec.env)) throw new Error('local-process-env-invalid');
  for (const [key, value] of Object.entries(spec.env)) {
    if (!spec.env_allowlist.includes(key)) throw new Error('local-process-env-not-allowlisted');
    if (!ENV_KEY.test(key) || typeof value !== 'string' || value.includes('\0')) throw new Error('local-process-env-invalid');
  }
  for (const [value, error] of [[spec.max_stdout_bytes, 'local-process-stdout-bound-invalid'], [spec.max_stderr_bytes, 'local-process-stderr-bound-invalid']] as const) {
    if (!Number.isInteger(value) || value < 1 || value > MAX_OUTPUT_BYTES) throw new Error(error);
  }
  for (const [value, error] of [[spec.timeout_ms, 'local-process-timeout-invalid'], [spec.termination_grace_ms, 'local-process-termination-grace-invalid']] as const) {
    if (!Number.isInteger(value) || value < 1) throw new Error(error);
  }
}

async function validateCwd(cwd: string): Promise<void> {
  try {
    if (!(await stat(cwd)).isDirectory()) throw new Error('local-process-cwd-not-directory');
  } catch (error) {
    if (error instanceof Error && error.message === 'local-process-cwd-not-directory') throw error;
    throw new Error('local-process-cwd-unavailable');
  }
}

function kill(child: ChildProcessWithoutNullStreams): void {
  if (!child.killed && child.exitCode === null) child.kill('SIGTERM');
}

export function createLocalProcessAdapter(): LocalProcessAdapter {
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
      if (!pid) throw new Error('local-process-spawn-failed');
      let stdout: Buffer<ArrayBufferLike> = Buffer.alloc(0);
      let stderr: Buffer<ArrayBufferLike> = Buffer.alloc(0);
      let terminationReason: LocalProcessResult['reason'];
      let settled = false;
      let graceTimer: NodeJS.Timeout | undefined;
      let timeoutTimer: NodeJS.Timeout | undefined;
      let resolveWait!: (result: LocalProcessResult) => void;
      const waitPromise = new Promise<LocalProcessResult>((resolve) => { resolveWait = resolve; });
      const terminate = (reason: NonNullable<LocalProcessResult['reason']>) => {
        terminationReason ??= reason;
        kill(child);
        if (!graceTimer) graceTimer = setTimeout(() => {
          if (!child.killed && child.exitCode === null) child.kill('SIGKILL');
        }, spec.termination_grace_ms);
      };
      const append = (current: Buffer<ArrayBufferLike>, chunk: Buffer<ArrayBufferLike>, bound: number, reason: NonNullable<LocalProcessResult['reason']>): Buffer<ArrayBufferLike> => {
        const next = Buffer.concat([current, chunk]);
        if (next.byteLength > bound) {
          terminate(reason);
          return next.subarray(0, bound);
        }
        return next;
      };
      child.stdout.on('data', (chunk: Buffer) => { stdout = append(stdout, chunk, spec.max_stdout_bytes, 'stdout-limit-exceeded'); });
      child.stderr.on('data', (chunk: Buffer) => { stderr = append(stderr, chunk, spec.max_stderr_bytes, 'stderr-limit-exceeded'); });
      child.once('error', () => {
        if (settled) return;
        settled = true;
        if (timeoutTimer) clearTimeout(timeoutTimer);
        if (graceTimer) clearTimeout(graceTimer);
        resolveWait({ schema: LOCAL_PROCESS_ADAPTER_SCHEMA, status: 'failed', success: false, pid, exit_code: null, signal: null, stdout: stdout.toString('utf8'), stderr: stderr.toString('utf8'), reason: terminationReason ?? 'spawn-failed' });
      });
      child.once('close', (exitCode, signal) => {
        if (settled) return;
        settled = true;
        if (timeoutTimer) clearTimeout(timeoutTimer);
        if (graceTimer) clearTimeout(graceTimer);
        const status = terminationReason === 'timeout' ? 'timed-out' : terminationReason === 'cancelled' ? 'cancelled' : terminationReason ? 'failed' : exitCode === 0 ? 'completed' : 'failed';
        resolveWait({ schema: LOCAL_PROCESS_ADAPTER_SCHEMA, status, success: status === 'completed', pid, exit_code: exitCode, signal, stdout: stdout.toString('utf8'), stderr: stderr.toString('utf8'), ...(terminationReason ? { reason: terminationReason } : {}) });
      });
      timeoutTimer = setTimeout(() => terminate('timeout'), spec.timeout_ms);
      return { pid, stdin: child.stdin, wait: () => waitPromise, cancel: () => terminate('cancelled') };
    },
  };
}
