import { unlink } from 'node:fs/promises';
import { createProviderAuthAuthorityBinding, persistProviderAuthAuthorityBinding, type ProviderAuthAuthorityBinding } from './provider-auth-authority-binding.js';

export type ProviderAuthAuthorityForegroundLauncher = {
  start(): Promise<void>;
  readiness(): Promise<{ status: 'ready'; socket_path: string } | { status: 'blocked'; reason: string }>;
  close(): Promise<void>;
};

export type ProviderAuthAuthorityForegroundService = {
  start(): Promise<{ status: 'started'; binding: ProviderAuthAuthorityBinding }>;
  stop(): Promise<{ status: 'stopped' } | { status: 'outcome-uncertain'; reason: 'provider-auth-authority-close-failed' }>;
};

export function createProviderAuthAuthorityForegroundService(input: {
  launcher: ProviderAuthAuthorityForegroundLauncher;
  binding_path: string;
  binding: Omit<ProviderAuthAuthorityBinding, 'schema' | 'binding_digest' | 'pid' | 'started_at'>;
  process_id?: number;
  now?: () => string;
}): ProviderAuthAuthorityForegroundService {
  if (!input.launcher || typeof input.launcher.start !== 'function' || typeof input.launcher.readiness !== 'function' || typeof input.launcher.close !== 'function') throw new Error('provider-auth-authority-foreground-launcher-required');
  if (!input.binding_path || !input.binding_path.startsWith('/')) throw new Error('provider-auth-authority-foreground-binding-path-invalid');
  const pid = input.process_id ?? process.pid;
  if (!Number.isInteger(pid) || pid < 1) throw new Error('provider-auth-authority-foreground-process-id-invalid');
  const now = input.now ?? (() => new Date().toISOString());
  let started = false;
  let persisted: ProviderAuthAuthorityBinding | undefined;
  let closed = false;
  const closeOnce = async () => { if (closed) return; closed = true; await input.launcher.close(); };
  return {
    async start() {
      if (started) throw new Error('provider-auth-authority-foreground-already-started');
      closed = false;
      try {
        await input.launcher.start();
        const readiness = await input.launcher.readiness();
        if (readiness.status === 'blocked') throw new Error(readiness.reason);
        if (readiness.socket_path !== input.binding.socket_path) throw new Error('provider-auth-authority-foreground-socket-binding-mismatch');
        const binding = createProviderAuthAuthorityBinding({ ...input.binding, pid, started_at: now() });
        await persistProviderAuthAuthorityBinding(input.binding_path, binding);
        persisted = binding;
        started = true;
        return { status: 'started', binding };
      } catch (error) {
        await closeOnce().catch(() => undefined);
        throw error;
      }
    },
    async stop() {
      if (!started) return { status: 'stopped' };
      try {
        await closeOnce();
        if (persisted) await unlink(input.binding_path).catch(() => undefined);
        started = false;
        persisted = undefined;
        return { status: 'stopped' };
      } catch { return { status: 'outcome-uncertain', reason: 'provider-auth-authority-close-failed' }; }
    },
  };
}
