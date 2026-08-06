#!/usr/bin/env node
import { type CliIo } from './cli.js';
import { readProviderRuntimeServiceBinding } from './provider-runtime-service-binding.js';
import { createProviderRuntimeServiceLifecycle } from './provider-runtime-service-lifecycle.js';
import { bootstrapProviderRuntimeArtifact } from './provider-runtime-artifact-bootstrap.js';
import { readProviderRuntimeStartConfig } from './provider-runtime-start-config-store.js';
import { createMacOSKeychainHumanSigner } from './macos-keychain-human-signer.js';
import { type ProviderRuntimeStartAssembly } from './provider-runtime-start-assembly.js';
export declare function runProviderRuntimeCli(argv?: readonly string[], io?: CliIo, deps?: {
    read_binding?: typeof readProviderRuntimeServiceBinding;
    read_start_config?: typeof readProviderRuntimeStartConfig;
    bootstrap?: typeof bootstrapProviderRuntimeArtifact;
    lifecycle?: ReturnType<typeof createProviderRuntimeServiceLifecycle>;
    terminate?: (pid: number) => Promise<void>;
    create_signer?: typeof createMacOSKeychainHumanSigner;
    create_start_assembly?: (input: {
        config: Awaited<ReturnType<typeof readProviderRuntimeStartConfig>>;
        process_identity_digest: string;
    }) => ProviderRuntimeStartAssembly;
}): Promise<number>;
