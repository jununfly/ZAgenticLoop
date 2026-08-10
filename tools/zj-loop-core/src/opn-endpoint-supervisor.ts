import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { access, mkdir, open, rename, unlink, writeFile } from 'node:fs/promises';
import { closeSync, openSync } from 'node:fs';
import { request } from 'node:https';
import { spawn } from 'node:child_process';
import path from 'node:path';

export const OPN_ENDPOINT_BINDING_SCHEMA = 'zj-loop.opn_endpoint_binding.v1' as const;

export type OpnEndpointRuntimeConfig = {
  bind: string;
  port: number;
  network_id: string;
  state_store: string;
  server_key: string;
  server_cert: string;
  client_ca: string;
  artifact_store?: string;
  owner_human_id?: string;
  owner_public_key?: string;
  owner_token?: string;
  session_ttl_minutes?: number;
};

export type OpnEndpointBinding = {
  schema: typeof OPN_ENDPOINT_BINDING_SCHEMA;
  pid: number;
  started_at: string;
  bind: string;
  port: number;
  network_id: string;
  config_digest: string;
  command: string[];
};

export type OpnEndpointStatus =
  | { status: 'stopped'; reason: 'binding-missing' | 'process-not-running' }
  | { status: 'stale'; reason: 'pid-invalid' | 'config-mismatch' | 'process-identity-unknown'; binding: OpnEndpointBinding }
  | { status: 'starting'; binding: OpnEndpointBinding }
  | { status: 'running'; binding: OpnEndpointBinding; healthz: 'ok' }
  | { status: 'unreachable'; binding: OpnEndpointBinding; reason: 'healthz-failed' };

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)]));
  return value;
}

export function opnEndpointConfigDigest(config: OpnEndpointRuntimeConfig): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(stable(config))).digest('hex')}`;
}

export function createOpnEndpointBinding(input: { pid: number; started_at?: string; config: OpnEndpointRuntimeConfig; command: string[] }): OpnEndpointBinding {
  if (!Number.isInteger(input.pid) || input.pid <= 0) throw new Error('opn-endpoint-binding-pid-invalid');
  return { schema: OPN_ENDPOINT_BINDING_SCHEMA, pid: input.pid, started_at: input.started_at ?? new Date().toISOString(), bind: input.config.bind, port: input.config.port, network_id: input.config.network_id, config_digest: opnEndpointConfigDigest(input.config), command: [...input.command] };
}

export function validateOpnEndpointBinding(value: unknown): OpnEndpointBinding {
  if (!value || typeof value !== 'object') throw new Error('opn-endpoint-binding-invalid');
  const binding = value as Partial<OpnEndpointBinding>;
  if (binding.schema !== OPN_ENDPOINT_BINDING_SCHEMA || !Number.isInteger(binding.pid) || (binding.pid ?? 0) <= 0 || typeof binding.started_at !== 'string' || typeof binding.bind !== 'string' || !Number.isInteger(binding.port) || typeof binding.network_id !== 'string' || typeof binding.config_digest !== 'string' || !Array.isArray(binding.command) || binding.command.some((item) => typeof item !== 'string')) throw new Error('opn-endpoint-binding-invalid');
  return binding as OpnEndpointBinding;
}

export async function readOpnEndpointBinding(path: string): Promise<OpnEndpointBinding | null> {
  try { return validateOpnEndpointBinding(JSON.parse(await readFile(path, 'utf8'))); } catch (error) {
    if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export function isProcessAlive(pid: number, signal: NodeJS.Signals | 0 = 0): boolean {
  try { process.kill(pid, signal); return true; } catch (error) {
    return error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

export function classifyOpnEndpointStatus(input: { binding: OpnEndpointBinding | null; config: OpnEndpointRuntimeConfig; process_alive: boolean; healthz: 'ok' | 'failed' | 'unknown' }): OpnEndpointStatus {
  if (!input.binding) return { status: 'stopped', reason: 'binding-missing' };
  if (input.binding.config_digest !== opnEndpointConfigDigest(input.config)) return { status: 'stale', reason: 'config-mismatch', binding: input.binding };
  if (!input.process_alive) return { status: 'stopped', reason: 'process-not-running' };
  if (input.healthz === 'ok') return { status: 'running', binding: input.binding, healthz: 'ok' };
  if (input.healthz === 'failed') return { status: 'unreachable', binding: input.binding, reason: 'healthz-failed' };
  return { status: 'starting', binding: input.binding };
}

export async function isReadableFile(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

export function opnEndpointRuntimePaths(runtime_dir: string): { binding: string; lock: string; log: string } {
  return { binding: path.join(runtime_dir, 'endpoint.binding.json'), lock: path.join(runtime_dir, 'endpoint.lock'), log: path.join(runtime_dir, 'endpoint.log') };
}

export async function acquireOpnEndpointLock(pathname: string): Promise<{ release(): Promise<void> }> {
  await mkdir(path.dirname(pathname), { recursive: true });
  try {
    const handle = await open(pathname, 'wx', 0o600);
    await handle.writeFile(`${JSON.stringify({ pid: process.pid, acquired_at: new Date().toISOString() })}\n`);
    return { release: async () => { await handle.close(); await unlink(pathname).catch(() => undefined); } };
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || (error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    let pid = 0;
    try { pid = Number(JSON.parse(await readFile(pathname, 'utf8')).pid); } catch { /* stale or partial lock */ }
    if (pid > 0 && isProcessAlive(pid)) throw new Error('opn-endpoint-already-running');
    await unlink(pathname).catch(() => undefined);
    const handle = await open(pathname, 'wx', 0o600);
    await handle.writeFile(`${JSON.stringify({ pid: process.pid, acquired_at: new Date().toISOString() })}\n`);
    return { release: async () => { await handle.close(); await unlink(pathname).catch(() => undefined); } };
  }
}

export async function writeOpnEndpointBinding(pathname: string, binding: OpnEndpointBinding): Promise<void> {
  await mkdir(path.dirname(pathname), { recursive: true });
  const temporary = `${pathname}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(binding, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, pathname);
}

export async function probeOpnEndpointHealthz(input: { bind: string; port: number; timeout_ms?: number }): Promise<'ok' | 'failed'> {
  return await new Promise((resolve) => {
    const client = request({ hostname: input.bind, port: input.port, path: '/healthz', method: 'GET', rejectUnauthorized: false, timeout: input.timeout_ms ?? 1000 }, (response) => {
      response.resume();
      response.once('end', () => resolve(response.statusCode === 200 ? 'ok' : 'failed'));
    });
    client.once('timeout', () => { client.destroy(); resolve('failed'); });
    client.once('error', () => resolve('failed'));
    client.end();
  });
}

export async function spawnOpnEndpointServe(input: { executable: string; script: string; args: string[]; log_path: string }): Promise<ReturnType<typeof spawn>> {
  await mkdir(path.dirname(input.log_path), { recursive: true });
  const log = openSync(input.log_path, 'a');
  const child = spawn(input.executable, [input.script, 'serve', ...input.args], { detached: true, stdio: ['ignore', log, log], windowsHide: true });
  closeSync(log);
  child.unref();
  return child;
}
