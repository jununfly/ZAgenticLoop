import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAdmissionBoundExecution, createAdmissionBoundLocalExecutionPreflight, createAdmissionBoundTrustedRunnerExecutionContext } from '../dist/trusted-runner-admission-binding.js';
import { trustedRunnerCapabilitiesDigest } from '../dist/trusted-runner-registry.js';
import { providerAuthRefDigest } from '../dist/provider-auth-runtime.js';

const digest = (letter) => `sha256:${letter.repeat(64)}`;
const runtimeBinding = { runtime_identity_fingerprint: digest('6'), runtime_manifest_digest: digest('7'), provider_capabilities_digest: digest('8') };
const authRefUnsigned = { schema: 'zj-loop.provider_auth_ref.v1', auth_ref_id: 'auth-1', network_id: 'network-1', node_id: 'node-1', provider_runtime_id: 'provider-runtime-1', provider_id: 'provider-1', execution_id: 'execution-1', attempt: 1, issuer: 'provider-runtime-1', audience: 'model-api', scope: ['model:invoke'], issued_at: '2026-08-02T00:00:00.000Z', expires_at: '2026-08-02T01:00:00.000Z', status: 'active' };
const providerAuthRef = { ...authRefUnsigned, ref_digest: providerAuthRefDigest(authRefUnsigned) };

const binding = {
  network_id: 'network-1',
  runner_id: 'runner-1',
  registry_revision: 7,
  registry_snapshot_digest: digest('a'),
  required_capabilities: ['process-boundary'],
  capabilities: ['process-boundary', 'secure-signing'],
  capabilities_digest: trustedRunnerCapabilitiesDigest(['process-boundary', 'secure-signing']),
  provider_auth_ref: providerAuthRef,
  runtime_binding: runtimeBinding,
};

const preflightBase = {
  network_id: 'network-1',
  plan_id: 'plan-1',
  plan_revision: 1,
  task_id: 'task-1',
  execution_id: 'execution-1',
  attempt: 1,
  provider_id: 'provider-1',
  adapter_version: 'adapter-1',
  executable: '/bin/echo',
  executable_digest: digest('b'),
  args: ['hello'],
  argv_digest: digest('c'),
  cwd: '/tmp/worktree-1',
  cwd_digest: digest('d'),
  env_allowlist: [],
  env_policy_digest: digest('e'),
  sandbox_policy_digest: digest('f'),
  network_policy: { mode: 'network-denied', policy_digest: digest('1') },
  timeout_ms: 1000,
  termination_grace_ms: 100,
  max_stdout_bytes: 1024,
  max_stderr_bytes: 1024,
  orchestration_preflight_digest: digest('2'),
  issued_at: '2026-08-02T00:00:00.000Z',
  expires_at: '2026-08-02T01:00:00.000Z',
};

test('admission-bound builders inject one immutable binding into preflight and TrustedRunner context', () => {
  const preflight = createAdmissionBoundLocalExecutionPreflight({ preflight: preflightBase, binding });
  assert.equal(preflight.runner_id, binding.runner_id);
  assert.equal(preflight.registry_revision, binding.registry_revision);
  assert.equal(preflight.registry_snapshot_digest, binding.registry_snapshot_digest);
  assert.equal(preflight.capabilities_digest, binding.capabilities_digest);

  const execution = createAdmissionBoundTrustedRunnerExecutionContext({
    execution: {
      execution_id: preflight.execution_id,
      attempt: preflight.attempt,
      preflight_digest: preflight.preflight_digest,
      helper: { helper_id: 'helper-1', helper_version: '1', protocol_version: 'zj-loop.trusted_runner_protocol.v1', executable_digest: digest('3') },
    },
    binding,
  });
  assert.deepEqual(execution, {
    runner_id: binding.runner_id,
    registry_revision: binding.registry_revision,
    registry_snapshot_digest: binding.registry_snapshot_digest,
    capabilities_digest: binding.capabilities_digest,
    provider_auth_ref: providerAuthRef,
    execution_id: preflight.execution_id,
    attempt: preflight.attempt,
    preflight_digest: preflight.preflight_digest,
    helper: { helper_id: 'helper-1', helper_version: '1', protocol_version: 'zj-loop.trusted_runner_protocol.v1', executable_digest: digest('3') },
  });
});

test('admission-bound builders reject a capability digest that does not match the admitted capability set', () => {
  assert.throws(
    () => createAdmissionBoundLocalExecutionPreflight({ preflight: preflightBase, binding: { ...binding, capabilities_digest: digest('9') } }),
    /trusted-runner-admission-binding-capabilities-digest-invalid/,
  );
});

test('admission-bound builders reject a network provenance mismatch', () => {
  assert.throws(
    () => createAdmissionBoundLocalExecutionPreflight({ preflight: preflightBase, binding: { ...binding, network_id: 'network-other' } }),
    /trusted-runner-admission-binding-network-id-mismatch/,
  );
});

test('AdmissionBoundExecution derives the TrustedRunner context binding from the generated preflight', () => {
  const result = createAdmissionBoundExecution({
    preflight: preflightBase,
    execution: { helper: { helper_id: 'helper-1', helper_version: '1', protocol_version: 'zj-loop.trusted_runner_protocol.v1', executable_digest: digest('3') } },
    admission: { status: 'admitted', binding },
    runtime_binding: runtimeBinding,
  });

  assert.equal(result.execution.execution_id, result.preflight.execution_id);
  assert.equal(result.execution.attempt, result.preflight.attempt);
  assert.equal(result.execution.preflight_digest, result.preflight.preflight_digest);
  assert.equal(result.execution.runner_id, result.binding.runner_id);
  assert.equal(result.execution.registry_revision, result.binding.registry_revision);
  assert.equal(result.execution.capabilities_digest, result.binding.capabilities_digest);
});

test('AdmissionBoundExecution refuses a blocked admission before creating execution artifacts', () => {
  assert.throws(
    () => createAdmissionBoundExecution({
      preflight: preflightBase,
      execution: { helper: { helper_id: 'helper-1', helper_version: '1', protocol_version: 'zj-loop.trusted_runner_protocol.v1', executable_digest: digest('3') } },
      admission: { status: 'blocked', reason: 'registry-required-capability-missing' },
    }),
    /trusted-runner-admission-blocked/,
  );
});
