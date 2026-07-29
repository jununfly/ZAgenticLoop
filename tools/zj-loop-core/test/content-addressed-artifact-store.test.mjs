import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createContentAddressedArtifactStore } from '../dist/content-addressed-artifact-store.js';

test('content-addressed ArtifactStore records immutable bytes and deduplicates identical retries', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-artifacts-'));
  const store = createContentAddressedArtifactStore({ root });
  try {
    const content = new TextEncoder().encode('{"result":"passed"}');
    const first = await store.putArtifact({ network_id: 'network-1', content, content_type: 'application/json', now: '2026-07-29T02:00:00.000Z' });
    const retry = await store.putArtifact({ network_id: 'network-1', content, content_type: 'application/json', now: '2026-07-29T02:01:00.000Z' });
    assert.equal(first.status, 'recorded');
    assert.equal(retry.status, 'duplicate');
    assert.deepEqual(retry.metadata, first.metadata);
    const read = await store.readArtifact({ network_id: 'network-1', artifact_id: first.metadata.artifact_id });
    assert.deepEqual([...read.content], [...content]);
    assert.equal(read.metadata.content_sha256, first.metadata.content_sha256);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('content-addressed ArtifactStore rejects cross-network access, invalid ids, and tampered bytes', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-artifacts-'));
  const store = createContentAddressedArtifactStore({ root });
  try {
    const first = await store.putArtifact({ network_id: 'network-1', content: new TextEncoder().encode('immutable'), content_type: 'text/plain' });
    await assert.rejects(() => store.readArtifact({ network_id: 'network-2', artifact_id: first.metadata.artifact_id }), { message: 'artifact-network-mismatch' });
    await assert.rejects(() => store.readArtifact({ network_id: 'network-1', artifact_id: 'bad' }), { message: 'artifact-id-invalid' });
    const contentPath = path.join(root, 'sha256', first.metadata.content_sha256.slice(0, 2), first.metadata.content_sha256);
    await writeFile(contentPath, 'tampered');
    await assert.rejects(() => store.readArtifact({ network_id: 'network-1', artifact_id: first.metadata.artifact_id }), { message: 'artifact-integrity-failed' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
