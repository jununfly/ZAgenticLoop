import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createPemFileHumanSigner } from '../dist/pem-file-human-signer.js';
import { verifyHumanSignature } from '../dist/human-signer.js';

test('PEM file Human signer is cross-platform and emits verifiable low-S ECDSA signatures', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-pem-signer-'));
  try {
    const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const keyPath = path.join(root, 'human-signer.key.pem');
    await writeFile(keyPath, keys.privateKey.export({ type: 'pkcs8', format: 'pem' }));
    const signer = createPemFileHumanSigner({ human_id: 'human-1', private_key_path: keyPath });
    const identity = await signer.getPublicIdentity();
    const signature = await signer.sign({ payload: new TextEncoder().encode('approval') });
    assert.equal(verifyHumanSignature({ identity, payload: new TextEncoder().encode('approval'), signature }), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
