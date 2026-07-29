import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPublicKey, verify } from 'node:crypto';
import { createInMemoryHumanAuthorityProvider, verifyHumanApprovalContext } from '../dist/human-authority.js';

test('Human authority fixture derives a stable identity and signs approval context without exposing the private key', async () => {
  const authority = createInMemoryHumanAuthorityProvider({ human_id: 'human-1' });
  const identity = authority.getPublicIdentity();
  const signature = await authority.signApprovalContext({ action: 'pairing.approve', request_id: 'pair-1', request_digest: 'a'.repeat(64), approved_capabilities: ['event.consume'] });
  assert.equal(identity.human_id, 'human-1');
  assert.equal(identity.algorithm, 'ECDSA-P256');
  assert.match(identity.public_key_fingerprint, /^[0-9a-f]{64}$/);
  assert.equal('private_key_pem' in identity, false);
  assert.equal(signature.human_id, identity.human_id);
  assert.equal(signature.public_key_fingerprint, identity.public_key_fingerprint);
  assert.deepEqual(signature.approved_capabilities, ['event.consume']);
  assert.equal(verify('sha256', Buffer.from(signature.payload_digest, 'utf8'), createPublicKey(identity.public_key_pem), Buffer.from(signature.signature_base64, 'base64')), true);
  assert.equal(verifyHumanApprovalContext({ identity, context: signature, now: signature.issued_at }), true);
  assert.equal(verifyHumanApprovalContext({ identity, context: { ...signature, approved_capabilities: ['artifact.read'] }, now: signature.issued_at }), false);
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
