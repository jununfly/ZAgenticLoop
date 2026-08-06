import test from 'node:test';
import assert from 'node:assert/strict';
import { createProviderRuntimeArtifactManifest, providerRuntimeArtifactManifestDigest, validateProviderRuntimeArtifactManifest } from '../dist/provider-runtime-artifact-manifest.js';

const digest = (value) => `sha256:${Buffer.from(value).toString('hex').padEnd(64, '0').slice(0, 64)}`;
const base = {
  artifact_id: 'runtime-dev-2026-08-06',
  profile: 'development-local',
  platform: 'darwin',
  runtime_artifact_digest: digest('runtime'),
  helper_artifact_digest: digest('helper'),
  runtime_code_directory_hash: 'a'.repeat(40),
  helper_code_directory_hash: 'b'.repeat(40),
  signing: { kind: 'ad-hoc', identifier: 'com.zagenticloop.dev.runtime', team_id: null, notarized: false },
  version: '0.1.0-dev.1',
  created_at: '2026-08-06T12:00:00.000Z',
};

test('development-local manifest is content-addressed and validates its ad-hoc trust policy', () => {
  const manifest = createProviderRuntimeArtifactManifest(base);
  assert.equal(validateProviderRuntimeArtifactManifest(manifest, { profile: 'development-local' }).status, 'valid');
  assert.equal(providerRuntimeArtifactManifestDigest(manifest), manifest.manifest_digest);
});

test('development-local validation rejects production or unsigned identity claims', () => {
  const manifest = createProviderRuntimeArtifactManifest(base);
  const productionClaim = { ...manifest, profile: 'development-local', signing: { ...manifest.signing, kind: 'developer-id', team_id: 'TEAM123', notarized: true } };
  assert.equal(validateProviderRuntimeArtifactManifest(productionClaim).status, 'blocked');
  assert.equal(validateProviderRuntimeArtifactManifest({ ...manifest, runtime_artifact_digest: digest('different') }).status, 'blocked');
});

test('production validation requires Developer ID identity and notarization', () => {
  const manifest = createProviderRuntimeArtifactManifest({ ...base, profile: 'production', signing: { kind: 'developer-id', identifier: 'com.zagenticloop.runtime', team_id: 'TEAM123', notarized: true } });
  assert.equal(validateProviderRuntimeArtifactManifest(manifest, { profile: 'production' }).status, 'valid');
  const local = createProviderRuntimeArtifactManifest(base);
  assert.equal(validateProviderRuntimeArtifactManifest(local, { profile: 'production' }).status, 'blocked');
});

test('manifest accepts the 20-character CDHash emitted by macOS codesign', () => {
  const manifest = createProviderRuntimeArtifactManifest({ ...base, runtime_code_directory_hash: 'a'.repeat(20), helper_code_directory_hash: 'b'.repeat(20) });
  assert.equal(validateProviderRuntimeArtifactManifest(manifest).status, 'valid');
});
