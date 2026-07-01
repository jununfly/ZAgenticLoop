import test from 'node:test';
import assert from 'node:assert/strict';

import { RELEASE_PACKAGES, validateReleaseWorkflows } from './validate-release-workflows.mjs';

test('RELEASE_PACKAGES captures release-managed npm packages', () => {
  assert.deepEqual(
    RELEASE_PACKAGES.map((releasePackage) => releasePackage.packageName),
    [
      '@jununfly/zj-loop-audit',
      '@jununfly/zj-loop-init',
      '@jununfly/zj-loop-cost',
      '@cobusgreyling/goal-audit',
    ],
  );
});

test('validateReleaseWorkflows keeps docs, packages, and workflows aligned', async () => {
  await assert.doesNotReject(() => validateReleaseWorkflows());
});
