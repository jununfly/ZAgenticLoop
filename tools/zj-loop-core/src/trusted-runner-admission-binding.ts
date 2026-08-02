import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
import { createLocalExecutionPreflight, validateLocalExecutionPreflight, type LocalExecutionPreflight, type LocalExecutionPreflightInput } from './local-execution-preflight.js';
import { trustedRunnerCapabilitiesDigest, validateTrustedRunnerCapabilities } from './trusted-runner-registry.js';
import type { TrustedRunnerExecutionContext } from './trusted-runner.js';
import type { TrustedRunnerAdmissionBinding, TrustedRunnerExecutionAdmissionResult } from './trusted-runner-registry-store.js';
import { validateProviderAuthRef, validateProviderRuntimeIdentityBinding, type ProviderAuthRef, type ProviderRuntimeIdentityBinding } from './provider-auth-runtime.js';

const DIGEST = /^sha256:[0-9a-f]{64}$/;
type AdmissionBindingFields = keyof Pick<TrustedRunnerAdmissionBinding, 'runner_id' | 'registry_revision' | 'registry_snapshot_digest' | 'capabilities_digest' | 'provider_auth_ref' | 'runtime_binding'>;
export type AdmissionBoundLocalExecutionPreflightInput = Omit<LocalExecutionPreflightInput, AdmissionBindingFields>;
export type AdmissionBoundTrustedRunnerExecutionContextInput = Omit<TrustedRunnerExecutionContext, AdmissionBindingFields>;
export type AdmissionBoundExecutionInput = { preflight: AdmissionBoundLocalExecutionPreflightInput; execution: Omit<AdmissionBoundTrustedRunnerExecutionContextInput, 'execution_id' | 'attempt' | 'preflight_digest'>; admission: TrustedRunnerExecutionAdmissionResult; runtime_binding: ProviderRuntimeIdentityBinding };
export type AdmissionBoundExecution = { binding: TrustedRunnerAdmissionBinding & { provider_auth_ref: ProviderAuthRef; runtime_binding: ProviderRuntimeIdentityBinding }; preflight: LocalExecutionPreflight; execution: TrustedRunnerExecutionContext };

export function trustedRunnerAdmissionBundleDigest(value: AdmissionBoundExecution): string {
  const json = canonicalize(value);
  if (typeof json !== 'string') throw new Error('trusted-runner-admission-bundle-canonicalization-invalid');
  return `sha256:${createHash('sha256').update(json, 'utf8').digest('hex')}`;
}

function checkedBinding(input: TrustedRunnerAdmissionBinding): TrustedRunnerAdmissionBinding & { provider_auth_ref: ProviderAuthRef; runtime_binding: ProviderRuntimeIdentityBinding } {
  if (!input || typeof input.network_id !== 'string' || input.network_id.trim().length === 0) throw new Error('trusted-runner-admission-binding-network-id-invalid');
  if (!input || typeof input.runner_id !== 'string' || input.runner_id.trim().length === 0) throw new Error('trusted-runner-admission-binding-runner-id-invalid');
  if (!Number.isInteger(input.registry_revision) || input.registry_revision < 1) throw new Error('trusted-runner-admission-binding-registry-revision-invalid');
  if (!DIGEST.test(input.registry_snapshot_digest)) throw new Error('trusted-runner-admission-binding-registry-snapshot-digest-invalid');
  if (!Array.isArray(input.required_capabilities) || validateTrustedRunnerCapabilities(input.required_capabilities).status === 'blocked') throw new Error('trusted-runner-admission-binding-required-capabilities-invalid');
  if (validateTrustedRunnerCapabilities(input.capabilities).status === 'blocked') throw new Error('trusted-runner-admission-binding-capabilities-invalid');
  if (!input.provider_auth_ref || validateProviderAuthRef(input.provider_auth_ref).status === 'blocked') throw new Error('trusted-runner-admission-binding-provider-auth-ref-invalid');
  const runtimeBinding = validateProviderRuntimeIdentityBinding(input.runtime_binding);
  if (runtimeBinding.status === 'blocked') throw new Error('trusted-runner-admission-binding-runtime-binding-invalid');
  if (input.capabilities_digest !== trustedRunnerCapabilitiesDigest(input.capabilities)) throw new Error('trusted-runner-admission-binding-capabilities-digest-invalid');
  return { ...input, required_capabilities: [...new Set(input.required_capabilities)].sort(), capabilities: [...input.capabilities].sort(), provider_auth_ref: structuredClone(input.provider_auth_ref), runtime_binding: structuredClone(runtimeBinding.binding) };
}

