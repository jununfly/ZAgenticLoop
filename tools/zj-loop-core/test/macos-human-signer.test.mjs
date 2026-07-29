import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createMacOSKeychainHumanSigner } from '../dist/macos-keychain-human-signer.js';
import { verifyHumanSignature } from '../dist/human-signer.js';

const isMacOS = process.platform === 'darwin';

async function compileHelper() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-macos-signer-'));
  const binary = path.join(root, 'human-signer');
  const source = path.resolve('native/macos-human-signer.swift');
  execFileSync('swiftc', ['-O', '-framework', 'Security', '-framework', 'CryptoKit', source, '-o', binary], { stdio: 'ignore' });
  return { root, binary };
}

test('macOS Keychain HumanSigner keeps P-256 private material inside SecKey and signs through the helper', { skip: !isMacOS }, async () => {
  const helper = await compileHelper();
  const tag = `zj-loop-test-${randomUUID()}`;
  try {
    const signer = createMacOSKeychainHumanSigner({ human_id: 'human-1', key_tag: tag, helper_path: helper.binary });
    const identity = await signer.getPublicIdentity();
    const payload = new TextEncoder().encode('keychain-approval-context');
    const signature = await signer.sign({ payload });
    assert.equal(identity.algorithm, 'ECDSA-P256');
    assert.equal(identity.public_key_fingerprint, signature.public_key_fingerprint);
    assert.equal(await verifyHumanSignature({ identity, payload, signature }), true);
    assert.equal(await verifyHumanSignature({ identity, payload: new TextEncoder().encode('tampered'), signature }), false);
  } finally {
    try { execFileSync(helper.binary, ['delete', tag], { stdio: 'ignore' }); } catch { /* cleanup is best effort after test failure */ }
    await rm(helper.root, { recursive: true, force: true });
  }
});
