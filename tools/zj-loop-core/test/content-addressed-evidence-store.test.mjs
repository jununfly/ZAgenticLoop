import assert from 'node:assert/strict';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createContentAddressedEvidenceStore } from '../dist/content-addressed-evidence-store.js';

test('content-addressed EvidenceStore deduplicates, audits reads, and detects drift', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-evidence-'));
  try {
    const store = await createContentAddressedEvidenceStore({ root });
    const first = await store.put({ content: 'secret output', kind: 'provider-stdout' });
    const second = await store.put({ content: 'secret output', kind: 'provider-stderr' });
    assert.equal(first.digest, second.digest);
    assert.equal((await stat(first.path)).mode & 0o777, 0o600);
    assert.equal((await stat(root)).mode & 0o777, 0o700);
    assert.equal((await store.read({ digest: first.digest, actor: 'human-1' })).toString(), 'secret output');
    await assert.rejects(() => store.read({ digest: 'sha256:' + '0'.repeat(64), actor: 'human-1' }), { message: 'evidence-not-found' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
