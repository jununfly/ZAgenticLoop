import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { decodeBootstrapFrame, encodeBootstrapFrame, type BootstrapFrame } from './bootstrap-protocol.js';

const DIGEST = /^sha256:[0-9a-f]{64}$/;
const MAX_SECRET_BYTES = 64 * 1024;
const MAX_STATUS_FRAME_BYTES = 64 * 1024;
const FD_CHANNELS = Object.freeze([
  Object.freeze({ channel_role: 'secret', direction: 'trusted-runner-to-sidecar', ownership: 'trusted-runner', fd: 3, close_on_exec: true }),
  Object.freeze({ channel_role: 'identity-binding', direction: 'trusted-runner-to-sidecar', ownership: 'trusted-runner', fd: 4, close_on_exec: true }),
  Object.freeze({ channel_role: 'status', direction: 'sidecar-to-trusted-runner', ownership: 'sidecar', fd: 5, close_on_exec: true }),
] as const);

export type TrustedRunnerSidecarLaunchContract = {
  schema: 'zj-loop.trusted_runner_sidecar_launch_contract.v1';
  execution_id: string;
  attempt: number;
  sidecar_argv: string[];
  worker_argv: string[];
  endpoint_path: string;
  bootstrap_profile_sha256: string;
  execution_binding_digest: string;
  fd_channels: typeof FD_CHANNELS;
  worker_inherited_fd_roles: readonly [];
  process_group: { owner: 'trusted-runner'; mode: 'posix-process-group'; root: 'sidecar' };
  secret: { content_type: string; byte_length: number };
  contract_digest: string;
};

function canonical(value: unknown): string {
  const json = canonicalize(value);
  if (typeof json !== 'string') throw new Error('trusted-runner-sidecar-canonicalization-invalid');
  return json;
}

