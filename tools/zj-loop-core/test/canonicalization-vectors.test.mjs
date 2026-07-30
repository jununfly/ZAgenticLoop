import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadVector } from './fixtures/load-vector.mjs';
import { canonicalizeApproval } from '../dist/approval-canonicalization.js';
import { canonicalizeHumanAuthorityV1 } from '../dist/human-authority.js';

async function parseInput(vector) {
  return JSON.parse(Buffer.from(vector.inputBytes).toString('utf8'));
}

test('v1 canonicalization vector metadata is strict and internally consistent', async () => {
  const vector = await loadVector(new URL('./fixtures/canonicalization/v1-human-authority.json', import.meta.url));
  if (vector.metadata.protocol !== 'zj-loop.human_authority.v1') throw new Error('unexpected-vector-protocol');
  assert.deepEqual(Buffer.from(canonicalizeHumanAuthorityV1(await parseInput(vector))), vector.canonicalBytes);
});

test('v2 canonicalization vector metadata is strict and internally consistent', async () => {
  const vector = await loadVector(new URL('./fixtures/canonicalization/v2-human-authority.json', import.meta.url));
  if (vector.metadata.protocol !== 'zj-loop.human_authority.v2') throw new Error('unexpected-vector-protocol');
  const input = await parseInput(vector);
  assert.deepEqual(Buffer.from(canonicalizeApproval({
    action: input.action,
    approved_capabilities: [...new Set(input.approved_capabilities)].sort(),
    canonicalization: vector.metadata.canonicalization,
    canonicalization_profile: vector.metadata.canonicalization_profile,
    device_fingerprint: input.device_fingerprint,
    device_key_id: input.device_key_id,
    expires_at: input.expires_at,
    human_id: input.human_id,
    issued_at: input.issued_at,
    network_id: input.network_id,
    profile_sha256: vector.metadata.profile_sha256,
    request_digest: input.request_digest,
    request_id: input.request_id,
  })), vector.canonicalBytes);
});
