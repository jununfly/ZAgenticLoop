import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { access, mkdir, open, rename, unlink, writeFile } from 'node:fs/promises';
import { closeSync, openSync } from 'node:fs';
import { request } from 'node:https';
import { spawn } from 'node:child_process';
import path from 'node:path';
export const OPN_ENDPOINT_BINDING_SCHEMA = 'zj-loop.opn_endpoint_binding.v1';
function stable(value) {
    if (Array.isArray(value))
        return value.map(stable);
    if (value && typeof value === 'object')
        return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)]));
    return value;
}
export function opnEndpointConfigDigest(config) {
    return `sha256:${createHash('sha256').update(JSON.stringify(stable(config))).digest('hex')}`;
}
export function createOpnEndpointBinding(input) {
    if (!Number.isInteger(input.pid) || input.pid <= 0)
        throw new Error('opn-endpoint-binding-pid-invalid');
    return { schema: OPN_ENDPOINT_BINDING_SCHEMA, pid: input.pid, started_at: input.started_at ?? new Date().toISOString(), bind: input.config.bind, port: input.config.port, network_id: input.config.network_id, config_digest: opnEndpointConfigDigest(input.config), command: [...input.command] };
}
export function validateOpnEndpointBinding(value) {
    if (!value || typeof value !== 'object')
        throw new Error('opn-endpoint-binding-invalid');
    const binding = value;
    if (binding.schema !== OPN_ENDPOINT_BINDING_SCHEMA || !Number.isInteger(binding.pid) || (binding.pid ?? 0) <= 0 || typeof binding.started_at !== 'string' || typeof binding.bind !== 'string' || !Number.isInteger(binding.port) || typeof binding.network_id !== 'string' || typeof binding.config_digest !== 'string' || !Array.isArray(binding.command) || binding.command.some((item) => typeof item !== 'string'))
        throw new Error('opn-endpoint-binding-invalid');
    return binding;
}
export async function readOpnEndpointBinding(path) {
    try {
        return validateOpnEndpointBinding(JSON.parse(await readFile(path, 'utf8')));
    }
    catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
            return null;
        throw error;
    }
}
export function isProcessAlive(pid, signal = 0) {
    try {
        process.kill(pid, signal);
        return true;
    }
    catch (error) {
        return error instanceof Error && 'code' in error && error.code !== 'ESRCH';
    }
}
export function classifyOpnEndpointStatus(input) {
    if (!input.binding)
        return { status: 'stopped', reason: 'binding-missing' };
    if (input.binding.config_digest !== opnEndpointConfigDigest(input.config))
        return { status: 'stale', reason: 'config-mismatch', binding: input.binding };
    if (!input.process_alive)
        return { status: 'stopped', reason: 'process-not-running' };
    if (input.healthz === 'ok')
        return { status: 'running', binding: input.binding, healthz: 'ok' };
    if (input.healthz === 'failed')
        return { status: 'unreachable', binding: input.binding, reason: 'healthz-failed' };
    return { status: 'starting', binding: input.binding };
}
export async function isReadableFile(path) {
    try {
        await access(path);
        return true;
    }
    catch {
        return false;
    }
}
export function opnEndpointRuntimePaths(runtime_dir) {
    return { binding: path.join(runtime_dir, 'endpoint.binding.json'), lock: path.join(runtime_dir, 'endpoint.lock'), log: path.join(runtime_dir, 'endpoint.log') };
}
export async function acquireOpnEndpointLock(pathname) {
    await mkdir(path.dirname(pathname), { recursive: true });
    try {
        const handle = await open(pathname, 'wx', 0o600);
        await handle.writeFile(`${JSON.stringify({ pid: process.pid, acquired_at: new Date().toISOString() })}\n`);
        return { release: async () => { await handle.close(); await unlink(pathname).catch(() => undefined); } };
    }
    catch (error) {
        if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST')
            throw error;
        let pid = 0;
        try {
            pid = Number(JSON.parse(await readFile(pathname, 'utf8')).pid);
        }
        catch { /* stale or partial lock */ }
        if (pid > 0 && isProcessAlive(pid))
            throw new Error('opn-endpoint-already-running');
        await unlink(pathname).catch(() => undefined);
        const handle = await open(pathname, 'wx', 0o600);
        await handle.writeFile(`${JSON.stringify({ pid: process.pid, acquired_at: new Date().toISOString() })}\n`);
        return { release: async () => { await handle.close(); await unlink(pathname).catch(() => undefined); } };
    }
}
export async function writeOpnEndpointBinding(pathname, binding) {
    await mkdir(path.dirname(pathname), { recursive: true });
    const temporary = `${pathname}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(binding, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, pathname);
}
export async function probeOpnEndpointHealthz(input) {
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
export async function spawnOpnEndpointServe(input) {
    await mkdir(path.dirname(input.log_path), { recursive: true });
    const log = openSync(input.log_path, 'a');
    const child = spawn(input.executable, [input.script, 'serve', ...input.args], { detached: true, stdio: ['ignore', log, log], windowsHide: true });
    closeSync(log);
    child.unref();
    return child;
}
