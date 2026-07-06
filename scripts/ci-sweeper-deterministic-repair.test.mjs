import test from 'node:test';
import assert from 'node:assert/strict';

import { RELEASE_PACKAGES } from './validate-release-workflows.mjs';
import {
  PACKAGE_BUILD_PLAN,
  buildRepairCommands,
  getPackageBuildPlan,
} from './ci-sweeper-deterministic-repair.mjs';

test('deterministic repair plan is derived from release-managed loop packages', () => {
  assert.deepEqual(PACKAGE_BUILD_PLAN, RELEASE_PACKAGES.map((releasePackage) => releasePackage.directory));
  assert.deepEqual(getPackageBuildPlan([{ directory: 'tools/example' }]), ['tools/example']);
});

test('buildRepairCommands exposes the same step order used by dry-run and execution', async () => {
  const commands = await buildRepairCommands({
    packageDirectories: ['tools/zj-loop-core'],
    rootCommands: [
      ['node', ['scripts/check-zj-loop-init-sync.mjs']],
    ],
  });

  assert.deepEqual(commands, [
    { command: 'npm', args: ['ci'], cwd: 'tools/zj-loop-core' },
    { command: 'npm', args: ['run', 'build'], cwd: 'tools/zj-loop-core' },
    { command: 'npm', args: ['ci', '--ignore-scripts'] },
    { command: 'node', args: ['scripts/check-zj-loop-init-sync.mjs'] },
  ]);
});
