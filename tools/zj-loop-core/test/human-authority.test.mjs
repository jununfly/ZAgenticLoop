import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPublicKey, verify } from 'node:crypto';
import { createInMemoryHumanAuthorityProvider } from '../dist/human-authority.js';

test('Human authority fixture derives a stable identity and signs approval context without exposing the private key', async () => {
  const authority = createInMemoryHumanAuthorityProvider({ human_id: 'human-1' });
  const identity = authority.getPublicIdentity();
  const signature = await authority.signApprovalContext({ action: 'pairing.approve', request_id: 'pair-1', request_digest: 'a'.repeat(64) });
  assert.equal(identity.human_id, 'human-1');
  assert.equal(identity.algorithm, 'Ed25519');
  assert.match(identity.public_key_fingerprint, /^[0-9a-f]{64}$/);
  assert.equal('private_key_pem' in identity, false);
  assert.equal(signature.human_id, identity.human_id);
  assert.equal(signature.public_key_fingerprint, identity.public_key_fingerprint);
  assert.equal(verify(null, Buffer.from(signature.payload_digest, 'utf8'), createPublicKey(identity.public_key_pem), Buffer.from(signature.signature_base64, 'base64')), true);
});

test('Human authority fixture rotates recovery material and never returns the previous secret', async () => {
  const authority = createInMemoryHumanAuthorityProvider({ human_id: 'human-1' });
  const first = await authority.createRecoveryMaterial();
  const rotated = await authority.rotateRecoveryMaterial();
  assert.notEqual(first.public_identifier, rotated.public_identifier);
  assert.notEqual(first.secret, rotated.secret);
  assert.equal(await authority.verifyRecoveryMaterial(first.secret), false);
  assert.equal(await authority.verifyRecoveryMaterial(rotated.secret), true);
});
