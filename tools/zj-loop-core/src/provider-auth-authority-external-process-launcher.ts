import type { LocalProcessAdapter, LocalProcessHandle } from './local-process-adapter.js';
import { createLocalProcessAdapter } from './local-process-adapter.js';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readProviderAuthAuthorityStartConfig } from './provider-auth-authority-start-config-store.js';

export type ProviderAuthAuthorityExternalProcessLauncher = {
  start(): Promise<void>;
  readiness(): Promise<{ status: 'ready'; socket_path: string } | { status: 'blocked'; reason: 'provider-auth-authority-external-ipc-unavailable' }>;
  close(): Promise<void>;
};

async function defaultProbe(socketPath: string): Promise<boolean> {
  const net = await import('node:net');
  return await new Promise((resolve) => {
    const socket = net.createConnection(socketPath);
    let settled = false;
    const finish = (ready: boolean) => { if (settled) return; settled = true; socket.destroy(); resolve(ready); };
    socket.setTimeout(500, () => finish(false));
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}

export function createProviderAuthAuthorityExternalProcessLauncher(input: {
  executable: string;
  args: string[];
  cwd: string;
  socket_path: string;
  process_adapter: LocalProcessAdapter;
  probe_socket?: (socketPath: string) => Promise<boolean>;
  timeout_ms?: number;
  termination_grace_ms?: number;
  close_timeout_ms?: number;
}): ProviderAuthAuthorityExternalProcessLauncher {
  if (!input.executable || !input.executable.startsWith('/') || input.executable.includes('\0')) throw new Error('provider-auth-authority-external-executable-invalid');
  if (!Array.isArray(input.args) || !input.args.every((arg) => typeof arg === 'string' && !arg.includes('\0'))) throw new Error('provider-auth-authority-external-args-invalid');
  if (!input.cwd || !input.cwd.startsWith('/') || input.cwd.includes('\0')) throw new Error('provider-auth-authority-external-cwd-invalid');
  if (!input.socket_path || !input.socket_path.startsWith('/') || input.socket_path.includes('\0')) throw new Error('provider-auth-authority-external-socket-path-invalid');
  if (!input.process_adapter || typeof input.process_adapter.launch !== 'function') throw new Error('provider-auth-authority-external-process-adapter-required');
  const timeoutMs = input.timeout_ms ?? 900_000;
  const terminationGraceMs = input.termination_grace_ms ?? 5_000;
  const closeTimeoutMs = input.close_timeout_ms ?? 10_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || !Number.isInteger(terminationGraceMs) || terminationGraceMs < 1 || !Number.isInteger(closeTimeoutMs) || closeTimeoutMs < 1) throw new Error('provider-auth-authority-external-timeout-invalid');
  const probe = input.probe_socket ?? defaultProbe;
  let handle: LocalProcessHandle | undefined;
  return {
    async start() {
      if (handle) throw new Error('provider-auth-authority-external-already-started');
      handle = await input.process_adapter.launch({ executable: input.executable, args: [...input.args], cwd: input.cwd, env_allowlist: [], env: {}, max_stdout_bytes: 10 * 1024 * 1024, max_stderr_bytes: 10 * 1024 * 1024, timeout_ms: timeoutMs, termination_grace_ms: terminationGraceMs });
    },
    async readiness() {
      if (!handle || !(await probe(input.socket_path))) return { status: 'blocked', reason: 'provider-auth-authority-external-ipc-unavailable' };
      return { status: 'ready', socket_path: input.socket_path };
    },
    async close() {
      if (!handle) return;
      const current = handle;
      current.cancel();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([current.wait(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('provider-auth-authority-external-close-timeout')), closeTimeoutMs); })]);
        handle = undefined;
      } finally { if (timer) clearTimeout(timer); }
    },
  };
}

export async function createProviderAuthAuthorityChildProcessLauncher(input: {
  config_path: string;
  process_adapter?: LocalProcessAdapter;
  probe_socket?: (socketPath: string) => Promise<boolean>;
  timeout_ms?: number;
  termination_grace_ms?: number;
  close_timeout_ms?: number;
}): Promise<ProviderAuthAuthorityExternalProcessLauncher> {
  if (typeof input.config_path !== 'string' || !input.config_path.startsWith('/') || input.config_path.includes('\0')) throw new Error('provider-auth-authority-child-config-path-invalid');
  const config = await readProviderAuthAuthorityStartConfig(input.config_path);
  const childEntrypoint = fileURLToPath(new URL('./provider-auth-authority-child-cli.js', import.meta.url));
  return createProviderAuthAuthorityExternalProcessLauncher({
    executable: process.execPath,
    args: [childEntrypoint, '--config', input.config_path],
    cwd: dirname(input.config_path),
    socket_path: config.socket_path,
    process_adapter: input.process_adapter ?? createLocalProcessAdapter(),
    probe_socket: input.probe_socket,
    timeout_ms: input.timeout_ms,
    termination_grace_ms: input.termination_grace_ms,
    close_timeout_ms: input.close_timeout_ms,
  });
}
