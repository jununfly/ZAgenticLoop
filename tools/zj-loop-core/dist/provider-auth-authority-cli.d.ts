#!/usr/bin/env node
import { type CliIo } from './cli.js';
import { readProviderAuthAuthorityBinding } from './provider-auth-authority-binding.js';
import { createProviderAuthAuthorityServiceLifecycle } from './provider-auth-authority-service-lifecycle.js';
export declare function runProviderAuthAuthorityCli(argv?: readonly string[], io?: CliIo, deps?: {
    read_binding?: typeof readProviderAuthAuthorityBinding;
    lifecycle?: ReturnType<typeof createProviderAuthAuthorityServiceLifecycle>;
    terminate?: (pid: number) => Promise<void>;
    binding_exists?: (bindingPath: string) => Promise<boolean>;
}): Promise<number>;
