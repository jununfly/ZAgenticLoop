#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultCliIo, runCli } from './cli.js';
import { readProviderRuntimeServiceBinding } from './provider-runtime-service-binding.js';
import { createInMemoryProviderRuntimeProcessIdentityVerifier } from './provider-runtime-process-identity.js';
import { createProviderRuntimeServiceLifecycle } from './provider-runtime-service-lifecycle.js';
const SCHEMA = 'zj-loop.provider_runtime_cli.v1';
export function runProviderRuntimeCli(argv = process.argv.slice(2), io = defaultCliIo, deps) {
    return runCli({
        name: 'zj-loop-provider-runtime',
        description: 'Inspect or stop a provider runtime using a verified binding artifact.',
        usage: 'zj-loop-provider-runtime <start|status|stop> --binding <path> [--json]',
        options: [
            { name: 'command', type: 'positional', description: 'start, status, or stop' },
            { name: 'binding', type: 'string', description: 'Runtime binding artifact path' },
            { name: 'json', type: 'boolean', description: 'Emit structured JSON', default: false },
        ],
        async handler({ options }) {
            const command = String(options.command ?? '');
            const bindingPath = typeof options.binding === 'string' ? options.binding : '';
            if (!bindingPath)
                throw new Error('provider-runtime-binding-required');
            if (command === 'start') {
                const result = { schema: SCHEMA, status: 'blocked', reason: 'provider-runtime-start-bootstrap-not-configured', side_effects_executed: false };
                io.stdout(JSON.stringify(result));
                return 2;
            }
            const readBinding = deps?.read_binding ?? readProviderRuntimeServiceBinding;
            const binding = await readBinding(bindingPath);
            const lifecycle = deps?.lifecycle ?? createProviderRuntimeServiceLifecycle({ verifier: createInMemoryProviderRuntimeProcessIdentityVerifier({ available: false }) });
            const result = command === 'status'
                ? await lifecycle.status({ binding })
                : command === 'stop'
                    ? await lifecycle.stop({ binding, terminate: deps?.terminate ?? (async () => { throw new Error('provider-runtime-terminate-not-configured'); }) })
                    : { status: 'blocked', reason: 'provider-runtime-command-unsupported' };
            io.stdout(JSON.stringify({ schema: SCHEMA, ...result, side_effects_executed: result.status === 'stopped' }));
            return result.status === 'ready' || result.status === 'stopped' ? 0 : 2;
        },
    }, argv, io);
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url)))
    process.exitCode = await runProviderRuntimeCli();
