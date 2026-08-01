import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, createPublicKey, verify } from 'node:crypto';
import canonicalize from 'canonicalize';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';

const isMacOS = process.platform === 'darwin';
const environment = { cwd: process.cwd(), sandbox_policy: '(version 1) (deny network*) (allow process*) (allow file-read*)', env_allowlist: ['PATH', 'LANG'], env: { PATH: '/usr/bin:/bin', LANG: 'C' } };
const policyDigests = { sandbox_policy_digest: `sha256:${createHash('sha256').update(environment.sandbox_policy).digest('hex')}`, env_policy_digest: `sha256:${createHash('sha256').update('LANG=C\nPATH=/usr/bin:/bin').digest('hex')}` };

async function compileHelper() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-macos-trusted-runner-'));
  const binary = path.join(root, 'trusted-runner');
  const source = path.resolve('native/macos-trusted-runner.swift');
  execFileSync('swiftc', ['-O', '-framework', 'CryptoKit', '-framework', 'Security', source, '-o', binary], { stdio: 'ignore' });
  return { root, binary };
}

function run(binary, request) {
  const output = execFileSync(binary, { input: `${JSON.stringify(request)}\n`, encoding: 'utf8' });
  return JSON.parse(output.trim());
}

test('macOS TrustedRunner proves a normal descendant tree is terminated', { skip: !isMacOS }, async () => {
  const helper = await compileHelper();
  const key_tag = `zj-loop-runner-test-${randomUUID()}`;
  try {
    const result = run(helper.binary, {
      schema: 'zj-loop.macos_trusted_runner_request.v1',
      key_tag,
      runner_id: 'runner-macos-fixture',
      execution_id: 'execution-macos-fixture-1',
      attempt: 1,
      preflight_digest: `sha256:${'1'.repeat(64)}`,
      proof_digest: `sha256:${'2'.repeat(64)}`,
      registry_snapshot_digest: `sha256:${'3'.repeat(64)}`,
      argv: ['/bin/sh', '-c', 'printf child-output; sleep 0.1 & wait'],
      ...environment, ...policyDigests,
      timeout_ms: 2_000,
      termination_grace_ms: 100,
    });

    assert.equal(result.schema, 'zj-loop.macos_trusted_runner_observation.v1');
    assert.equal(result.status, 'completed');
    assert.equal(result.process_boundary.kind, 'process-group');
    assert.equal(result.process_boundary.all_descendants_terminated, true);
    assert.equal(result.process_boundary.orphan_processes_detected, false);
    assert.equal(result.process_boundary.unknown_descendants_detected, false);
    assert.match(result.stdout_digest, /^sha256:[0-9a-f]{64}$/);
    assert.equal(result.stdout, 'child-output');
    const { signature, ...unsigned } = result;
    const canonical = canonicalize(unsigned);
    assert.equal(typeof canonical, 'string');
    const publicKey = createPublicKey(signature.public_key_pem);
    assert.equal(createHash('sha256').update(publicKey.export({ type: 'spki', format: 'der' })).digest('hex'), signature.public_key_fingerprint);
    assert.equal(verify('sha256', Buffer.from(canonical), publicKey, Buffer.from(signature.signature_base64, 'base64')), true);
  } finally {
    try { run(helper.binary, { command: 'delete', key_tag }); } catch { /* cleanup is best effort after test failure */ }
    await rm(helper.root, { recursive: true, force: true });
  }
});

test('macOS TrustedRunner terminates a timed-out descendant tree before claiming the boundary', { skip: !isMacOS }, async () => {
  const helper = await compileHelper();
  const key_tag = `zj-loop-runner-timeout-${randomUUID()}`;
  try {
    const result = run(helper.binary, {
      schema: 'zj-loop.macos_trusted_runner_request.v1',
      key_tag,
      runner_id: 'runner-macos-fixture',
      execution_id: 'execution-macos-fixture-2',
      attempt: 1,
      preflight_digest: `sha256:${'4'.repeat(64)}`,
      proof_digest: `sha256:${'5'.repeat(64)}`,
      registry_snapshot_digest: `sha256:${'6'.repeat(64)}`,
      argv: ['/bin/sh', '-c', 'sleep 5 & wait'],
      ...environment, ...policyDigests,
      timeout_ms: 50,
      termination_grace_ms: 100,
    });

    assert.equal(result.status, 'timed-out');
    assert.equal(result.process_boundary.all_descendants_terminated, true);
    assert.equal(result.process_boundary.orphan_processes_detected, false);
    assert.equal(result.process_boundary.unknown_descendants_detected, false);
  } finally {
    try { run(helper.binary, { command: 'delete', key_tag }); } catch { /* cleanup is best effort after test failure */ }
    await rm(helper.root, { recursive: true, force: true });
  }
});
