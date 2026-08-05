#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { access } from 'node:fs/promises';
import { defaultCliIo, runCli, type CliIo } from './cli.js';
import { readProviderAuthAuthorityBinding } from './provider-auth-authority-binding.js';
import { createProviderAuthAuthorityServiceLifecycle } from './provider-auth-authority-service-lifecycle.js';
import { createInMemoryProviderAuthAuthorityProcessIdentityVerifier } from './provider-auth-authority-process-identity.js';
import { createMacOSProviderAuthAuthorityProcessIdentityVerifier } from './macos-process-audit-peer-identity.js';
import { createProviderAuthAuthorityExternalStartController, type ProviderAuthAuthorityExternalStartController } from './provider-auth-authority-external-start-controller.js';

const SCHEMA = 'zj-loop.provider_auth_authority_cli.v1';

type SignalTarget = {
  on(signal: 'SIGINT' | 'SIGTERM', listener: () => void): unknown;
  off?(signal: 'SIGINT' | 'SIGTERM', listener: () => void): unknown;
};

async function defaultBindingExists(bindingPath: string): Promise<boolean> { try { await access(bindingPath); return true; } catch { return false; } }

export function runProviderAuthAuthorityCli(argv: readonly string[] = process.argv.slice(2), io: CliIo = defaultCliIo, deps?: {
  read_binding?: typeof readProviderAuthAuthorityBinding;
  lifecycle?: ReturnType<typeof createProviderAuthAuthorityServiceLifecycle>;
  terminate?: (pid: number) => Promise<void>;
  binding_exists?: (bindingPath: string) => Promise<boolean>;
  create_controller?: (input: { config_path: string }) => Promise<ProviderAuthAuthorityExternalStartController> | ProviderAuthAuthorityExternalStartController;
  signal_target?: SignalTarget;
}): Promise<number> {
  return runCli({
    name: 'zj-loop-provider-auth-authority',
    description: 'Inspect or stop a ProviderAuth Authority using a verified binding artifact.',
    usage: 'zj-loop-provider-auth-authority <start|status|stop> --binding <path> [--json]',
    options: [
      { name: 'command', type: 'positional', description: 'start, status, or stop' },
      { name: 'binding', type: 'string', description: 'Authority binding artifact path' },
      { name: 'config', type: 'string', description: 'Authority start config path' },
      { name: 'macos_helper', flag: 'macos-helper', type: 'string', description: 'Pinned macOS process-audit helper path' },
      { name: 'macos_helper_digest', flag: 'macos-helper-digest', type: 'string', description: 'SHA-256 digest of the macOS process-audit helper' },
      { name: 'json', type: 'boolean', description: 'Emit structured JSON', default: false },
    ],
    async handler({ options }) {
      const command = String(options.command ?? '');
      if (command === 'start') {
        const configPath = typeof options.config === 'string' ? options.config : '';
        if (!configPath) throw new Error('provider-auth-authority-start-config-required');
        let controller: ProviderAuthAuthorityExternalStartController;
        try {
          controller = await (deps?.create_controller
            ? deps.create_controller({ config_path: configPath })
            : createProviderAuthAuthorityExternalStartController({ config_path: configPath }));
          const started = await controller.start();
          io.stdout(JSON.stringify({ schema: SCHEMA, status: started.status, binding: started.binding, side_effects_executed: true }));
          const signalTarget = deps?.signal_target ?? process;
          return await new Promise<number>((resolve) => {
            let stopping = false;
            const onSignal = async (signal: 'SIGINT' | 'SIGTERM') => {
              if (stopping) return;
              stopping = true;
              const result = await controller.stop().catch(() => ({ status: 'outcome-uncertain' as const, reason: 'provider-auth-authority-cli-stop-failed' as const }));
              signalTarget.off?.('SIGINT', onSigint);
              signalTarget.off?.('SIGTERM', onSigterm);
              io.stdout(JSON.stringify({ schema: SCHEMA, ...result, signal, side_effects_executed: result.status === 'stopped' }));
              resolve(result.status === 'stopped' ? 0 : 2);
            };
            const onSigint = () => { void onSignal('SIGINT'); };
            const onSigterm = () => { void onSignal('SIGTERM'); };
            signalTarget.on('SIGINT', onSigint);
            signalTarget.on('SIGTERM', onSigterm);
          });
        } catch (error) {
          const reason = error instanceof Error ? error.message : 'provider-auth-authority-start-failed';
          io.stdout(JSON.stringify({ schema: SCHEMA, status: 'blocked', reason, side_effects_executed: false }));
          return 2;
        }
      }
      const bindingPath = typeof options.binding === 'string' ? options.binding : '';
      if (!bindingPath) throw new Error('provider-auth-authority-binding-required');
      const readBinding = deps?.read_binding ?? readProviderAuthAuthorityBinding;
      const binding = await readBinding(bindingPath);
      const lifecycle = deps?.lifecycle ?? createProviderAuthAuthorityServiceLifecycle({ verifier: typeof options.macos_helper === 'string' && typeof options.macos_helper_digest === 'string'
        ? createMacOSProviderAuthAuthorityProcessIdentityVerifier({ helper_path: options.macos_helper, helper_digest: options.macos_helper_digest })
        : createInMemoryProviderAuthAuthorityProcessIdentityVerifier({ available: false }) });
      let result = command === 'status'
        ? await lifecycle.status({ binding })
        : command === 'stop'
          ? await lifecycle.stop({ binding, terminate: deps?.terminate ?? (async (pid) => { process.kill(pid, 'SIGTERM'); }) })
          : { status: 'blocked', reason: 'provider-auth-authority-command-unsupported' };
      if (command === 'stop' && result.status === 'stopped' && await (deps?.binding_exists ?? defaultBindingExists)(bindingPath)) result = { status: 'outcome-uncertain', reason: 'provider-auth-authority-binding-residue' };
      io.stdout(JSON.stringify({ schema: SCHEMA, ...result, side_effects_executed: result.status === 'stopped' }));
      return result.status === 'ready' || result.status === 'stopped' ? 0 : 2;
    },
  }, argv, io);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) process.exitCode = await runProviderAuthAuthorityCli();
