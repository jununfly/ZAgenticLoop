import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createOpnArtifactStore } from '../dist/opn-artifact-store.js';

test('ArtifactStore content-addresses bounded bytes and verifies them on read', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-opn-artifact-'));
  try {
    const store = createOpnArtifactStore({ root, max_bytes: 32 });
    const first = await store.put({ bytes: Buffer.from('hello'), file_name: 'hello.txt', media_type: 'text/plain' });
    assert.equal(first.status, 'stored');
    assert.match(first.metadata.artifact_id, /^sha256:[0-9a-f]{64}$/);
    assert.deepEqual((await store.read(first.metadata.artifact_id)).bytes, Buffer.from('hello'));
    assert.equal((await store.put({ bytes: Buffer.from('hello'), file_name: 'other.txt' })).status, 'duplicate');
    assert.equal(await store.has(first.metadata.artifact_id), true);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('ArtifactStore rejects over-limit and digest-mismatched content before persistence', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-opn-artifact-'));
  try {
    const store = createOpnArtifactStore({ root, max_bytes: 4 });
    await assert.rejects(store.put({ bytes: Buffer.from('12345'), file_name: 'x.bin' }), /opn-artifact-too-large/);
    await assert.rejects(store.put({ bytes: Buffer.from('x'), file_name: 'x.bin', expected_digest: `sha256:${'0'.repeat(64)}` }), /opn-artifact-digest-mismatch/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
