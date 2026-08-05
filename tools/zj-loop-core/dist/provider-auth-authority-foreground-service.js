import { unlink } from 'node:fs/promises';
import { createProviderAuthAuthorityBinding, persistProviderAuthAuthorityBinding } from './provider-auth-authority-binding.js';
export function createProviderAuthAuthorityForegroundService(input) {
    if (!input.launcher || typeof input.launcher.start !== 'function' || typeof input.launcher.readiness !== 'function' || typeof input.launcher.close !== 'function')
        throw new Error('provider-auth-authority-foreground-launcher-required');
    if (!input.binding_path || !input.binding_path.startsWith('/'))
        throw new Error('provider-auth-authority-foreground-binding-path-invalid');
    const pid = input.process_id ?? process.pid;
    if (!Number.isInteger(pid) || pid < 1)
        throw new Error('provider-auth-authority-foreground-process-id-invalid');
    const now = input.now ?? (() => new Date().toISOString());
    let started = false;
    let persisted;
    return {
        async start() {
            if (started)
                throw new Error('provider-auth-authority-foreground-already-started');
            await input.launcher.start();
            const readiness = await input.launcher.readiness();
            if (readiness.status === 'blocked') {
                await input.launcher.close();
                throw new Error(readiness.reason);
            }
            if (readiness.socket_path !== input.binding.socket_path) {
                await input.launcher.close();
                throw new Error('provider-auth-authority-foreground-socket-binding-mismatch');
            }
            const binding = createProviderAuthAuthorityBinding({ ...input.binding, pid, started_at: now() });
            try {
                await persistProviderAuthAuthorityBinding(input.binding_path, binding);
            }
            catch (error) {
                await input.launcher.close();
                throw error;
            }
            persisted = binding;
            started = true;
            return { status: 'started', binding };
        },
        async stop() {
            if (!started)
                return { status: 'stopped' };
            try {
                await input.launcher.close();
                if (persisted)
                    await unlink(input.binding_path).catch(() => undefined);
                started = false;
                persisted = undefined;
                return { status: 'stopped' };
            }
            catch {
                return { status: 'outcome-uncertain', reason: 'provider-auth-authority-close-failed' };
            }
        },
    };
}
