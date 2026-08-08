#!/usr/bin/env node
import os from 'node:os';
import path from 'node:path';
import { access } from 'node:fs/promises';
import { defaultCliIo, runCli } from './cli.js';
import { createDevelopmentProviderRuntime } from './provider-runtime-dev-entrypoint.js';
const SCHEMA = 'zj-loop.provider_runtime_dev_cli.v1';
export function runProviderRuntimeDevCli(argv = process.argv.slice(2), io = defaultCliIo) {
    return runCli({
        name: 'zj-loop-provider-runtime-dev',
        description: 'Start the disposable development-local Provider Runtime.',
        usage: 'zj-loop-provider-runtime-dev start [options]',
        options: [
            { name: 'command', type: 'positional', description: 'start' },
            { name: 'runtime_dir', flag: 'runtime-dir', type: 'string', description: 'Disposable runtime directory' },
            { name: 'network_id', flag: 'network-id', type: 'string', description: 'Network identifier' },
            { name: 'runtime_id', flag: 'runtime-id', type: 'string', description: 'Runtime identifier' },
            { name: 'provider_id', flag: 'provider-id', type: 'string', description: 'Provider identifier' },
            { name: 'node_id', flag: 'node-id', type: 'string', description: 'Local trusted runner node identifier' },
            { name: 'execution_id', flag: 'execution-id', type: 'string', description: 'Execution binding identifier' },
            { name: 'provider_executable', flag: 'provider-executable', type: 'string', description: 'Absolute provider executable' },
            { name: 'cwd', type: 'string', description: 'Absolute provider working directory' },
            { name: 'provider_secret_env', flag: 'provider-secret-env', type: 'string', description: 'Environment variable containing dev provider secret' },
            { name: 'provider_auth_env', flag: 'provider-auth-env', type: 'string', description: 'Provider process environment variable receiving the dev secret' },
            { name: 'peer_identity_digest', flag: 'peer-identity-digest', type: 'string', description: 'Development trusted-runner peer digest' },
            { name: 'json', type: 'boolean', description: 'Emit structured JSON', default: true },
        ],
        async handler({ options }) {
            const command = String(options.command ?? '');
            if (command !== 'start')
                throw new Error('provider-runtime-dev-command-unsupported');
            const runtimeDir = typeof options.runtime_dir === 'string' && options.runtime_dir.trim() !== '' ? options.runtime_dir : path.join(os.tmpdir(), `zj-loop-provider-runtime-dev-${process.pid}`);
            if (!runtimeDir.startsWith('/'))
                throw new Error('provider-runtime-dev-runtime-dir-invalid');
            const secretEnv = typeof options.provider_secret_env === 'string' && options.provider_secret_env.trim() !== '' ? options.provider_secret_env : 'ZJ_LOOP_DEV_PROVIDER_SECRET';
            const secret = process.env[secretEnv];
            if (!secret)
                throw new Error(`provider-runtime-dev-secret-env-missing:${secretEnv}`);
            const providerExecutable = typeof options.provider_executable === 'string' && options.provider_executable.trim() !== '' ? options.provider_executable : '/opt/homebrew/bin/codex';
            const cwd = typeof options.cwd === 'string' && options.cwd.trim() !== '' ? options.cwd : process.cwd();
            await access(providerExecutable);
            const runtime = createDevelopmentProviderRuntime({
                profile: 'development-local',
                network_id: typeof options.network_id === 'string' ? options.network_id : 'zj-loop-dev',
                runtime_id: typeof options.runtime_id === 'string' ? options.runtime_id : `provider-runtime-dev-${process.pid}`,
                provider_id: typeof options.provider_id === 'string' ? options.provider_id : 'codex',
                node_id: typeof options.node_id === 'string' ? options.node_id : `local-node-${process.pid}`,
                execution_id: typeof options.execution_id === 'string' ? options.execution_id : `local-execution-${process.pid}`,
                attempt: 1,
                socket_path: path.join(runtimeDir, 'provider-runtime.sock'),
                binding_path: path.join(runtimeDir, 'provider-runtime-binding.json'),
                auth_ref_path: path.join(runtimeDir, 'provider-runtime-auth-ref.json'),
                provider_executable: providerExecutable,
                working_directory: cwd,
                provider_secret: secret,
                provider_auth_env: typeof options.provider_auth_env === 'string' ? options.provider_auth_env : 'AICODING_API_KEY',
            }, { peer_identity_digest: typeof options.peer_identity_digest === 'string' ? options.peer_identity_digest : undefined });
            let started;
            try {
                started = await runtime.start();
            }
            catch (error) {
                await runtime.close();
                throw error;
            }
            io.stdout(JSON.stringify({ schema: SCHEMA, status: started.status, profile: 'development-local', socket_path: started.binding.socket_path, binding_path: path.join(runtimeDir, 'provider-runtime-binding.json'), dev_binding_path: started.dev_binding.dev_binding_path, auth_ref_path: started.dev_binding.auth_ref_path, auth_ref_digest: started.dev_binding.auth_ref.ref_digest, correlation_id: started.dev_binding.correlation_id, warning: started.dev_binding.warning, side_effects_executed: false }));
            const stop = async () => { await runtime.close(); };
            process.once('SIGINT', () => { void stop().finally(() => process.exit(0)); });
            process.once('SIGTERM', () => { void stop().finally(() => process.exit(0)); });
            await new Promise(() => undefined);
            return 0;
        },
    }, argv, io);
}
if (process.argv[1] && process.argv[1].endsWith('provider-runtime-dev-cli.js'))
    process.exitCode = await runProviderRuntimeDevCli();
