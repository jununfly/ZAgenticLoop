import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPublicKey, verify } from 'node:crypto';
import { createInMemoryHumanSigner, verifyHumanSignature } from '../dist/human-signer.js';

test('HumanSigner exposes only a stable public identity and signs arbitrary approval payloads', async () => {
  const signer = createInMemoryHumanSigner({ human_id: 'human-1' });
  const identity = await signer.getPublicIdentity();
  const payload = new TextEncoder().encode('pairing.approve:pair-1:request-digest');
  const signature = await signer.sign({ payload });

  assert.equal(identity.schema, 'zj-loop.human_signer.v1');
  assert.equal(identity.human_id, 'human-1');
  assert.equal(identity.algorithm, 'ECDSA-P256');
  assert.match(identity.public_key_fingerprint, /^[0-9a-f]{64}$/);
  assert.equal('private_key_pem' in identity, false);
  assert.equal(signature.algorithm, 'ECDSA-P256');
  assert.equal(signature.public_key_fingerprint, identity.public_key_fingerprint);
  assert.equal(verify('sha256', payload, createPublicKey(identity.public_key_pem), Buffer.from(signature.signature_base64, 'base64')), true);
  assert.equal(await verifyHumanSignature({ identity, payload, signature }), true);
});

test('HumanSigner verification fails closed for payload, identity, and signature changes', async () => {
  const signer = createInMemoryHumanSigner({ human_id: 'human-1' });
  const identity = await signer.getPublicIdentity();
  const payload = new TextEncoder().encode('approval-context');
  const signature = await signer.sign({ payload });

  assert.equal(await verifyHumanSignature({ identity, payload: new TextEncoder().encode('tampered'), signature }), false);
  assert.equal(await verifyHumanSignature({ identity: { ...identity, public_key_fingerprint: '0'.repeat(64) }, payload, signature }), false);
  assert.equal(await verifyHumanSignature({ identity, payload, signature: { ...signature, signature_base64: Buffer.from('bad').toString('base64') } }), false);
});

test('HumanSigner rejects an empty human identity', () => {
  assert.throws(() => createInMemoryHumanSigner({ human_id: ' ' }), { message: 'human-id-required' });
});
