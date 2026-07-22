import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { checkVersionConsistency, generatedFileHash } from '../dist/version-consistency.js';

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

test('version consistency accepts a matching generated file and lock', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'zj-loop-version-lock-'));
  try {
    const content = '# zj-loop-generated: true\n# zj-loop-template-hash: generated-by-zj-loop-init\nrun: npx --package @jununfly/zj-loop-core@0.1.16 zj-loop-route status\n';
    await mkdir(path.join(root, 'zj-loop'), { recursive: true });
    await writeFile(path.join(root, 'zj-loop', 'version-lock.json'), JSON.stringify({
      schema: 'zj-loop.version-lock.v1',
      core: { package: '@jununfly/zj-loop-core', version: '0.1.16', source: '@jununfly/zj-loop-core@0.1.16' },
      generated_files: { 'workflow.yml': { path: 'workflow.yml', sha256: sha256(content), template_hash: generatedFileHash(content) } },
    }));
    await writeFile(path.join(root, 'workflow.yml'), content);
    const result = await checkVersionConsistency({ root, provider: 'github' });
    assert.equal(result.status, 'healthy');
    assert.equal(result.side_effects_executed, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('version consistency blocks generated file drift', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'zj-loop-version-drift-'));
  try {
    const expected = 'run: npx --package @jununfly/zj-loop-core@0.1.16 zj-loop-route status\n';
    await mkdir(path.join(root, 'zj-loop'), { recursive: true });
    await writeFile(path.join(root, 'zj-loop', 'version-lock.json'), JSON.stringify({
      schema: 'zj-loop.version-lock.v1',
      core: { package: '@jununfly/zj-loop-core', version: '0.1.16', source: '@jununfly/zj-loop-core@0.1.16' },
      generated_files: { 'workflow.yml': { path: 'workflow.yml', sha256: sha256(expected) } },
    }));
    await writeFile(path.join(root, 'workflow.yml'), 'run: npx --package @jununfly/zj-loop-core@0.1.8 zj-loop-route status\n');
    const result = await checkVersionConsistency({ root });
    assert.equal(result.status, 'blocked');
    assert.equal(result.reason, 'version-drift');
    assert.equal(result.side_effects_executed, false);
    assert.ok(result.errors.some((error) => error.includes('generated file drift')));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
