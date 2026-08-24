import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
import {
  NATIVE_CHECKPOINT_FIXTURE_SCHEMA,
  NATIVE_CHECKPOINT_RESUME_ORACLE_SCHEMA,
  NATIVE_CHECKPOINT_AUTHORITY_INVARIANTS,
  type NativeCheckpointAuthority,
} from './native-checkpoint-fixture.js';
import {
  NATIVE_CHECKPOINT_ADAPTER_INPUT_SCHEMA,
  NATIVE_CHECKPOINT_ADAPTER_OUTPUT_SCHEMA,
} from './native-checkpoint-adapter.js';

export const NATIVE_CHECKPOINT_ADAPTER_BOUNDARY_SCHEMA = 'zj-loop.native_checkpoint_adapter_boundary.v1' as const;
export const NATIVE_CHECKPOINT_ADAPTER_CONTRACT_REVISION = 1 as const;

/**
 * The adapter owns compatibility and translation risk, but native-core owns
 * all durable semantics. These values are the removal boundary for the probe.
 */
export const NATIVE_CHECKPOINT_ADAPTER_EXIT_BOUNDARY = Object.freeze({
  dependency_owner: 'adapter',
  version_skew_owner: 'adapter',
  state_translation_owner: 'adapter',
  exit_owner: 'adapter',
  native_fallback: 'required',
  provider_opaque_state: 'not-persisted',
  side_effects_executed: false,
  on_dependency_missing: 'blocked',
  on_version_skew: 'blocked',
  on_contract_digest_drift: 'blocked',
  on_state_translation_loss: 'blocked',
  on_conformance_failure: 'remove-and-rerun-native',
  authority: Object.freeze({ ...NATIVE_CHECKPOINT_AUTHORITY_INVARIANTS }),
} as const);

export type NativeCheckpointAdapterProviderDependency = {
  provider_id: string;
  package_name: string;
  package_version: string;
  checkpoint_schema: string;
  artifact_digest: string;
};

export type NativeCheckpointAdapterNativeContractPin = {
  core_version: string;
  contract_revision: typeof NATIVE_CHECKPOINT_ADAPTER_CONTRACT_REVISION;
  input_schema: typeof NATIVE_CHECKPOINT_ADAPTER_INPUT_SCHEMA;
  output_schema: typeof NATIVE_CHECKPOINT_ADAPTER_OUTPUT_SCHEMA;
  fixture_schema: typeof NATIVE_CHECKPOINT_FIXTURE_SCHEMA;
  oracle_schema: typeof NATIVE_CHECKPOINT_RESUME_ORACLE_SCHEMA;
};

export type NativeCheckpointAdapterBoundaryContract = {
  schema: typeof NATIVE_CHECKPOINT_ADAPTER_BOUNDARY_SCHEMA;
  adapter_id: string;
  adapter_version: string;
  native_contract: NativeCheckpointAdapterNativeContractPin;
  provider_dependency: NativeCheckpointAdapterProviderDependency;
  exit_boundary: typeof NATIVE_CHECKPOINT_ADAPTER_EXIT_BOUNDARY;
  contract_digest: string;
};

export type NativeCheckpointAdapterCompatibilityExpectation = {
  adapter_id: string;
  adapter_version: string;
  core_version: string;
  provider_dependency: NativeCheckpointAdapterProviderDependency;
};

export type NativeCheckpointAdapterBoundaryValidation =
  | { status: 'valid'; contract: NativeCheckpointAdapterBoundaryContract }
  | { status: 'blocked'; errors: string[] };

export type NativeCheckpointAdapterCompatibilityValidation =
  | { status: 'valid' }
  | { status: 'blocked'; errors: string[] };

export type NativeCheckpointAdapterExitObservation = {
  dependency_available: boolean;
  compatibility: 'matched' | 'skewed';
  contract_digest: 'matched' | 'drifted';
  state_translation: 'preserved' | 'lossy';
  conformance: 'passed' | 'failed';
  native_fallback_available: boolean;
};

export type NativeCheckpointAdapterExitDecision =
  | {
    status: 'ready';
    action: 'continue';
    reason: null;
    native_fallback_required: true;
    side_effects_executed: false;
  }
  | {
    status: 'blocked';
    action: 'use-native-fallback' | 'stop';
    reason: 'dependency-missing' | 'version-skew' | 'contract-digest-drift' | 'state-translation-loss' | 'native-fallback-unavailable';
    native_fallback_required: true;
    side_effects_executed: false;
  }
  | {
    status: 'retire';
    action: 'remove-and-rerun-native';
    reason: 'conformance-failure';
    native_fallback_required: true;
    side_effects_executed: false;
  };

