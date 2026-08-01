import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createFakeTrustedEnvironmentProof,
  createMacOSSeatbeltPolicy,
  macosEnvironmentPolicyDigests,
  trustedEnvironmentProofDigest,
  trustedEnvironmentRegistryDigest,
  validateMacOSTrustedEnvironmentPolicy,
  verifyTrustedEnvironmentProof,
} from '../dist/trusted-environment-proof.js';

const digest = (digit) => `sha256:${digit.repeat(64)}`;

function fixture(mode = 'network-denied') {
  const execution = {
    execution_id: 'execution-environment-1',
    attempt: 1,
    preflight_digest: digest('1'),
    registry_snapshot_digest: digest('2'),
    argv_digest: digest('3'),
    cwd_digest: digest('4'),
    env_policy_digest: digest('5'),
    sandbox_policy_digest: digest('6'),
    network_policy: { mode, policy_digest: digest(mode === 'network-denied' ? '9' : 'a') },
  };
  const environment = createFakeTrustedEnvironmentProof({
    runner_id: 'runner-environment-fixture',
    execution,
    now: () => '2026-08-01T12:00:00.000Z',
    expires_in_ms: 300_000,
    network_policy_evidence_digest: digest('7'),
    credential_evidence_digest: digest('8'),
  });
  return { execution: environment.execution, proof: environment.proof, registry: environment.registry };
}

test('accepts signed pre-launch proofs for both coarse network policy modes', () => {
  const value = fixture();
  const result = verifyTrustedEnvironmentProof({ ...value, now: '2026-08-01T12:01:00.000Z' });
  assert.deepEqual(result, { status: 'accepted' });
  assert.deepEqual(verifyTrustedEnvironmentProof({ ...fixture('network-allowed'), now: '2026-08-01T12:01:00.000Z' }), { status: 'accepted' });
});

test('blocks when any environment fact is missing or policy digest drifts', () => {
  const value = fixture();
  value.proof.network_policy.status = 'blocked';
  assert.deepEqual(verifyTrustedEnvironmentProof({ ...value, now: '2026-08-01T12:01:00.000Z' }), { status: 'blocked', reasons: ['network-policy-proof-missing', 'trusted-environment-proof-digest-invalid'] });

  const drifted = fixture();
  drifted.execution.env_policy_digest = digest('f');
  assert.deepEqual(verifyTrustedEnvironmentProof({ ...drifted, now: '2026-08-01T12:01:00.000Z' }), { status: 'blocked', reasons: ['trusted-environment-proof-binding-mismatch'] });
});

test('blocks Agent self-report, expired proof, revoked runner, and registry drift', () => {
  const selfReport = fixture();
  selfReport.proof.proof_source = 'agent-self-report';
  assert.ok(verifyTrustedEnvironmentProof({ ...selfReport, now: '2026-08-01T12:01:00.000Z' }).reasons.includes('environment-proof-not-trusted'));

  const expired = fixture();
  expired.proof.expires_at = '2026-08-01T11:59:00.000Z';
  assert.ok(verifyTrustedEnvironmentProof({ ...expired, now: '2026-08-01T12:00:00.000Z' }).reasons.includes('trusted-environment-proof-expired'));

  const revoked = fixture();
  revoked.registry.entries[0].status = 'revoked';
  revoked.registry.digest = trustedEnvironmentRegistryDigest(revoked.registry.entries);
  assert.ok(verifyTrustedEnvironmentProof({ ...revoked, now: '2026-08-01T12:01:00.000Z' }).reasons.includes('trusted-runner-not-active'));

  const drifted = fixture();
  drifted.registry.digest = digest('f');
  assert.ok(verifyTrustedEnvironmentProof({ ...drifted, now: '2026-08-01T12:01:00.000Z' }).reasons.includes('trusted-runner-registry-snapshot-drift'));
});

test('builds and validates a deterministic macOS Seatbelt and credential-clean environment policy', () => {
  const environment = { env_allowlist: ['PATH', 'LANG'], env: { PATH: '/usr/bin', LANG: 'C' } };
  const policy = createMacOSSeatbeltPolicy('network-denied');
  const digests = macosEnvironmentPolicyDigests({ network_policy: { mode: 'network-denied' }, sandbox_policy: policy, ...environment });
  assert.equal(validateMacOSTrustedEnvironmentPolicy({ network_policy: { mode: 'network-denied' }, sandbox_policy: policy, ...environment }).status, 'accepted');
  assert.match(policy, /\(deny network\*\)/);
  const allowedPolicy = createMacOSSeatbeltPolicy('network-allowed');
  assert.equal(validateMacOSTrustedEnvironmentPolicy({ network_policy: { mode: 'network-allowed' }, sandbox_policy: allowedPolicy, ...environment }).status, 'accepted');
  assert.match(digests.sandbox_policy_digest, /^sha256:[0-9a-f]{64}$/);
  assert.match(digests.env_policy_digest, /^sha256:[0-9a-f]{64}$/);

  const unsafe = validateMacOSTrustedEnvironmentPolicy({
    network_policy: { mode: 'network-denied' },
    sandbox_policy: '(version 1) (allow default)',
    env_allowlist: ['GITLAB_TOKEN'],
    env: { GITLAB_TOKEN: 'secret' },
  });
  assert.deepEqual(unsafe, { status: 'blocked', reasons: ['credential-env-key-forbidden', 'network-policy-sandbox-mismatch'] });
});
