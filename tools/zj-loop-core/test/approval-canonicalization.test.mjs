import { test } from 'node:test';
import assert from 'node:assert/strict';
import { approvalDigest, approvalProfileSha256, canonicalizeApproval } from '../dist/approval-canonicalization.js';

test('approval canonicalization produces deterministic JCS UTF-8 bytes and digest', () => {
  const value = { z: 'last', nested: { b: true, a: '张骏' }, a: 'first', list: ['b', 'a'] };
  const bytes = canonicalizeApproval(value);
  assert.equal(new TextDecoder().decode(bytes), '{"a":"first","list":["b","a"],"nested":{"a":"张骏","b":true},"z":"last"}');
  assert.equal(approvalDigest(value), 'sha256:facef1f277d97f2ec2c7082c73182577ee4b3b92fa3bc01522455bdb061850ae');
});

test('approval canonicalization rejects runtime objects and malformed values', () => {
  assert.throws(() => canonicalizeApproval(new Date()), { message: 'approval-canonicalization-invalid' });
  assert.throws(() => canonicalizeApproval({ get value() { return 1; } }), { message: 'approval-canonicalization-invalid' });
  const sparse = [];
  sparse.length = 1;
  assert.throws(() => canonicalizeApproval(sparse), { message: 'approval-canonicalization-invalid' });
  assert.throws(() => canonicalizeApproval({ value: NaN }), { message: 'approval-canonicalization-invalid' });
});

test('approval profile hash is stable and explicit', () => {
  assert.match(approvalProfileSha256(), /^sha256:[0-9a-f]{64}$/);
});
