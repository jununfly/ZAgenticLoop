#!/usr/bin/env node
import { type CliIo } from './cli.js';
import { readProviderAuthAuthorityBinding } from './provider-auth-authority-binding.js';
import { createProviderAuthAuthorityServiceLifecycle } from './provider-auth-authority-service-lifecycle.js';
import { type ProviderAuthAuthorityExternalStartController } from './provider-auth-authority-external-start-controller.js';
type SignalTarget = {
    on(signal: 'SIGINT' | 'SIGTERM', listener: () => void): unknown;
    off?(signal: 'SIGINT' | 'SIGTERM', listener: () => void): unknown;
};
export declare function runProviderAuthAuthorityCli(argv?: readonly string[], io?: CliIo, deps?: {
    read_binding?: typeof readProviderAuthAuthorityBinding;
    lifecycle?: ReturnType<typeof createProviderAuthAuthorityServiceLifecycle>;
    terminate?: (pid: number) => Promise<void>;
    binding_exists?: (bindingPath: string) => Promise<boolean>;
    create_controller?: (input: {
        config_path: string;
    }) => Promise<ProviderAuthAuthorityExternalStartController> | ProviderAuthAuthorityExternalStartController;
    signal_target?: SignalTarget;
}): Promise<number>;
export {};
