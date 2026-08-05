import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { validateProviderRuntimeIdentityBinding, type ProviderRuntimeIdentityBinding } from './provider-auth-runtime.js';

export const PROVIDER_RUNTIME_SERVICE_BINDING_SCHEMA = 'zj-loop.provider_runtime_service_binding.v1' as const;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const KEYS = new Set(['schema', 'service_id', 'network_id', 'socket_path', 'provider_id', 'provider_executable', 'working_directory', 'contract_digest', 'adapter_contract_digest', 'runtime_binding', 'process_identity_digest', 'pid', 'started_at', 'binding_digest']);

export type ProviderRuntimeServiceBinding = {
  schema: typeof PROVIDER_RUNTIME_SERVICE_BINDING_SCHEMA;
  service_id: string;
  network_id: string;
  socket_path: string;
  provider_id: string;
  provider_executable: string;
  working_directory: string;
  contract_digest: string;
  adapter_contract_digest: string;
  runtime_binding: ProviderRuntimeIdentityBinding;
  process_identity_digest: string;
  pid: number;
  started_at: string;
  binding_digest: string;
};

function canonical(value: unknown): string { const result = canonicalize(value); if (typeof result !== 'string') throw new Error('provider-runtime-service-binding-canonicalization-invalid'); return result; }
function digest(value: unknown): string { return `sha256:${createHash('sha256').update(canonical(value), 'utf8').digest('hex')}`; }
function text(value: unknown): value is string { return typeof value === 'string' && value.trim() !== '' && !value.includes('\0'); }

export function createProviderRuntimeServiceBinding(input: Omit<ProviderRuntimeServiceBinding, 'schema' | 'binding_digest'>): ProviderRuntimeServiceBinding {
  const unsigned = { schema: PROVIDER_RUNTIME_SERVICE_BINDING_SCHEMA, ...structuredClone(input) };
  const validation = validateProviderRuntimeServiceBinding({ ...unsigned, binding_digest: digest(unsigned) });
  if (validation.status === 'blocked') throw new Error(validation.reason);
  return Object.freeze({ ...unsigned, binding_digest: digest(unsigned) });
}

export function validateProviderRuntimeServiceBinding(value: unknown): { status: 'valid'; binding: ProviderRuntimeServiceBinding } | { status: 'blocked'; reason: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { status: 'blocked', reason: 'provider-runtime-service-binding-invalid' };
  const item = value as Record<string, unknown>;
  if (Object.keys(item).some((key) => !KEYS.has(key)) || item.schema !== PROVIDER_RUNTIME_SERVICE_BINDING_SCHEMA || !text(item.service_id) || !text(item.network_id) || !text(item.socket_path) || !item.socket_path.startsWith('/') || !text(item.provider_id) || !text(item.provider_executable) || !item.provider_executable.startsWith('/') || !text(item.working_directory) || !item.working_directory.startsWith('/') || !DIGEST.test(String(item.contract_digest)) || !DIGEST.test(String(item.adapter_contract_digest)) || validateProviderRuntimeIdentityBinding(item.runtime_binding).status === 'blocked' || !DIGEST.test(String(item.process_identity_digest)) || !Number.isInteger(item.pid) || (item.pid as number) < 1 || !Number.isFinite(Date.parse(String(item.started_at))) || !DIGEST.test(String(item.binding_digest))) return { status: 'blocked', reason: 'provider-runtime-service-binding-invalid' };
  const { binding_digest: _, ...unsigned } = item;
  if (digest(unsigned) !== item.binding_digest) return { status: 'blocked', reason: 'provider-runtime-service-binding-digest-invalid' };
  return { status: 'valid', binding: item as ProviderRuntimeServiceBinding };
}

export async function persistProviderRuntimeServiceBinding(filePath: string, binding: ProviderRuntimeServiceBinding): Promise<void> {
  const checked = validateProviderRuntimeServiceBinding(binding);
  if (checked.status === 'blocked') throw new Error(checked.reason);
  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  await writeFile(filePath, `${JSON.stringify(binding, null, 2)}\n`, { mode: 0o600 });
  await chmod(filePath, 0o600);
}

export async function readProviderRuntimeServiceBinding(filePath: string): Promise<ProviderRuntimeServiceBinding> {
  const value = JSON.parse(await readFile(filePath, 'utf8')) as unknown;
  const checked = validateProviderRuntimeServiceBinding(value);
  if (checked.status === 'blocked') throw new Error(checked.reason);
  return checked.binding;
}
