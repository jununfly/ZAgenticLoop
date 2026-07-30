import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPublicKey, verify, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createInMemoryHumanAuthorityProvider, canonicalizeHumanAuthorityV1, humanAuthorityV2SigningPayload, verifyHumanApprovalContext, verifyHumanApprovalContextDetailed } from '../dist/human-authority.js';

const v1Vector = {
  action: 'credential.issue', request_id: 'request-1', request_digest: 'a'.repeat(64),
  approved_capabilities: ['event.append', 'event.consume'], human_id: 'human-1',
  issued_at: '2026-07-30T00:00:00.000Z', expires_at: '2026-07-30T00:05:00.000Z',
};

test('legacy v1 canonicalization matches the frozen known-answer vector', async () => {
  const metadata = JSON.parse(await readFile(new URL('./fixtures/canonicalization/v1-human-authority.json', import.meta.url), 'utf8'));
  const canonical = canonicalizeHumanAuthorityV1(v1Vector);
  const inputBytes = await readFile(new URL(`./fixtures/canonicalization/${metadata.input_path}`, import.meta.url));
  assert.equal(`sha256:${createHash('sha256').update(inputBytes).digest('hex')}`, metadata.input_sha256);
  assert.deepEqual(Buffer.from(canonical), Buffer.from(metadata.canonical_utf8, 'utf8'));
  assert.equal(canonical.byteLength, metadata.canonical_length);
  assert.equal(`sha256:${createHash('sha256').update(canonical).digest('hex')}`, metadata.canonical_sha256);
});

test('v2 canonicalization and domain-separated signing payload match the frozen vector', () => {
  const payload = humanAuthorityV2SigningPayload({ action: 'credential.issue', request_id: '00000000-0000-4000-8000-000000000001', request_digest: 'a'.repeat(64), approved_capabilities: ['event.append', 'event.consume'], human_id: 'human-1', issued_at: '2026-07-30T00:00:00.000Z', expires_at: '2026-07-30T00:05:00.000Z', network_id: 'network-1', device_key_id: 'device-key-1', device_fingerprint: 'b'.repeat(64) });
  assert.equal(new TextDecoder().decode(payload.canonical), '{"action":"credential.issue","approved_capabilities":["event.append","event.consume"],"canonicalization":"jcs-rfc8785","canonicalization_profile":"approval-v2-default-2026-07","device_fingerprint":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","device_key_id":"device-key-1","expires_at":"2026-07-30T00:05:00.000Z","human_id":"human-1","issued_at":"2026-07-30T00:00:00.000Z","network_id":"network-1","profile_sha256":"sha256:58e6aa7c8ca695ad771ed8ca63ab6e68cf3d88d053146c2744ef12a150aada66","request_digest":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","request_id":"00000000-0000-4000-8000-000000000001"}');
  assert.deepEqual(Buffer.from(payload.signing_payload), Buffer.concat([Buffer.from('ZJ-LOOP/HUMAN-AUTHORITY/V2\0'), Buffer.from(payload.canonical)]));
  assert.equal(payload.payload_digest, 'sha256:4729beb74a68c288129a26a06474b83782f27271a41ef1af314ce369b47406e5');
  assert.equal(payload.profile_sha256, 'sha256:58e6aa7c8ca695ad771ed8ca63ab6e68cf3d88d053146c2744ef12a150aada66');
});

test('v2 vector metadata matches the frozen canonical output and hashes', async () => {
  const metadata = JSON.parse(await readFile(new URL('./fixtures/canonicalization/v2-human-authority.json', import.meta.url), 'utf8'));
  const payload = humanAuthorityV2SigningPayload({ action: 'credential.issue', request_id: '00000000-0000-4000-8000-000000000001', request_digest: 'a'.repeat(64), approved_capabilities: ['event.append', 'event.consume'], human_id: 'human-1', issued_at: '2026-07-30T00:00:00.000Z', expires_at: '2026-07-30T00:05:00.000Z', network_id: 'network-1', device_key_id: 'device-key-1', device_fingerprint: 'b'.repeat(64) });
  const inputBytes = await readFile(new URL(`./fixtures/canonicalization/${metadata.input_path}`, import.meta.url));
  assert.equal(`sha256:${createHash('sha256').update(inputBytes).digest('hex')}`, metadata.input_sha256);
  assert.equal(new TextDecoder().decode(payload.canonical), metadata.canonical_utf8);
  assert.equal(payload.canonical.byteLength, metadata.canonical_length);
  assert.equal(payload.payload_digest, metadata.digest);
  assert.equal(payload.profile_sha256, metadata.profile_sha256);
});

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
  assert.equal(verifyHumanApprovalContextDetailed({ identity, context: signature, now: signature.issued_at }).status, 'accepted');
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

test('Human authority v2 binds network and device identity into the signed context', async () => {
  const authority = createInMemoryHumanAuthorityProvider({ human_id: 'human-1', protocol_version: 'v2' });
  const identity = authority.getPublicIdentity();
  const context = await authority.signApprovalContext({ action: 'credential.issue', request_id: 'issue-1', request_digest: 'a'.repeat(64), network_id: 'network-1', device_key_id: 'device-key-1', device_fingerprint: 'b'.repeat(64), approved_capabilities: ['event.append'], issued_at: '2026-07-30T00:00:00.000Z', expires_at: '2026-07-30T00:05:00.000Z' });
  assert.equal(identity.schema, 'zj-loop.human_authority.v2');
  assert.equal(context.schema, 'zj-loop.human_authority.v2');
  assert.equal(context.network_id, 'network-1');
  assert.equal(context.device_key_id, 'device-key-1');
  assert.equal(context.device_fingerprint, 'b'.repeat(64));
  assert.equal(context.canonicalization, 'jcs-rfc8785');
  assert.equal(context.canonicalization_profile, 'approval-v2-default-2026-07');
  assert.match(context.profile_sha256, /^sha256:[0-9a-f]{64}$/);
  assert.equal(verifyHumanApprovalContext({ identity, context, now: context.issued_at, require_v2: true }), true);
  assert.equal(verifyHumanApprovalContextDetailed({ identity, context, now: context.issued_at, require_v2: true }).status, 'current-v2-accepted');
  assert.equal(verifyHumanApprovalContext({ identity, context: { ...context, device_fingerprint: 'c'.repeat(64) }, now: context.issued_at, require_v2: true }), false);
  assert.equal(verifyHumanApprovalContext({ identity, context: { ...context, profile_sha256: 'sha256:' + '0'.repeat(64) }, now: context.issued_at, require_v2: true }), false);
  assert.equal(verifyHumanApprovalContext({ identity, context, now: context.issued_at }), true);
});

test('high-risk verification rejects historical v1 approval contexts', async () => {
  const authority = createInMemoryHumanAuthorityProvider({ human_id: 'human-1' });
  const identity = authority.getPublicIdentity();
  const context = await authority.signApprovalContext({ action: 'credential.issue', request_id: 'issue-1', request_digest: 'a'.repeat(64) });
  assert.equal(verifyHumanApprovalContext({ identity, context, now: context.issued_at, require_v2: true }), false);
});
