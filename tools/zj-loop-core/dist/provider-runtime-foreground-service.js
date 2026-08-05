import { unlink } from 'node:fs/promises';
import { createProviderRuntimeServiceBinding, persistProviderRuntimeServiceBinding } from './provider-runtime-service-binding.js';
export function createProviderRuntimeForegroundService(input) {
    if (!input.launcher || typeof input.launcher.start !== 'function' || typeof input.launcher.readiness !== 'function' || typeof input.launcher.close !== 'function')
        throw new Error('provider-runtime-foreground-launcher-required');
    if (!input.binding_path || !input.binding_path.startsWith('/'))
        throw new Error('provider-runtime-foreground-binding-path-invalid');
    const pid = input.process_id ?? process.pid;
    if (!Number.isInteger(pid) || pid < 1)
        throw new Error('provider-runtime-foreground-process-id-invalid');
    const now = input.now ?? (() => new Date().toISOString());
    let started = false;
    let persisted;
    return {
        async start() {
            if (started)
                throw new Error('provider-runtime-foreground-already-started');
            await input.launcher.start();
            const readiness = await input.launcher.readiness();
            if (readiness.status === 'blocked') {
                await input.launcher.close();
                throw new Error(readiness.reason);
            }
            if (readiness.socket_path !== input.binding.socket_path) {
                await input.launcher.close();
                throw new Error('provider-runtime-foreground-socket-binding-mismatch');
            }
            const binding = createProviderRuntimeServiceBinding({ ...input.binding, pid, started_at: now() });
            try {
                await persistProviderRuntimeServiceBinding(input.binding_path, binding);
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
                return { status: 'outcome-uncertain', reason: 'provider-runtime-close-failed' };
            }
        },
    };
}
