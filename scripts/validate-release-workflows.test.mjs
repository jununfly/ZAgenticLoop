import test from 'node:test';
import assert from 'node:assert/strict';

import { RELEASE_PACKAGES, validateReleaseWorkflows } from './validate-release-workflows.mjs';

test('RELEASE_PACKAGES captures release-managed npm packages', () => {
  assert.deepEqual(
    RELEASE_PACKAGES.map((releasePackage) => ({
      packageName: releasePackage.packageName,
      generatedAtRelease: releasePackage.generatedAtRelease ?? [],
      localFileDependencies: releasePackage.localFileDependencies ?? [],
    })),
    [
      { packageName: '@jununfly/zj-loop-core', generatedAtRelease: [], localFileDependencies: [] },
      {
        packageName: '@jununfly/zj-loop-audit',
        generatedAtRelease: [],
        localFileDependencies: ['@jununfly/zj-loop-core'],
      },
      {
        packageName: '@jununfly/zj-loop-init',
        generatedAtRelease: ['starters', 'templates'],
        localFileDependencies: ['@jununfly/zj-loop-core'],
      },
      {
        packageName: '@jununfly/zj-loop-cost',
        generatedAtRelease: [],
        localFileDependencies: ['@jununfly/zj-loop-core'],
      },
      {
        packageName: '@jununfly/zj-loop-sync',
        generatedAtRelease: [],
        localFileDependencies: ['@jununfly/zj-loop-core'],
      },
      {
        packageName: '@jununfly/zj-loop-mcp-server',
        generatedAtRelease: [],
        localFileDependencies: ['@jununfly/zj-loop-core'],
      },
      { packageName: '@cobusgreyling/goal-audit', generatedAtRelease: [], localFileDependencies: [] },
    ],
  );
});

test('release manifest publishes core before packages that depend on it', () => {
  assert.equal(RELEASE_PACKAGES[0].packageName, '@jununfly/zj-loop-core');
});

test('release manifest has a unique package, directory, workflow, and tag universe', () => {
  for (const field of ['id', 'packageName', 'directory', 'workflow', 'tagPattern']) {
    const values = RELEASE_PACKAGES.map((releasePackage) => releasePackage[field]);
    assert.equal(new Set(values).size, values.length, `${field} values must be unique`);
  }
});

test('validateReleaseWorkflows keeps docs, packages, and workflows aligned', async () => {
  await assert.doesNotReject(() => validateReleaseWorkflows());
});

test('release-managed package files stay present, tracked, and publishable', async () => {
  await assert.doesNotReject(() => validateReleaseWorkflows());
});

test('known local file dependencies are explicit release blockers', () => {
  const blockers = RELEASE_PACKAGES
    .filter((releasePackage) => (releasePackage.localFileDependencies ?? []).length > 0)
    .map((releasePackage) => releasePackage.packageName);

  assert.deepEqual(blockers, [
    '@jununfly/zj-loop-audit',
    '@jununfly/zj-loop-init',
    '@jununfly/zj-loop-cost',
    '@jununfly/zj-loop-sync',
    '@jununfly/zj-loop-mcp-server',
  ]);
});
