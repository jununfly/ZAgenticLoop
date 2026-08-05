import net from 'node:net';
import { createCodexAgentProviderAdapter, type CodexExecutionMode } from './codex-agent-provider-adapter.js';
import { createLocalProcessAdapter, type LocalProcessAdapter } from './local-process-adapter.js';
import { createProviderAuthRuntimeIpcSidecar } from './provider-auth-ipc-sidecar.js';
import type { ProviderAuthRef, ProviderAuthRuntime, ProviderRuntimeIdentityBinding } from './provider-auth-runtime.js';
import type { TrustedRunnerPeerIdentityVerifier } from './trusted-runner-peer-identity.js';

export type ProviderAuthRuntimeIpcLauncher = {
  start(): Promise<void>;
  readiness(): Promise<{ status: 'ready'; socket_path: string } | { status: 'blocked'; reason: 'provider-runtime-ipc-unavailable' }>;
  close(): Promise<void>;
};

function requiredText(value: unknown, error: string): asserts value is string {
  if (typeof value !== 'string' || value.trim() === '' || value.includes('\0')) throw new Error(error);
}

function validDigest(value: unknown): value is string { return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/.test(value); }

function taskValue(task: Record<string, unknown>, key: string): string | undefined {
  const value = task[key];
  return typeof value === 'string' && value.trim() !== '' && !value.includes('\0') ? value : undefined;
}

async function probeSocket(socketPath: string, timeoutMs: number): Promise<boolean> {
  return await new Promise((resolve) => {
    const socket = net.createConnection(socketPath);
    let settled = false;
    const finish = (ready: boolean) => { if (settled) return; settled = true; socket.destroy(); resolve(ready); };
    socket.setTimeout(timeoutMs, () => finish(false));
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}

export function createProviderAuthRuntimeIpcLauncher(input: {
  socket_path: string;
  correlation_id: string;
  expected_peer_identity_digest: string;
  verify_peer: TrustedRunnerPeerIdentityVerifier;
  runtime: ProviderAuthRuntime;
  auth_ref: ProviderAuthRef;
  contract_digest: string;
  adapter_contract_digest: string;
  runtime_binding: ProviderRuntimeIdentityBinding;
  provider_executable: string;
  working_directory: string;
  process_adapter?: LocalProcessAdapter;
  invocation_timeout_ms?: number;
  termination_grace_ms?: number;
}): ProviderAuthRuntimeIpcLauncher {
  requiredText(input.socket_path, 'provider-runtime-ipc-socket-path-required');
  requiredText(input.correlation_id, 'provider-runtime-ipc-correlation-id-required');
  if (!/^[0-9a-f]{64}$/.test(input.expected_peer_identity_digest)) throw new Error('provider-runtime-ipc-peer-identity-digest-invalid');
  requiredText(input.provider_executable, 'provider-runtime-ipc-provider-executable-required');
  if (!input.provider_executable.startsWith('/')) throw new Error('provider-runtime-ipc-provider-executable-must-be-absolute');
  requiredText(input.working_directory, 'provider-runtime-ipc-working-directory-required');
  if (!input.working_directory.startsWith('/')) throw new Error('provider-runtime-ipc-working-directory-must-be-absolute');
  if (!validDigest(input.contract_digest) || !validDigest(input.adapter_contract_digest)) throw new Error('provider-runtime-ipc-contract-digest-invalid');
  if (!input.runtime || typeof input.runtime.launch !== 'function' || typeof input.runtime.cleanup !== 'function') throw new Error('provider-runtime-ipc-runtime-invalid');
  const processAdapter = input.process_adapter ?? createLocalProcessAdapter();
  const provider = createCodexAgentProviderAdapter({ process_adapter: processAdapter, executable: input.provider_executable });
  const timeoutMs = input.invocation_timeout_ms ?? 120_000;
  const terminationGraceMs = input.termination_grace_ms ?? 2_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) throw new Error('provider-runtime-ipc-invocation-timeout-invalid');
  if (!Number.isInteger(terminationGraceMs) || terminationGraceMs < 1 || terminationGraceMs > 60_000) throw new Error('provider-runtime-ipc-termination-grace-invalid');
  const sidecar = createProviderAuthRuntimeIpcSidecar({
    socket_path: input.socket_path,
    correlation_id: input.correlation_id,
    expected_peer_identity_digest: input.expected_peer_identity_digest,
    verify_peer: input.verify_peer,
    runtime: input.runtime,
    auth_ref: input.auth_ref,
    contract_digest: input.contract_digest,
    adapter_contract_digest: input.adapter_contract_digest,
    runtime_binding: input.runtime_binding,
    invoke: async ({ task }) => {
      const prompt = taskValue(task, 'goal') ?? taskValue(task, 'prompt');
      if (!prompt) throw new Error('provider-runtime-ipc-task-prompt-required');
      const modeValue = taskValue(task, 'execution_mode') ?? 'read-only';
      if (modeValue !== 'read-only' && modeValue !== 'write-enabled') throw new Error('provider-runtime-ipc-task-mode-invalid');
      const result = await provider.run({ cwd: input.working_directory, prompt, mode: modeValue as CodexExecutionMode, env_allowlist: [], env: {}, timeout_ms: timeoutMs, termination_grace_ms: terminationGraceMs, max_stdout_bytes: 10 * 1024 * 1024, max_stderr_bytes: 10 * 1024 * 1024 });
      return { status: result.status, success: result.success, pid: result.pid, exit_code: result.exit_code, signal: result.signal, stdout: result.stdout, stderr: result.stderr, provider_result: result.provider_result };
    },
  });
  let started = false;
  return {
    async start() { if (started) throw new Error('provider-runtime-ipc-launcher-already-started'); await sidecar.start(); started = true; },
    async readiness() { return await probeSocket(input.socket_path, 1_000) ? { status: 'ready', socket_path: input.socket_path } : { status: 'blocked', reason: 'provider-runtime-ipc-unavailable' }; },
    async close() { await sidecar.close(); started = false; },
  };
}
