import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPublicKey, verify } from 'node:crypto';
import { createInMemoryHumanSigner, verifyHumanSignature } from '../dist/human-signer.js';

function readDerInteger(bytes, offset) {
  assert.equal(bytes[offset], 0x02);
  const length = bytes[offset + 1];
  const value = bytes.subarray(offset + 2, offset + 2 + length);
  return { value: BigInt(`0x${Buffer.from(value).toString('hex')}`), next: offset + 2 + length };
}

function assertCanonicalLowS(signatureBase64) {
  const bytes = Buffer.from(signatureBase64, 'base64');
  assert.equal(bytes[0], 0x30);
  assert.equal(bytes[1], bytes.length - 2);
  const r = readDerInteger(bytes, 2);
  const s = readDerInteger(bytes, r.next);
  const order = BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551');
  assert.equal(s.next, bytes.length);
  assert.ok(r.value > 0n && r.value < order);
  assert.ok(s.value > 0n && s.value <= order / 2n);
}

function derInteger(value) {
  let hex = value.toString(16);
  if (hex.length % 2) hex = `0${hex}`;
  if (Number.parseInt(hex.slice(0, 2), 16) >= 0x80) hex = `00${hex}`;
  const bytes = Buffer.from(hex, 'hex');
  return Buffer.concat([Buffer.from([0x02, bytes.length]), bytes]);
}

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
  assertCanonicalLowS(signature.signature_base64);
  assert.equal(verify('sha256', payload, createPublicKey(identity.public_key_pem), Buffer.from(signature.signature_base64, 'base64')), true);
  assert.equal(await verifyHumanSignature({ identity, payload, signature }), true);
});

test('HumanSigner payload bytes provide domain separation between approval contexts', async () => {
  const signer = createInMemoryHumanSigner({ human_id: 'human-1' });
  const identity = await signer.getPublicIdentity();
  const approval = new TextEncoder().encode('ZJ-LOOP/HUMAN-AUTHORITY/V2\\0approval');
  const otherProtocol = new TextEncoder().encode('ZJ-LOOP/OTHER-PROTOCOL/V1\\0approval');
  const signature = await signer.sign({ payload: approval });

  assert.equal(await verifyHumanSignature({ identity, payload: approval, signature }), true);
  assert.equal(await verifyHumanSignature({ identity, payload: otherProtocol, signature }), false);
});

test('HumanSigner rejects an otherwise valid high-S ECDSA signature', async () => {
  const signer = createInMemoryHumanSigner({ human_id: 'human-1' });
  const identity = await signer.getPublicIdentity();
  const payload = new TextEncoder().encode('approval');
  const signature = await signer.sign({ payload });
  const bytes = Buffer.from(signature.signature_base64, 'base64');
  const r = readDerInteger(bytes, 2);
  const s = readDerInteger(bytes, r.next);
  const order = BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551');
  const highS = derInteger(order - s.value);
  const highSDer = Buffer.concat([Buffer.from([0x30, 2 + r.next - 4 + highS.length]), bytes.subarray(2, r.next), highS]);

  assert.equal(await verifyHumanSignature({ identity, payload, signature: { ...signature, signature_base64: highSDer.toString('base64') } }), false);
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