const CONTRACT_KEYS = ['schema', 'adapter_id', 'adapter_version', 'native_contract', 'provider_dependency', 'exit_boundary', 'contract_digest'];
const NATIVE_CONTRACT_KEYS = ['core_version', 'contract_revision', 'input_schema', 'output_schema', 'fixture_schema', 'oracle_schema'];
const PROVIDER_DEPENDENCY_KEYS = ['provider_id', 'package_name', 'package_version', 'checkpoint_schema', 'artifact_digest'];
const EXIT_BOUNDARY_KEYS = ['dependency_owner', 'version_skew_owner', 'state_translation_owner', 'exit_owner', 'native_fallback', 'provider_opaque_state', 'side_effects_executed', 'on_dependency_missing', 'on_version_skew', 'on_contract_digest_drift', 'on_state_translation_loss', 'on_conformance_failure', 'authority'];
const AUTHORITY_KEYS = ['resume_admission', 'execution_lifecycle', 'evidence', 'human_acceptance'] as const;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const ID = /^[^\s]{1,256}$/;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key));
}

function id(value: unknown): value is string {
  return typeof value === 'string' && ID.test(value);
}

function semver(value: unknown): value is string {
  return typeof value === 'string' && SEMVER.test(value);
}

function digest(value: unknown): value is string {
  return typeof value === 'string' && DIGEST.test(value);
}

function canonical(value: unknown): string {
  const json = canonicalize(value);
  if (typeof json !== 'string') throw new Error('native-checkpoint-adapter-boundary-canonicalization-invalid');
  return json;
}

