import { access } from 'node:fs/promises';
import { createProviderAuthAuthorityChildProcessLauncher } from './provider-auth-authority-external-process-launcher.js';
import { readProviderAuthAuthorityBinding } from './provider-auth-authority-binding.js';
import { readProviderAuthAuthorityStartConfig } from './provider-auth-authority-start-config-store.js';
function matches(binding, config) {
    return binding.service_id === `provider-auth-authority:${config.network_id}` && binding.network_id === config.network_id && binding.socket_path === config.socket_path && binding.authority_contract_digest === config.authority_contract_digest && binding.state_store_identity_digest === config.state_store_identity_digest && binding.state_store_path === config.state_store_path && binding.process_identity_digest === config.process_identity_digest;
}
async function exists(filePath) { try {
    await access(filePath);
    return true;
}
catch {
    return false;
} }
async function waitForBinding(config, timeoutMs, pollMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() <= deadline) {
        if (await exists(config.binding_path)) {
            const binding = await readProviderAuthAuthorityBinding(config.binding_path);
            if (!matches(binding, config))
                throw new Error('provider-auth-authority-binding-mismatch');
            return binding;
        }
        await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
    throw new Error('provider-auth-authority-binding-timeout');
}
export async function createProviderAuthAuthorityExternalStartController(input) {
    const config = await readProviderAuthAuthorityStartConfig(input.config_path);
    const launcher = await (input.create_launcher ? input.create_launcher({ config_path: input.config_path, config }) : createProviderAuthAuthorityChildProcessLauncher({ config_path: input.config_path }));
    const startupTimeoutMs = input.startup_timeout_ms ?? 10_000;
    const pollIntervalMs = input.poll_interval_ms ?? 25;
    if (!Number.isInteger(startupTimeoutMs) || startupTimeoutMs < 1 || !Number.isInteger(pollIntervalMs) || pollIntervalMs < 1)
        throw new Error('provider-auth-authority-external-start-timeout-invalid');
    let started = false;
    return {
        async start() {
            if (started)
                throw new Error('provider-auth-authority-external-already-started');
            if (await exists(config.binding_path))
                throw new Error('provider-auth-authority-binding-already-exists');
            try {
                await launcher.start();
                const readiness = await launcher.readiness();
                if (readiness.status === 'blocked')
                    throw new Error(readiness.reason);
                const binding = await waitForBinding(config, startupTimeoutMs, pollIntervalMs);
                started = true;
                return { status: 'started', binding };
            }
            catch (error) {
                await launcher.close().catch(() => undefined);
                throw error;
            }
        },
        async stop() {
            if (!started)
                return { status: 'stopped' };
            started = false;
            try {
                await launcher.close();
            }
            catch {
                return { status: 'outcome-uncertain', reason: 'provider-auth-authority-external-close-failed' };
            }
            return await exists(config.binding_path) ? { status: 'outcome-uncertain', reason: 'provider-auth-authority-binding-residue' } : { status: 'stopped' };
        },
    };
}