function digest(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonical(value), 'utf8').digest('hex')}`;
}

export function trustedRunnerSidecarContractDigest(value: Omit<TrustedRunnerSidecarLaunchContract, 'contract_digest'> | TrustedRunnerSidecarLaunchContract): string {
  const { contract_digest: _, ...unsigned } = value as TrustedRunnerSidecarLaunchContract;
  const digestInput = {
    ...unsigned,
    fd_channels: unsigned.fd_channels.map(({ fd: _fd, ...channel }) => channel),
  };
  return digest(digestInput);
}

export function createTrustedRunnerSidecarLaunchContract(input: {
  execution_id: string;
  attempt: number;
  sidecar_argv: string[];
  worker_argv: string[];
  endpoint_path: string;
  bootstrap_profile_sha256: string;
  execution_binding_digest: string;
  secret_content_type: string;
  secret_byte_length: number;
}): TrustedRunnerSidecarLaunchContract {
  if (!input || !input.execution_id.trim() || !Number.isInteger(input.attempt) || input.attempt < 1 || !Array.isArray(input.sidecar_argv) || input.sidecar_argv.length === 0 || input.sidecar_argv.some((item) => typeof item !== 'string' || !item)) throw new Error('trusted-runner-sidecar-argv-invalid');
  if (!Array.isArray(input.worker_argv) || input.worker_argv.length === 0 || input.worker_argv.some((item) => typeof item !== 'string' || !item)) throw new Error('trusted-runner-sidecar-worker-argv-invalid');
  if (!input.endpoint_path || !DIGEST.test(input.bootstrap_profile_sha256) || !DIGEST.test(input.execution_binding_digest)) throw new Error('trusted-runner-sidecar-binding-invalid');
  if (!input.secret_content_type || !Number.isInteger(input.secret_byte_length) || input.secret_byte_length < 0 || input.secret_byte_length > MAX_SECRET_BYTES) throw new Error('trusted-runner-sidecar-secret-contract-invalid');
  const unsigned = {
    schema: 'zj-loop.trusted_runner_sidecar_launch_contract.v1' as const,
    execution_id: input.execution_id,
    attempt: input.attempt,
    sidecar_argv: [...input.sidecar_argv],
    worker_argv: [...input.worker_argv],
    endpoint_path: input.endpoint_path,
    bootstrap_profile_sha256: input.bootstrap_profile_sha256,
    execution_binding_digest: input.execution_binding_digest,
    fd_channels: FD_CHANNELS,
    worker_inherited_fd_roles: [] as const,
    process_group: { owner: 'trusted-runner' as const, mode: 'posix-process-group' as const, root: 'sidecar' as const },
    secret: { content_type: input.secret_content_type, byte_length: input.secret_byte_length },
  };
  return Object.freeze({ ...unsigned, contract_digest: trustedRunnerSidecarContractDigest(unsigned) });
}

function writeOnce(stream: NodeJS.WritableStream | null | undefined, value: Uint8Array): Promise<void> {
  if (!stream) return Promise.reject(new Error('trusted-runner-sidecar-fd-unavailable'));
  return new Promise((resolve, reject) => { stream.write(value, (error) => error ? reject(error) : resolve()); });
}

function readBootstrapFrame(stream: NodeJS.ReadableStream | null | undefined, timeoutMs: number): Promise<BootstrapFrame> {
  if (!stream) return Promise.reject(new Error('trusted-runner-sidecar-status-fd-unavailable'));
  return new Promise((resolve, reject) => {
    let buffer = new Uint8Array(0);
    const timer = setTimeout(() => { reject(new Error('trusted-runner-sidecar-status-timeout')); }, timeoutMs);
    const fail = (error: Error) => { clearTimeout(timer); reject(error); };
    stream.on('data', (chunk: Buffer) => {
      const merged = new Uint8Array(buffer.byteLength + chunk.byteLength);
      merged.set(buffer); merged.set(chunk, buffer.byteLength); buffer = merged;
      if (buffer.byteLength < 4) return;
      const size = new DataView(buffer.buffer, buffer.byteOffset, 4).getUint32(0);
      if (size < 1 || size > MAX_STATUS_FRAME_BYTES) return fail(new Error('trusted-runner-sidecar-status-frame-invalid'));
      if (buffer.byteLength < size + 4) return;
      clearTimeout(timer);
      try { resolve(decodeBootstrapFrame(buffer.slice(0, size + 4))); } catch (error) { fail(error instanceof Error ? error : new Error('trusted-runner-sidecar-status-frame-invalid')); }
    });
    stream.once('error', fail);
  });
}

function waitForExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    child.once('close', () => { clearTimeout(timer); resolve(true); });
  });
}

function childFd(child: ChildProcess, fd: number): NodeJS.ReadableStream | NodeJS.WritableStream | null | undefined {
  return (child.stdio as Array<NodeJS.ReadableStream | NodeJS.WritableStream | null | undefined> | null | undefined)?.[fd];
}

export function createTrustedRunnerSidecarBootstrap(input: {
  contract: TrustedRunnerSidecarLaunchContract;
  secret: Uint8Array;
  binding_frame: BootstrapFrame;
  cwd?: string;
  env?: Record<string, string>;
}) {
  if (input.secret.byteLength !== input.contract.secret.byte_length || input.secret.byteLength > MAX_SECRET_BYTES) throw new Error('trusted-runner-sidecar-secret-length-mismatch');
  if (input.binding_frame.channel_role !== 'identity-binding') throw new Error('trusted-runner-sidecar-binding-frame-role-invalid');
  let child: ChildProcess | undefined;
  return {
    process_group_id: () => child?.pid ?? null,
    async start(): Promise<void> {
      if (child) throw new Error('trusted-runner-sidecar-already-started');
      child = spawn(input.contract.sidecar_argv[0], input.contract.sidecar_argv.slice(1), {
        cwd: input.cwd,
        env: { ...process.env, ...(input.env ?? {}), ZJ_LOOP_SIDECAR_CONTRACT: canonical(input.contract) },
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe', 'pipe', 'pipe', 'pipe'],
      });
      await new Promise<void>((resolve, reject) => { child?.once('spawn', () => resolve()); child?.once('error', reject); });
      const secretFd = childFd(child, 3) as NodeJS.WritableStream | null | undefined;
      const bindingFd = childFd(child, 4) as NodeJS.WritableStream | null | undefined;
      await writeOnce(secretFd, input.secret);
      await writeOnce(bindingFd, encodeBootstrapFrame(input.binding_frame));
      bindingFd?.end();
      secretFd?.end();
    },
    async waitForStatus(options: { timeout_ms: number }): Promise<BootstrapFrame> {
      if (!child) throw new Error('trusted-runner-sidecar-not-started');
      if (!Number.isInteger(options.timeout_ms) || options.timeout_ms < 1 || options.timeout_ms > 60_000) throw new Error('trusted-runner-sidecar-timeout-invalid');
      return readBootstrapFrame(childFd(child, 5) as NodeJS.ReadableStream | null | undefined, options.timeout_ms);
    },
    async cleanup(options: { grace_ms: number }): Promise<{ status: 'cleaned'; process_group_id: number } | { status: 'outcome-uncertain'; reason: string }> {
      if (!child || !Number.isInteger(child.pid) || !Number.isInteger(options.grace_ms) || options.grace_ms < 1 || options.grace_ms > 60_000) return { status: 'outcome-uncertain', reason: 'trusted-runner-sidecar-cleanup-invalid' };
      const group = child.pid as number;
      try { process.kill(-group, 'SIGTERM'); } catch { try { child.kill('SIGTERM'); } catch { return { status: 'outcome-uncertain', reason: 'trusted-runner-sidecar-group-termination-failed' }; } }
      if (!(await waitForExit(child, options.grace_ms))) {
        try { process.kill(-group, 'SIGKILL'); } catch { try { child.kill('SIGKILL'); } catch { return { status: 'outcome-uncertain', reason: 'trusted-runner-sidecar-group-kill-failed' }; } }
        if (!(await waitForExit(child, options.grace_ms))) return { status: 'outcome-uncertain', reason: 'trusted-runner-sidecar-group-not-converged' };
      }
      return { status: 'cleaned', process_group_id: group };
    },
  };
}
