#!/usr/bin/env node
import { type CliIo } from './cli.js';
import { readProviderRuntimeServiceBinding } from './provider-runtime-service-binding.js';
import { createProviderRuntimeServiceLifecycle } from './provider-runtime-service-lifecycle.js';
export declare function runProviderRuntimeCli(argv?: readonly string[], io?: CliIo, deps?: {
    read_binding?: typeof readProviderRuntimeServiceBinding;
    lifecycle?: ReturnType<typeof createProviderRuntimeServiceLifecycle>;
    terminate?: (pid: number) => Promise<void>;
}): Promise<number>;
