import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import canonicalize from 'canonicalize';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runProviderRuntimeCli } from '../dist/provider-runtime-cli.js';
import { createProviderRuntimeArtifactManifest } from '../dist/provider-runtime-artifact-manifest.js';
import { createInMemoryHumanSigner } from '../dist/human-signer.js';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';
import { createHumanAuthoritySetInitializationFromStore, recordHumanAuthoritySetInitialization } from '../dist/human-authority-set-store.js';
import { readProviderRuntimeArtifactApproval } from '../dist/provider-runtime-artifact-approval-store.js';

const binding = { service_id: 'service-cli', pid: 42, socket_path: '/tmp/runtime.sock' };
function io() { const output = []; return { output, io: { stdout: (value) => output.push(JSON.parse(value)), stderr: () => {} } }; }

test('Provider Runtime CLI status is read-only and returns the lifecycle projection', async () => {
  const capture = io();
  const code = await runProviderRuntimeCli(['status', '--binding', '/tmp/binding.json', '--json'], capture.io, {
    read_binding: async () => binding,
    lifecycle: { status: async () => ({ status: 'ready', service_id: 'service-cli', pid: 42, socket_path: '/tmp/runtime.sock' }), stop: async () => ({ status: 'stopped', service_id: 'service-cli', pid: 42 }) },
  });
  assert.equal(code, 0);
  assert.deepEqual(capture.output[0], { schema: 'zj-loop.provider_runtime_cli.v1', status: 'ready', service_id: 'service-cli', pid: 42, socket_path: '/tmp/runtime.sock', side_effects_executed: false });
});

test('Provider Runtime CLI stop remains blocked when process identity is unavailable', async () => {
  const capture = io();
  let terminated = false;
  const code = await runProviderRuntimeCli(['stop', '--binding', '/tmp/binding.json', '--json'], capture.io, {
    read_binding: async () => binding,
    lifecycle: { status: async () => ({ status: 'outcome-uncertain', service_id: 'service-cli', pid: 42, socket_path: '/tmp/runtime.sock' }), stop: async () => ({ status: 'blocked', reason: 'provider-runtime-process-identity-unavailable' }) },
    terminate: async () => { terminated = true; },
  });
  assert.equal(code, 2);
  assert.equal(terminated, false);
  assert.deepEqual(capture.output[0], { schema: 'zj-loop.provider_runtime_cli.v1', status: 'blocked', reason: 'provider-runtime-process-identity-unavailable', side_effects_executed: false });
});

test('Provider Runtime CLI does not claim start before foreground bootstrap is configured', async () => {
  const capture = io();
  const code = await runProviderRuntimeCli(['start', '--binding', '/tmp/binding.json', '--json'], capture.io, { read_binding: async () => binding });
  assert.equal(code, 2);
  assert.deepEqual(capture.output[0], { schema: 'zj-loop.provider_runtime_cli.v1', status: 'blocked', reason: 'provider-runtime-start-config-required', side_effects_executed: false });
});

test('Provider Runtime CLI start delegates to the verified foreground StartAssembly', async () => {
  const capture = io();
  const config = { schema: 'zj-loop.provider_runtime_start_config.v1', network_id: 'network-1', runtime_id: 'runtime-1' };
  let started = false;
  const code = await runProviderRuntimeCli(['start', '--config', '/tmp/start-config.json', '--process-identity-digest', `sha256:${'a'.repeat(64)}`, '--json'], capture.io, {
    read_start_config: async () => config,
    create_start_assembly: () => ({ service: { start: async () => { started = true; return { status: 'started', binding: { service_id: 'runtime-1', pid: 42 } }; }, stop: async () => ({ status: 'stopped' }) }, runtime: {}, state_store: {}, close: async () => {} }),
  });
  assert.equal(code, 0);
  assert.equal(started, true);
  assert.deepEqual(capture.output[0], { schema: 'zj-loop.provider_runtime_cli.v1', status: 'started', binding: { service_id: 'runtime-1', pid: 42 }, side_effects_executed: false });
});

