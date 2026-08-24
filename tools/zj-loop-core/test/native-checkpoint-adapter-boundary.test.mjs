import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createNativeCheckpointAdapterBoundaryContract,
  evaluateNativeCheckpointAdapterExit,
  nativeCheckpointAdapterBoundaryDigest,
  NATIVE_CHECKPOINT_ADAPTER_EXIT_BOUNDARY,
  validateNativeCheckpointAdapterBoundaryContract,
  validateNativeCheckpointAdapterCompatibility,
} from '../dist/native-checkpoint-adapter-boundary.js';

const digest = (digit) => `sha256:${digit.repeat(64)}`;

function providerDependency(version = '1.0.0', artifact = digest('1')) {
  return {
    provider_id: 'checkpoint-provider-langgraph',
    package_name: '@langchain/langgraph-checkpoint',
    package_version: version,
    checkpoint_schema: 'provider.checkpoint.v1',
    artifact_digest: artifact,
  };
}

function boundary(overrides = {}) {
  return createNativeCheckpointAdapterBoundaryContract({
    adapter_id: 'checkpoint-adapter-langgraph',
    adapter_version: '0.1.0',
    native_contract: {
      core_version: '0.1.34',
      contract_revision: 1,
      input_schema: 'zj-loop.native_checkpoint_adapter_input.v1',
      output_schema: 'zj-loop.native_checkpoint_adapter_output.v1',
      fixture_schema: 'zj-loop.native_checkpoint_fixture.v1',
      oracle_schema: 'zj-loop.native_checkpoint_resume_oracle.v1',
    },
    provider_dependency: providerDependency(),
    exit_boundary: NATIVE_CHECKPOINT_ADAPTER_EXIT_BOUNDARY,
    ...overrides,
  });
}

function readyObservation(overrides = {}) {
  return {
    dependency_available: true,
    compatibility: 'matched',
    contract_digest: 'matched',
    state_translation: 'preserved',
    conformance: 'passed',
    native_fallback_available: true,
    ...overrides,
  };
}

test('boundary contract pins native schemas, provider dependency, and immutable exit policy', () => {
  const value = boundary();
  assert.equal(value.schema, 'zj-loop.native_checkpoint_adapter_boundary.v1');
  assert.equal(value.native_contract.contract_revision, 1);
  assert.equal(value.native_contract.core_version, '0.1.34');
  assert.equal(value.provider_dependency.package_version, '1.0.0');
  assert.equal(value.provider_dependency.artifact_digest, digest('1'));
  assert.deepEqual(value.exit_boundary, NATIVE_CHECKPOINT_ADAPTER_EXIT_BOUNDARY);
  assert.equal(nativeCheckpointAdapterBoundaryDigest(value), value.contract_digest);
  assert.equal(validateNativeCheckpointAdapterBoundaryContract(value).status, 'valid');
  assert.equal(Object.isFrozen(value), true);
  assert.equal(Object.isFrozen(value.native_contract), true);
  assert.equal(Object.isFrozen(value.provider_dependency), true);
});

test('exact compatibility passes and version or provider artifact skew blocks', () => {
  const value = boundary();
  const expected = {
    adapter_id: 'checkpoint-adapter-langgraph',
    adapter_version: '0.1.0',
    core_version: '0.1.34',
    provider_dependency: providerDependency(),
  };
  assert.deepEqual(validateNativeCheckpointAdapterCompatibility({ contract: value, expected }), { status: 'valid' });

  const providerSkew = boundary({ provider_dependency: providerDependency('1.1.0', digest('2')) });
  const result = validateNativeCheckpointAdapterCompatibility({ contract: providerSkew, expected });
  assert.equal(result.status, 'blocked');
  assert.ok(result.errors.includes('provider-version-skew'));
  assert.ok(result.errors.includes('provider-artifact-digest-skew'));
});

test('contract digest or exit policy drift is rejected before compatibility evaluation', () => {
  const value = boundary();
  assert.equal(validateNativeCheckpointAdapterBoundaryContract({ ...value, contract_digest: digest('f') }).status, 'blocked');
  assert.equal(validateNativeCheckpointAdapterBoundaryContract({
    ...value,
    exit_boundary: { ...value.exit_boundary, native_fallback: 'optional' },
  }).status, 'blocked');
});

test('exit evaluator is ready only when dependency, compatibility, translation, conformance, and fallback all hold', () => {
  assert.deepEqual(evaluateNativeCheckpointAdapterExit(readyObservation()), {
    status: 'ready',
    action: 'continue',
    reason: null,
    native_fallback_required: true,
    side_effects_executed: false,
  });
});

test('dependency absence, version skew, digest drift, and lossy translation block to native fallback', () => {
  for (const [field, expectedReason] of [
    ['dependency_available', 'dependency-missing'],
    ['compatibility', 'version-skew'],
    ['contract_digest', 'contract-digest-drift'],
    ['state_translation', 'state-translation-loss'],
  ]) {
    const observation = { ...readyObservation(), [field]: field === 'dependency_available' ? false : field === 'compatibility' ? 'skewed' : field === 'contract_digest' ? 'drifted' : 'lossy' };
    const result = evaluateNativeCheckpointAdapterExit(observation);
    assert.deepEqual(result, {
      status: 'blocked',
      action: 'use-native-fallback',
      reason: expectedReason,
      native_fallback_required: true,
      side_effects_executed: false,
    });
  }
});

test('conformance failure retires the adapter and reruns the native fixture', () => {
  assert.deepEqual(evaluateNativeCheckpointAdapterExit(readyObservation({ conformance: 'failed' })), {
    status: 'retire',
    action: 'remove-and-rerun-native',
    reason: 'conformance-failure',
    native_fallback_required: true,
    side_effects_executed: false,
  });
});

test('missing native fallback blocks rather than silently continuing or claiming removal complete', () => {
  assert.deepEqual(evaluateNativeCheckpointAdapterExit(readyObservation({ native_fallback_available: false })), {
    status: 'blocked',
    action: 'stop',
    reason: 'native-fallback-unavailable',
    native_fallback_required: true,
    side_effects_executed: false,
  });
  assert.deepEqual(evaluateNativeCheckpointAdapterExit(readyObservation({ conformance: 'failed', native_fallback_available: false })), {
    status: 'blocked',
    action: 'stop',
    reason: 'native-fallback-unavailable',
    native_fallback_required: true,
    side_effects_executed: false,
  });
});
