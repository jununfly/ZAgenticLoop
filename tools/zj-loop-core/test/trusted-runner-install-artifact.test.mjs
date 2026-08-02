import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTrustedRunnerInstallArtifact, trustedRunnerCapabilityProfileDigest, trustedRunnerInstallArtifactDigest, validateTrustedRunnerInstallArtifact } from '../dist/trusted-runner-install-artifact.js';

const digest = (letter) => `sha256:${letter.repeat(64)}`;

function artifact() {
  return createTrustedRunnerInstallArtifact({
    artifact_id: 'install-artifact-1', platform: 'macos', runner_id: 'runner-macos-1', helper_path: '/Applications/ZAgenticLoop/trusted-runner', helper_digest: digest('a'), helper_version: 'macos-trusted-runner-1', toolchain: { name: 'swiftc', version: '6.0' }, key_tag: 'zj-loop-runner-1', public_key_pem: '-----BEGIN PUBLIC KEY-----\nfixture\n-----END PUBLIC KEY-----', public_key_fingerprint: 'b'.repeat(64), capability_profile: { version: 'macos-profile-1', capabilities: ['output-bounds', 'process-boundary'] }, verification: { status: 'verified', checked_at: '2026-08-02T12:00:00.000Z', evidence_digest: digest('c') },
  });
}

test('install artifact binds helper, toolchain, persistent key and capability profile without secrets', () => {
  const value = artifact();
  assert.equal(validateTrustedRunnerInstallArtifact(value).status, 'valid');
  assert.equal(value.capability_profile.profile_digest, trustedRunnerCapabilityProfileDigest(value.capability_profile));
  assert.equal(value.artifact_digest, trustedRunnerInstallArtifactDigest(value));
  assert.equal(JSON.stringify(value).includes('secret'), false);
});

test('install artifact blocks profile, helper and artifact digest drift', () => {
  const value = artifact();
  assert.deepEqual(validateTrustedRunnerInstallArtifact({ ...value, helper_digest: digest('d') }), { status: 'blocked', reason: 'trusted-runner-install-artifact-digest-mismatch' });
  assert.deepEqual(validateTrustedRunnerInstallArtifact({ ...value, capability_profile: { ...value.capability_profile, capabilities: ['secure-signing'] } }), { status: 'blocked', reason: 'trusted-runner-install-artifact-profile-digest-invalid' });
  assert.deepEqual(validateTrustedRunnerInstallArtifact({ ...value, artifact_digest: digest('e') }), { status: 'blocked', reason: 'trusted-runner-install-artifact-digest-mismatch' });
});
