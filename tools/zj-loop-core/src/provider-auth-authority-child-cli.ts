import { pathToFileURL } from 'node:url';
import { createMacOSProviderAuthAuthorityPeerGate } from './provider-auth-authority-peer-identity.js';
import { readProviderAuthAuthorityStartConfig } from './provider-auth-authority-start-config-store.js';
import type { ProviderAuthAuthorityStartConfig } from './provider-auth-authority-start-config.js';
import { createProviderAuthAuthorityStartAssemblyFromConfig, type ProviderAuthAuthorityStartAssembly } from './provider-auth-authority-start-assembly.js';

export type ProviderAuthAuthorityChild = {
  config: ProviderAuthAuthorityStartConfig;
  assembly: ProviderAuthAuthorityStartAssembly;
  binding: Awaited<ReturnType<ProviderAuthAuthorityStartAssembly['service']['start']>>['binding'];
  shutdown(): Promise<{ status: 'stopped' } | { status: 'outcome-uncertain'; reason: string }>;
};

function parseConfigPath(argv: string[]): string {
  if (argv.length !== 2 || argv[0] !== '--config' || !argv[1] || !argv[1].startsWith('/')) throw new Error('provider-auth-authority-child-config-argument-invalid');
  return argv[1];
}

function createConfiguredPeerGate(config: ProviderAuthAuthorityStartConfig) {
  if (process.platform !== 'darwin') throw new Error('provider-auth-authority-child-platform-unsupported');
  if (!config.macos_helper_path || !config.macos_helper_digest) throw new Error('provider-auth-authority-child-macos-helper-required');
  return createMacOSProviderAuthAuthorityPeerGate({ helper_path: config.macos_helper_path, helper_digest: config.macos_helper_digest, expected_identity_digest: config.expected_peer_identity_digest, correlation_id: config.correlation_id });
}

export async function startProviderAuthAuthorityChild(input: { config_path: string; create_peer_gate?: (config: ProviderAuthAuthorityStartConfig) => (socket: import('node:net').Socket) => Promise<boolean> | boolean; process_id?: number; now?: () => string }): Promise<ProviderAuthAuthorityChild> {
  const config = await readProviderAuthAuthorityStartConfig(input.config_path);
  const verify_peer = input.create_peer_gate ? input.create_peer_gate(config) : createConfiguredPeerGate(config);
  const assembly = createProviderAuthAuthorityStartAssemblyFromConfig({ config, verify_peer, process_id: input.process_id, now: input.now });
  const started = await assembly.service.start();
  let shutDown = false;
  return {
    config,
    assembly,
    binding: started.binding,
    async shutdown() {
      if (shutDown) return { status: 'stopped' };
      shutDown = true;
      const stopped = await assembly.service.stop();
      if (stopped.status !== 'stopped') return stopped;
      try { await assembly.close(); return stopped; } catch { return { status: 'outcome-uncertain', reason: 'provider-auth-authority-state-store-close-failed' }; }
    },
  };
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  let child: ProviderAuthAuthorityChild | undefined;
  try {
    child = await startProviderAuthAuthorityChild({ config_path: parseConfigPath(argv) });
    process.stdout.write(`${JSON.stringify({ status: 'started', binding: child.binding })}\n`);
    await new Promise<void>((resolve) => {
      let handled = false;
      const onSignal = async () => { if (handled) return; handled = true; const result = await child?.shutdown(); if (result?.status !== 'stopped') process.exitCode = 1; resolve(); };
      process.once('SIGINT', onSignal);
      process.once('SIGTERM', onSignal);
    });
    return typeof process.exitCode === 'number' ? process.exitCode : 0;
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ status: 'blocked', reason: error instanceof Error ? error.message : 'provider-auth-authority-child-start-failed' })}\n`);
    if (child) await child.shutdown().catch(() => undefined);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().then((code) => { process.exitCode = code; }).catch(() => { process.exitCode = 1; });
