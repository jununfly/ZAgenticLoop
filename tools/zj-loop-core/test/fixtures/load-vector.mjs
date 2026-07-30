import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const COMMON_KEYS = new Set(['schema', 'protocol', 'canonicalization', 'input_path', 'canonical_path', 'input_sha256', 'canonical_length', 'canonical_sha256', 'digest', 'expected_status', 'canonical_utf8']);
const V1_KEYS = new Set([...COMMON_KEYS]);
const V2_KEYS = new Set([...COMMON_KEYS, 'canonicalization_profile', 'profile_sha256']);

function hash(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

export async function loadVector(url) {
  const metadata = JSON.parse(await readFile(url, 'utf8'));
  assert.equal(metadata.schema, 'zj-loop.canonicalization_vector.v1');
  assert.ok(metadata.protocol === 'zj-loop.human_authority.v1' || metadata.protocol === 'zj-loop.human_authority.v2');
  assert.equal(typeof metadata.input_path, 'string');
  assert.match(metadata.input_path, /^[A-Za-z0-9._-]+$/);
  assert.equal(metadata.canonical_path, null);
  assert.match(metadata.input_sha256, /^sha256:[0-9a-f]{64}$/);
  assert.equal(Number.isInteger(metadata.canonical_length), true);
  assert.ok(metadata.canonical_length >= 0);
  assert.match(metadata.canonical_sha256, /^sha256:[0-9a-f]{64}$/);
  assert.match(metadata.digest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(metadata.expected_status, 'passed');
  const allowed = metadata.protocol === 'zj-loop.human_authority.v2' ? V2_KEYS : V1_KEYS;
  if (metadata.protocol === 'zj-loop.human_authority.v1') {
    assert.equal(metadata.canonicalization, 'legacy-human-authority-v1');
  } else {
    assert.equal(metadata.canonicalization, 'jcs-rfc8785');
    assert.equal(typeof metadata.canonicalization_profile, 'string');
    assert.match(metadata.canonicalization_profile, /^[A-Za-z0-9._-]+$/);
    assert.match(metadata.profile_sha256, /^sha256:[0-9a-f]{64}$/);
  }
  for (const key of Object.keys(metadata)) assert.equal(allowed.has(key), true, `unknown vector field: ${key}`);
  const inputBytes = await readFile(new URL(`./${metadata.input_path}`, url));
  assert.equal(typeof metadata.canonical_utf8, 'string');
  const canonicalBytes = Buffer.from(metadata.canonical_utf8, 'utf8');
  assert.equal(Buffer.from(metadata.canonical_utf8, 'utf8').toString('utf8'), metadata.canonical_utf8);
  assert.equal(hash(inputBytes), metadata.input_sha256);
  assert.equal(canonicalBytes.byteLength, metadata.canonical_length);
  assert.equal(hash(canonicalBytes), metadata.canonical_sha256);
  assert.equal(metadata.digest, metadata.canonical_sha256);
  return { metadata, inputBytes, canonicalBytes };
}
