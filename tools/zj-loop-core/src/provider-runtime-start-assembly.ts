import { createProviderAuthRefStateStoreResolver } from './provider-auth-ref-store.js';
import { createProviderAuthRuntimeServiceAdapter } from './provider-auth-runtime-service.js';
import { createSqliteStateStore, type SqliteStateStore } from './sqlite-state-store.js';
import { createProviderRuntimeForegroundService, type ProviderRuntimeForegroundService } from './provider-runtime-foreground-service.js';
import type { ProviderAuthRuntimeIpcLauncher } from './provider-auth-runtime-ipc-launcher.js';
import type { ProviderAuthRuntime } from './provider-auth-runtime.js';
import { validateProviderRuntimeStartConfig, type ProviderRuntimeStartConfig } from './provider-runtime-start-config.js';

export type ProviderRuntimeStartAssembly = {
  service: ProviderRuntimeForegroundService;
  state_store: SqliteStateStore;
  runtime: ProviderAuthRuntime;
  close(): Promise<void>;
};

export function createProviderRuntimeStartAssembly(input: {
  config: ProviderRuntimeStartConfig;
  process_identity_digest: string;
  revoke_ref: (input: { auth_ref_id: string }) => Promise<{ status: 'revoked' } | { status: 'blocked'; reason: string }>;
  create_launcher: (input: { runtime: ProviderAuthRuntime; config: ProviderRuntimeStartConfig }) => ProviderAuthRuntimeIpcLauncher;
  process_id?: number;
  now?: () => string;
}): ProviderRuntimeStartAssembly {
  const checked = validateProviderRuntimeStartConfig(input.config);
  if (checked.status === 'blocked') throw new Error(checked.reason);
  if (!/^sha256:[0-9a-f]{64}$/.test(input.process_identity_digest)) throw new Error('provider-runtime-start-process-identity-digest-invalid');
  if (typeof input.revoke_ref !== 'function') throw new Error('provider-runtime-start-revoke-authority-required');
  if (typeof input.create_launcher !== 'function') throw new Error('provider-runtime-start-launcher-factory-required');
  const config = checked.config;
  const stateStore = createSqliteStateStore({ filename: config.state_store_path });
  const resolver = createProviderAuthRefStateStoreResolver({ stateStore, network_id: config.network_id });
  const runtime = createProviderAuthRuntimeServiceAdapter({ runtime_id: config.runtime_id, provider_ids: config.provider_ids, runtime_binding: config.runtime_binding, resolver, revoke_ref: input.revoke_ref });
  const launcher = input.create_launcher({ runtime, config });
  const service = createProviderRuntimeForegroundService({ launcher, binding_path: config.binding_path, process_id: input.process_id, now: input.now, binding: { service_id: config.runtime_id, network_id: config.network_id, socket_path: config.socket_path, provider_id: config.provider_ids[0], provider_executable: config.provider_executable, working_directory: config.working_directory, contract_digest: config.contract_digest, adapter_contract_digest: config.adapter_contract_digest, runtime_binding: config.runtime_binding, process_identity_digest: input.process_identity_digest } });
  return { service, state_store: stateStore, runtime, async close() { await stateStore.close(); } };
}
