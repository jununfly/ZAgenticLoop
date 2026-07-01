import test from 'node:test';
import assert from 'node:assert/strict';

import { RELEASE_PACKAGES, validateReleaseWorkflows } from './validate-release-workflows.mjs';

test('RELEASE_PACKAGES captures release-managed npm packages', () => {
  assert.deepEqual(
    RELEASE_PACKAGES.map((releasePackage) => ({
      packageName: releasePackage.packageName,
      generatedAtRelease: releasePackage.generatedAtRelease ?? [],
    })),
    [
      { packageName: '@jununfly/zj-loop-core', generatedAtRelease: [] },
      { packageName: '@jununfly/zj-loop-audit', generatedAtRelease: [] },
      { packageName: '@jununfly/zj-loop-init', generatedAtRelease: ['starters', 'templates'] },
      { packageName: '@jununfly/zj-loop-cost', generatedAtRelease: [] },
      { packageName: '@cobusgreyling/goal-audit', generatedAtRelease: [] },
    ],
  );
});

test('release manifest publishes core before packages that depend on it', () => {
  assert.equal(RELEASE_PACKAGES[0].packageName, '@jununfly/zj-loop-core');
});

test('validateReleaseWorkflows keeps docs, packages, and workflows aligned', async () => {
  await assert.doesNotReject(() => validateReleaseWorkflows());
});

test('release-managed package files stay present, tracked, and publishable', async () => {
  await assert.doesNotReject(() => validateReleaseWorkflows());
});