test('Provider Runtime CLI bootstrap returns a prepared artifact and Human approval next action', async () => {
  const capture = io();
  const config = { schema: 'zj-loop.provider_runtime_start_config.v1', network_id: 'network-1' };
  const code = await runProviderRuntimeCli(['bootstrap', '--runtime-source', '/tmp/node', '--helper-source', '/tmp/helper', '--artifact-root', '/tmp/artifacts', '--config', '/tmp/base-config.json', '--json'], capture.io, {
    read_start_config: async () => config,
    bootstrap: async () => ({ status: 'prepared', side_effects_executed: false, artifact_path: '/tmp/artifacts/runtime-1', runtime_artifact_path: '/tmp/artifacts/runtime-1/runtime', helper_artifact_path: '/tmp/artifacts/runtime-1/helper', manifest_path: '/tmp/artifacts/runtime-1/manifest.json', challenge_path: '/tmp/artifacts/runtime-1/approval-challenge.json', start_config_path: '/tmp/artifacts/runtime-1/start-config.json', manifest: { manifest_digest: 'sha256:' + 'a'.repeat(64) }, challenge: { challenge_digest: 'sha256:' + 'b'.repeat(64) }, start_config: config }),
  });
  assert.equal(code, 0);
  assert.deepEqual(capture.output[0], { schema: 'zj-loop.provider_runtime_cli.v1', status: 'prepared', side_effects_executed: false, artifact_path: '/tmp/artifacts/runtime-1', manifest_path: '/tmp/artifacts/runtime-1/manifest.json', manifest_digest: 'sha256:' + 'a'.repeat(64), challenge_path: '/tmp/artifacts/runtime-1/approval-challenge.json', challenge_digest: 'sha256:' + 'b'.repeat(64), start_config_path: '/tmp/artifacts/runtime-1/start-config.json', next_action: 'human-approve' });
});

test('Provider Runtime CLI approve accepts only a challenge-bound manifest and records the Human fact', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-provider-runtime-cli-approve-'));
  const signer = createInMemoryHumanSigner({ human_id: 'human-cli' });
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  try {
    const manifest = createProviderRuntimeArtifactManifest({ artifact_id: 'runtime-cli', profile: 'development-local', platform: 'linux', runtime_artifact_digest: `sha256:${'a'.repeat(64)}`, helper_artifact_digest: `sha256:${'b'.repeat(64)}`, runtime_code_directory_hash: 'a'.repeat(20), helper_code_directory_hash: 'b'.repeat(20), signing: { kind: 'ad-hoc', identifier: 'development-local', team_id: null, notarized: false }, version: 'runtime-cli', created_at: '2026-08-06T16:00:00.000Z' });
    const unsignedChallenge = { schema: 'zj-loop.provider_runtime_artifact_approval_challenge.v1', challenge_id: 'challenge-cli', status: 'pending', network_id: 'network-cli', node_id: 'node-cli', device_id: 'device-cli', artifact_id: manifest.artifact_id, manifest_digest: manifest.manifest_digest, artifact_profile: manifest.profile, platform: manifest.platform, created_at: '2026-08-06T16:00:01.000Z' };
    const challenge = { ...unsignedChallenge, challenge_digest: `sha256:${createHash('sha256').update(canonicalize(unsignedChallenge), 'utf8').digest('hex')}` };
    await writeFile(path.join(root, 'manifest.json'), `${JSON.stringify(manifest)}\n`);
    await writeFile(path.join(root, 'challenge.json'), `${JSON.stringify(challenge)}\n`);
    await stateStore.createNetwork({ network_id: 'network-cli', owner_id: 'human-cli', now: '2026-08-06T16:00:00.000Z' });
    const init = await createHumanAuthoritySetInitializationFromStore({ stateStore, signer, network_id: 'network-cli', mutation_id: 'authority-cli', expected_revision: 1, reason: 'test', occurred_at: '2026-08-06T16:00:01.000Z' });
    assert.equal(init.status, 'ready');
    await recordHumanAuthoritySetInitialization({ stateStore, initialization: init.initialization });
    await stateStore.close();
    const capture = io();
    const code = await runProviderRuntimeCli(['approve', '--challenge', path.join(root, 'challenge.json'), '--manifest', path.join(root, 'manifest.json'), '--state-store', path.join(root, 'state.db'), '--human-id', 'human-cli', '--key-tag', 'fixture', '--helper-path', '/tmp/helper', '--json'], capture.io, { create_signer: () => signer });
    assert.equal(code, 0);
    assert.equal(capture.output[0].status, 'recorded');
    const reopened = createSqliteStateStore({ filename: path.join(root, 'state.db') });
    const resolved = await readProviderRuntimeArtifactApproval({ stateStore: reopened, expected: { network_id: 'network-cli', node_id: 'node-cli', device_id: 'device-cli', manifest }, now: '2026-08-06T16:00:02.000Z' });
    assert.equal(resolved.status, 'valid');
    await reopened.close();
  } finally { await stateStore.close().catch(() => undefined); await rm(root, { recursive: true, force: true }); }
});