export function createAdmissionBoundLocalExecutionPreflight(input: { preflight: AdmissionBoundLocalExecutionPreflightInput; binding: TrustedRunnerAdmissionBinding }): LocalExecutionPreflight {
  const binding = checkedBinding(input.binding);
  if (input.preflight.network_id !== binding.network_id) throw new Error('trusted-runner-admission-binding-network-id-mismatch');
  if (input.preflight.execution_id !== binding.provider_auth_ref.execution_id || input.preflight.attempt !== binding.provider_auth_ref.attempt || input.preflight.provider_id !== binding.provider_auth_ref.provider_id || binding.provider_auth_ref.network_id !== binding.network_id) throw new Error('trusted-runner-admission-binding-provider-auth-ref-mismatch');
  return createLocalExecutionPreflight({ ...input.preflight, provider_auth_ref: binding.provider_auth_ref, runner_id: binding.runner_id, registry_revision: binding.registry_revision, registry_snapshot_digest: binding.registry_snapshot_digest, capabilities_digest: binding.capabilities_digest });
}

export function createAdmissionBoundTrustedRunnerExecutionContext(input: { execution: AdmissionBoundTrustedRunnerExecutionContextInput; binding: TrustedRunnerAdmissionBinding }): TrustedRunnerExecutionContext {
  const binding = checkedBinding(input.binding);
  if (input.execution.execution_id && (input.execution.execution_id !== binding.provider_auth_ref.execution_id || input.execution.attempt !== binding.provider_auth_ref.attempt)) throw new Error('trusted-runner-admission-binding-provider-auth-ref-mismatch');
  return { ...input.execution, provider_auth_ref: binding.provider_auth_ref, runner_id: binding.runner_id, registry_revision: binding.registry_revision, registry_snapshot_digest: binding.registry_snapshot_digest, capabilities_digest: binding.capabilities_digest };
}

export function createAdmissionBoundExecution(input: AdmissionBoundExecutionInput): AdmissionBoundExecution {
  if (input.admission.status !== 'admitted') throw new Error('trusted-runner-admission-blocked');
  const binding = checkedBinding({ ...input.admission.binding, runtime_binding: input.runtime_binding });
  const preflight = createAdmissionBoundLocalExecutionPreflight({ preflight: input.preflight, binding });
  const execution = createAdmissionBoundTrustedRunnerExecutionContext({ execution: { ...input.execution, execution_id: preflight.execution_id, attempt: preflight.attempt, preflight_digest: preflight.preflight_digest }, binding });
  return { binding, preflight, execution };
}

export function validateAdmissionBoundExecution(input: unknown): { status: 'valid' } | { status: 'blocked'; reason: string } {
  try {
    if (!input || typeof input !== 'object') return { status: 'blocked', reason: 'trusted-runner-admission-bundle-invalid' };
    const value = input as AdmissionBoundExecution;
    const binding = checkedBinding(value.binding);
    if (validateLocalExecutionPreflight(value.preflight).status !== 'valid') return { status: 'blocked', reason: 'trusted-runner-admission-preflight-invalid' };
    if (value.preflight.network_id !== binding.network_id || value.preflight.runner_id !== binding.runner_id || value.preflight.registry_revision !== binding.registry_revision || value.preflight.registry_snapshot_digest !== binding.registry_snapshot_digest || value.preflight.capabilities_digest !== binding.capabilities_digest || JSON.stringify(value.preflight.provider_auth_ref) !== JSON.stringify(binding.provider_auth_ref)) return { status: 'blocked', reason: 'trusted-runner-admission-preflight-binding-invalid' };
    if (value.execution.runner_id !== binding.runner_id || value.execution.registry_revision !== binding.registry_revision || value.execution.registry_snapshot_digest !== binding.registry_snapshot_digest || value.execution.capabilities_digest !== binding.capabilities_digest || JSON.stringify(value.execution.provider_auth_ref) !== JSON.stringify(binding.provider_auth_ref) || value.execution.execution_id !== value.preflight.execution_id || value.execution.attempt !== value.preflight.attempt || value.execution.preflight_digest !== value.preflight.preflight_digest) return { status: 'blocked', reason: 'trusted-runner-admission-execution-binding-invalid' };
    return { status: 'valid' };
  } catch (error) {
    return { status: 'blocked', reason: error instanceof Error ? error.message : 'trusted-runner-admission-bundle-invalid' };
  }
}
