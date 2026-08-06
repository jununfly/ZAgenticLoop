import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createProviderRuntimeArtifactManifest } from '../dist/provider-runtime-artifact-manifest.js';
import { createProviderRuntimeArtifactVerifier } from '../dist/provider-runtime-artifact-verifier.js';

const digestBytes = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const digest = (value) => digestBytes(Buffer.from(value));

test('development Runtime artifact verifier reads the manifest and checks actual artifact digests', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-runtime-artifacts-'));
  const runtime = Buffer.from('runtime-binary');
  const helper = Buffer.from('helper-binary');
  const runtimePath = path.join(root, 'runtime');
  const helperPath = path.join(root, 'helper');
  const manifestPath = path.join(root, 'manifest.json');
  await writeFile(runtimePath, runtime);
  await writeFile(helperPath, helper);
  const manifest = createProviderRuntimeArtifactManifest({ artifact_id: 'artifact-1', profile: 'development-local', platform: 'linux', runtime_artifact_digest: digestBytes(runtime), helper_artifact_digest: digestBytes(helper), runtime_code_directory_hash: 'a'.repeat(40), helper_code_directory_hash: 'b'.repeat(40), signing: { kind: 'ad-hoc', identifier: 'dev.runtime', team_id: null, notarized: false }, version: 'dev.1', created_at: '2026-08-06T12:00:00.000Z' });
  await writeFile(manifestPath, JSON.stringify(manifest));
  const verifier = createProviderRuntimeArtifactVerifier({ manifest_path: manifestPath, runtime_artifact_path: runtimePath, helper_artifact_path: helperPath, platform: 'linux' });
  assert.equal((await verifier.verify()).status, 'verified');
  await writeFile(runtimePath, 'runtime-drift');
  assert.equal((await verifier.verify()).reason, 'provider-runtime-artifact-digest-mismatch');
  await rm(root, { recursive: true, force: true });
});

test('macOS artifact verifier requires both files to match signed metadata', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-runtime-signature-'));
  const runtime = Buffer.from('runtime-binary');
  const helper = Buffer.from('helper-binary');
  const runtimePath = path.join(root, 'runtime');
  const helperPath = path.join(root, 'helper');
  const manifestPath = path.join(root, 'manifest.json');
  await writeFile(runtimePath, runtime);
  await writeFile(helperPath, helper);
  const manifest = createProviderRuntimeArtifactManifest({ artifact_id: 'artifact-2', profile: 'development-local', platform: 'darwin', runtime_artifact_digest: digestBytes(runtime), helper_artifact_digest: digestBytes(helper), runtime_code_directory_hash: 'a'.repeat(40), helper_code_directory_hash: 'b'.repeat(40), signing: { kind: 'ad-hoc', identifier: 'dev.runtime', team_id: null, notarized: false }, version: 'dev.1', created_at: '2026-08-06T12:00:00.000Z' });
  await writeFile(manifestPath, JSON.stringify(manifest));
  const inspect = async (filePath) => ({ identifier: 'dev.runtime', team_id: null, code_directory_hash: filePath === runtimePath ? 'a'.repeat(40) : 'b'.repeat(40), kind: 'ad-hoc', notarized: false });
  const verifier = createProviderRuntimeArtifactVerifier({ manifest_path: manifestPath, runtime_artifact_path: runtimePath, helper_artifact_path: helperPath, platform: 'darwin', inspect_signature: inspect });
  assert.equal((await verifier.verify()).status, 'verified');
  const blocked = createProviderRuntimeArtifactVerifier({ manifest_path: manifestPath, runtime_artifact_path: runtimePath, helper_artifact_path: helperPath, platform: 'darwin', inspect_signature: async () => ({ identifier: 'other.runtime', team_id: null, code_directory_hash: 'a'.repeat(40), kind: 'ad-hoc', notarized: false }) });
  assert.equal((await blocked.verify()).reason, 'provider-runtime-artifact-signature-mismatch');
  await rm(root, { recursive: true, force: true });
});
