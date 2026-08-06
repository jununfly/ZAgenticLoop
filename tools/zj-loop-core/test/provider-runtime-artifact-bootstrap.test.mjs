import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { bootstrapProviderRuntimeArtifact } from '../dist/provider-runtime-artifact-bootstrap.js';

const digest = (value) => `sha256:${Buffer.from(value).toString('hex').padEnd(64, '0').slice(0, 64)}`;
const baseConfig = (root) => ({ schema: 'zj-loop.provider_runtime_start_config.v1', network_id: 'network-1', runtime_id: 'runtime-1', provider_ids: ['agent-1'], socket_path: path.join(root, 'runtime.sock'), correlation_id: 'correlation-1', expected_peer_identity_digest: 'a'.repeat(64), provider_executable: '/usr/bin/agent', working_directory: root, contract_digest: digest('contract'), adapter_contract_digest: digest('adapter'), runtime_binding: { runtime_identity_fingerprint: digest('identity'), runtime_manifest_digest: digest('placeholder'), provider_capabilities_digest: digest('capabilities') }, state_store_path: path.join(root, 'state.db'), binding_path: path.join(root, 'binding.json') });

const inspect = async () => ({ identifier: 'dev.runtime', team_id: null, code_directory_hash: 'a'.repeat(20), kind: 'ad-hoc', notarized: false });

test('bootstrap copies fixed artifacts and emits manifest, pending challenge, and start config', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-runtime-bootstrap-'));
  const runtimeSource = path.join(root, 'node');
  const helperSource = path.join(root, 'helper');
  await writeFile(runtimeSource, 'runtime-v1');
  await writeFile(helperSource, 'helper-v1');
  const result = await bootstrapProviderRuntimeArtifact({ source_runtime_path: runtimeSource, source_helper_path: helperSource, artifact_root: path.join(root, 'artifacts'), base_config: baseConfig(root), platform: 'linux', inspect_signature: inspect, now: () => '2026-08-06T12:00:00.000Z' });
  assert.equal(result.status, 'prepared');
  assert.equal(result.challenge.status, 'pending');
  assert.equal(result.manifest.profile, 'development-local');
  assert.equal(result.start_config.artifact_manifest_path, result.manifest_path);
  assert.equal(result.start_config.runtime_artifact_path, result.runtime_artifact_path);
  assert.equal(result.start_config.helper_artifact_path, result.helper_artifact_path);
  assert.equal(result.start_config.runtime_binding.runtime_manifest_digest, result.manifest.manifest_digest);
  assert.equal(await readFile(result.runtime_artifact_path, 'utf8'), 'runtime-v1');
  assert.equal(await readFile(result.helper_artifact_path, 'utf8'), 'helper-v1');
  await rm(root, { recursive: true, force: true });
});

test('bootstrap is digest-idempotent and creates a new artifact after source drift', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-runtime-bootstrap-idempotent-'));
  const runtimeSource = path.join(root, 'node');
  const helperSource = path.join(root, 'helper');
  await writeFile(runtimeSource, 'runtime-v1');
  await writeFile(helperSource, 'helper-v1');
  const input = { source_runtime_path: runtimeSource, source_helper_path: helperSource, artifact_root: path.join(root, 'artifacts'), base_config: baseConfig(root), platform: 'linux', inspect_signature: inspect, now: () => '2026-08-06T12:00:00.000Z' };
  const first = await bootstrapProviderRuntimeArtifact(input);
  const second = await bootstrapProviderRuntimeArtifact(input);
  assert.equal(second.manifest.manifest_digest, first.manifest.manifest_digest);
  assert.equal(second.artifact_path, first.artifact_path);
  await writeFile(runtimeSource, 'runtime-v2');
  const third = await bootstrapProviderRuntimeArtifact(input);
  assert.notEqual(third.manifest.manifest_digest, first.manifest.manifest_digest);
  assert.notEqual(third.artifact_path, first.artifact_path);
  await rm(root, { recursive: true, force: true });
});
