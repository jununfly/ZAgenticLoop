import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateGeneratedBundleReleaseGate } from './validate-generated-bundle-release-gate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('generated bundle release gate accepts every rendered GitLab fragment', async () => {
  const result = await validateGeneratedBundleReleaseGate();

  assert.equal(result.gitlabFragmentCount, 10);
});

test('generated bundle release gate rejects an invalid rendered bundled GitLab fragment', async () => {
  const fixture = await makeFixture();
  try {
    const bundledTemplate = path.join(fixture, 'tools', 'zj-loop-init', 'templates', 'gitlab-ci', 'zj-loop-smoke.yml');
    const body = await readFile(bundledTemplate, 'utf8');
    await writeFile(bundledTemplate, `${body}\ninvalid: [\n`);

    await assert.rejects(
      () => validateGeneratedBundleReleaseGate(fixture),
      /zj-loop-smoke\.yml \(default runner tags\) rendered YAML is invalid/,
    );
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

async function makeFixture() {
  const fixture = await mkdtemp(path.join(tmpdir(), 'zj-loop-generated-bundle-gate-'));
  await mkdir(path.join(fixture, 'tools', 'zj-loop-core'), { recursive: true });
  await mkdir(path.join(fixture, 'tools', 'zj-loop-init'), { recursive: true });
  await mkdir(path.join(fixture, 'scripts'), { recursive: true });
  await cp(path.join(ROOT, 'templates'), path.join(fixture, 'templates'), { recursive: true });
  await cp(path.join(ROOT, '.github', 'workflows'), path.join(fixture, '.github', 'workflows'), { recursive: true });
  await cp(path.join(ROOT, 'tools', 'zj-loop-core', 'package.json'), path.join(fixture, 'tools', 'zj-loop-core', 'package.json'));
  await cp(path.join(ROOT, 'tools', 'zj-loop-init', 'templates'), path.join(fixture, 'tools', 'zj-loop-init', 'templates'), { recursive: true });
  return fixture;
}
