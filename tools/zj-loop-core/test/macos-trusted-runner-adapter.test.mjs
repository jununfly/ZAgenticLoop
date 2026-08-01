import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import {
  createMacOSTrustedRunnerAdapter,
  macosTrustedRunnerRegistryDigest,
} from '../dist/macos-trusted-runner-adapter.js';
import { macosEnvironmentPolicyDigests } from '../dist/trusted-environment-proof.js';

const isMacOS = process.platform === 'darwin';
const digest = (digit) => `sha256:${digit.repeat(64)}`;
const environment = { cwd: process.cwd(), network_policy: { mode: 'network-denied' }, sandbox_policy: '(version 1) (deny network*) (allow process*) (allow file-read*)', env_allowlist: ['PATH', 'LANG'], env: { PATH: '/usr/bin', LANG: 'C' } };

async function compileHelper() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-macos-trusted-adapter-'));
  const binary = path.join(root, 'trusted-runner');
  execFileSync('swiftc', ['-O', '-framework', 'CryptoKit', '-framework', 'Security', path.resolve('native/macos-trusted-runner.swift'), '-o', binary], { stdio: 'ignore' });
  return { root, binary };
}

function request(binary, value) {
  return JSON.parse(execFileSync(binary, { input: `${JSON.stringify(value)}\n`, encoding: 'utf8' }).trim());
}

test('MacOSTrustedRunner adapter accepts a signed observation from an active registry runner', { skip: !isMacOS }, async () => {
  const helper = await compileHelper();
  const key_tag = `zj-loop-adapter-${randomUUID()}`;
  try {
    const runner_id = 'runner-adapter-fixture';
    const first = request(helper.binary, {
      schema: 'zj-loop.macos_trusted_runner_request.v1', key_tag, runner_id, execution_id: 'bootstrap', attempt: 1,
      preflight_digest: digest('1'), proof_digest: digest('2'), registry_snapshot_digest: digest('3'), network_policy: { mode: 'network-denied', policy_digest: macosEnvironmentPolicyDigests(environment).policy_digest },
      argv: ['/bin/echo', 'adapter-output'], timeout_ms: 2_000, termination_grace_ms: 100,
      ...environment, ...macosEnvironmentPolicyDigests(environment), network_policy: { mode: environment.network_policy.mode, policy_digest: macosEnvironmentPolicyDigests(environment).policy_digest },
    });
    const entries = [{ runner_id, public_key_fingerprint: first.signature.public_key_fingerprint, status: 'active' }];
    const registry = { revision: 1, entries, digest: macosTrustedRunnerRegistryDigest(entries) };
    const execution = { runner_id, execution_id: 'execution-adapter-1', attempt: 1, preflight_digest: digest('4'), proof_digest: digest('5'), registry_snapshot_digest: registry.digest, network_policy: { mode: 'network-denied', policy_digest: macosEnvironmentPolicyDigests(environment).policy_digest } };
    const helperBytes = await readFile(helper.binary);
    const adapter = createMacOSTrustedRunnerAdapter({ helper_path: helper.binary, helper_digest: `sha256:${createHash('sha256').update(helperBytes).digest('hex')}`, registry });
    const result = await adapter.run({ key_tag, execution, argv: ['/bin/echo', 'adapter-output'], environment, timeout_ms: 2_000, termination_grace_ms: 100 });

    assert.equal(result.status, 'accepted');
    assert.equal(result.observation?.execution_id, execution.execution_id);
    assert.equal(result.observation?.stdout, 'adapter-output\n');
    assert.equal(result.observation?.environment_proof.proof_stage, 'pre-launch');
    assert.equal(result.observation?.environment_proof.network_policy.status, 'proved');
    assert.equal(result.observation?.environment_proof.credentials.status, 'clean');
  } finally {
    try { request(helper.binary, { command: 'delete', key_tag }); } catch { /* cleanup is best effort after test failure */ }
    await rm(helper.root, { recursive: true, force: true });
  }
});

test('MacOSTrustedRunner adapter blocks network-allowing or credential-bearing policy before helper spawn', { skip: !isMacOS }, async () => {
  const adapter = createMacOSTrustedRunnerAdapter({
    helper_path: '/bin/echo',
    helper_digest: digest('f'),
    registry: { revision: 1, entries: [], digest: macosTrustedRunnerRegistryDigest([]) },
  });
  const result = await adapter.run({
    key_tag: 'unused',
    execution: { runner_id: 'runner-1', execution_id: 'execution-unsafe-environment', attempt: 1, preflight_digest: digest('1'), proof_digest: digest('2'), registry_snapshot_digest: macosTrustedRunnerRegistryDigest([]), network_policy: { mode: 'network-denied', policy_digest: digest('3') } },
    argv: ['/bin/echo', 'unused'],
    environment: { cwd: process.cwd(), network_policy: { mode: 'network-denied' }, sandbox_policy: '(version 1) (allow default)', env_allowlist: ['GITLAB_TOKEN'], env: { GITLAB_TOKEN: 'secret' } },
    timeout_ms: 100,
    termination_grace_ms: 50,
  });

  assert.deepEqual(result, { status: 'blocked', reasons: ['credential-env-key-forbidden', 'network-policy-sandbox-mismatch'] });
});

test('MacOSTrustedRunner adapter blocks helper digest drift before spawn', { skip: !isMacOS }, async () => {
  const adapter = createMacOSTrustedRunnerAdapter({
    helper_path: '/bin/echo',
    helper_digest: digest('f'),
    registry: { revision: 1, entries: [], digest: macosTrustedRunnerRegistryDigest([]) },
  });
  const result = await adapter.run({
    key_tag: 'unused',
    execution: { runner_id: 'runner-1', execution_id: 'execution-1', attempt: 1, preflight_digest: digest('1'), proof_digest: digest('2'), registry_snapshot_digest: macosTrustedRunnerRegistryDigest([]), network_policy: { mode: 'network-denied', policy_digest: digest('3') } },
    argv: ['/bin/echo', 'unused'],
    environment,
    timeout_ms: 100,
    termination_grace_ms: 50,
  });

  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.reasons, ['macos-trusted-runner-helper-digest-invalid']);
});