function calculateDigest(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonical(value), 'utf8').digest('hex')}`;
}

function withoutContractDigest(value: NativeCheckpointAdapterBoundaryContract): Omit<NativeCheckpointAdapterBoundaryContract, 'contract_digest'> {
  const { contract_digest: _, ...unsigned } = value;
  return unsigned;
}

function push(errors: string[], condition: boolean, reason: string): void {
  if (!condition && !errors.includes(reason)) errors.push(reason);
}

function sameCanonical(left: unknown, right: unknown): boolean {
  return canonical(left) === canonical(right);
}

function validateNativeContractPin(value: unknown): string[] {
  if (!isRecord(value) || !exactKeys(value, NATIVE_CONTRACT_KEYS)) return ['native-contract-pin-invalid'];
  if (!semver(value.core_version) || value.contract_revision !== NATIVE_CHECKPOINT_ADAPTER_CONTRACT_REVISION ||
      value.input_schema !== NATIVE_CHECKPOINT_ADAPTER_INPUT_SCHEMA || value.output_schema !== NATIVE_CHECKPOINT_ADAPTER_OUTPUT_SCHEMA ||
      value.fixture_schema !== NATIVE_CHECKPOINT_FIXTURE_SCHEMA || value.oracle_schema !== NATIVE_CHECKPOINT_RESUME_ORACLE_SCHEMA) {
    return ['native-contract-pin-invalid'];
  }
  return [];
}

function validateProviderDependency(value: unknown): string[] {
  if (!isRecord(value) || !exactKeys(value, PROVIDER_DEPENDENCY_KEYS)) return ['provider-dependency-pin-invalid'];
  if (!id(value.provider_id) || !id(value.package_name) || !semver(value.package_version) || !id(value.checkpoint_schema) || !digest(value.artifact_digest)) {
    return ['provider-dependency-pin-invalid'];
  }
  return [];
}

function validateExitBoundary(value: unknown): string[] {
  if (!isRecord(value) || !exactKeys(value, EXIT_BOUNDARY_KEYS)) return ['adapter-exit-boundary-invalid'];
  if (!isRecord(value.authority) || !exactKeys(value.authority, AUTHORITY_KEYS) || !sameCanonical(value, NATIVE_CHECKPOINT_ADAPTER_EXIT_BOUNDARY)) {
    return ['adapter-exit-boundary-invalid'];
  }
  return [];
}

function validateBoundaryShape(value: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(value) || !exactKeys(value, CONTRACT_KEYS)) return ['adapter-boundary-field-invalid'];
  push(errors, value.schema === NATIVE_CHECKPOINT_ADAPTER_BOUNDARY_SCHEMA, 'adapter-boundary-schema-invalid');
  push(errors, id(value.adapter_id) && semver(value.adapter_version), 'adapter-boundary-identity-invalid');
  errors.push(...validateNativeContractPin(value.native_contract));
  errors.push(...validateProviderDependency(value.provider_dependency));
  errors.push(...validateExitBoundary(value.exit_boundary));
  push(errors, digest(value.contract_digest), 'adapter-boundary-digest-invalid');
  if (digest(value.contract_digest)) {
    push(errors, value.contract_digest === calculateDigest(withoutContractDigest(value as NativeCheckpointAdapterBoundaryContract)), 'adapter-boundary-digest-mismatch');
  }
  return [...new Set(errors)];
}

function freezeContract(value: NativeCheckpointAdapterBoundaryContract): NativeCheckpointAdapterBoundaryContract {
  return Object.freeze({
    ...value,
    native_contract: Object.freeze({ ...value.native_contract }),
    provider_dependency: Object.freeze({ ...value.provider_dependency }),
    exit_boundary: Object.freeze({
      ...value.exit_boundary,
      authority: Object.freeze({ ...value.exit_boundary.authority }),
    }),
  });
}

export function nativeCheckpointAdapterBoundaryDigest(value: NativeCheckpointAdapterBoundaryContract): string {
  return calculateDigest(withoutContractDigest(value));
}

export function createNativeCheckpointAdapterBoundaryContract(input: Omit<NativeCheckpointAdapterBoundaryContract, 'schema' | 'contract_digest'>): NativeCheckpointAdapterBoundaryContract {
  const unsigned = { schema: NATIVE_CHECKPOINT_ADAPTER_BOUNDARY_SCHEMA, ...structuredClone(input) } as Omit<NativeCheckpointAdapterBoundaryContract, 'contract_digest'>;
  const value = freezeContract({ ...unsigned, contract_digest: calculateDigest(unsigned) });
  const validation = validateNativeCheckpointAdapterBoundaryContract(value);
  if (validation.status !== 'valid') throw new Error(validation.errors[0]);
  return value;
}

export function validateNativeCheckpointAdapterBoundaryContract(value: unknown): NativeCheckpointAdapterBoundaryValidation {
  const errors = validateBoundaryShape(value);
  return errors.length > 0 ? { status: 'blocked', errors } : { status: 'valid', contract: value as NativeCheckpointAdapterBoundaryContract };
}

export function validateNativeCheckpointAdapterCompatibility(input: {
  contract: NativeCheckpointAdapterBoundaryContract;
  expected: NativeCheckpointAdapterCompatibilityExpectation;
}): NativeCheckpointAdapterCompatibilityValidation {
  const errors: string[] = [];
  const contractValidation = validateNativeCheckpointAdapterBoundaryContract(input.contract);
  if (contractValidation.status === 'blocked') return contractValidation;
  const { contract } = contractValidation;
  push(errors, contract.adapter_id === input.expected.adapter_id, 'adapter-id-skew');
  push(errors, contract.adapter_version === input.expected.adapter_version, 'adapter-version-skew');
  push(errors, contract.native_contract.core_version === input.expected.core_version, 'native-core-version-skew');
  push(errors, contract.native_contract.contract_revision === NATIVE_CHECKPOINT_ADAPTER_CONTRACT_REVISION, 'native-contract-revision-skew');
  const actualProvider = contract.provider_dependency;
  const expectedProvider = input.expected.provider_dependency;
  push(errors, actualProvider.provider_id === expectedProvider.provider_id, 'provider-id-skew');
  push(errors, actualProvider.package_name === expectedProvider.package_name, 'provider-package-skew');
  push(errors, actualProvider.package_version === expectedProvider.package_version, 'provider-version-skew');
  push(errors, actualProvider.checkpoint_schema === expectedProvider.checkpoint_schema, 'provider-checkpoint-schema-skew');
  push(errors, actualProvider.artifact_digest === expectedProvider.artifact_digest, 'provider-artifact-digest-skew');
  return errors.length > 0 ? { status: 'blocked', errors } : { status: 'valid' };
}

function blockedExit(reason: Extract<NativeCheckpointAdapterExitDecision, { status: 'blocked' }>['reason'], nativeFallbackAvailable: boolean): NativeCheckpointAdapterExitDecision {
  return {
    status: 'blocked',
    action: nativeFallbackAvailable ? 'use-native-fallback' : 'stop',
    reason: nativeFallbackAvailable ? reason : 'native-fallback-unavailable',
    native_fallback_required: true,
    side_effects_executed: false,
  };
}

export function evaluateNativeCheckpointAdapterExit(input: NativeCheckpointAdapterExitObservation): NativeCheckpointAdapterExitDecision {
  if (!isRecord(input) || typeof input.dependency_available !== 'boolean' ||
      !['matched', 'skewed'].includes(input.compatibility) || !['matched', 'drifted'].includes(input.contract_digest) ||
      !['preserved', 'lossy'].includes(input.state_translation) || !['passed', 'failed'].includes(input.conformance) ||
      typeof input.native_fallback_available !== 'boolean') {
    return blockedExit('contract-digest-drift', false);
  }
  if (!input.dependency_available) return blockedExit('dependency-missing', input.native_fallback_available);
  if (input.compatibility === 'skewed') return blockedExit('version-skew', input.native_fallback_available);
  if (input.contract_digest === 'drifted') return blockedExit('contract-digest-drift', input.native_fallback_available);
  if (input.state_translation === 'lossy') return blockedExit('state-translation-loss', input.native_fallback_available);
  if (input.conformance === 'failed') {
    if (!input.native_fallback_available) return blockedExit('native-fallback-unavailable', false);
    return {
      status: 'retire',
      action: 'remove-and-rerun-native',
      reason: 'conformance-failure',
      native_fallback_required: true,
      side_effects_executed: false,
    };
  }
  if (!input.native_fallback_available) return blockedExit('native-fallback-unavailable', false);
  return {
    status: 'ready',
    action: 'continue',
    reason: null,
    native_fallback_required: true,
    side_effects_executed: false,
  };
}
