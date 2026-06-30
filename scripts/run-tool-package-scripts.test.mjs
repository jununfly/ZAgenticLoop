import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertValidToolScript,
  commandForToolPackage,
  getToolPackages,
  TOOL_PACKAGES,
} from './run-tool-package-scripts.mjs';

test('TOOL_PACKAGES keeps root tool gate coverage explicit', () => {
  assert.deepEqual(
    TOOL_PACKAGES.map((toolPackage) => toolPackage.id),
    [
      'zj-loop-core',
      'zj-loop-audit',
      'zj-loop-init',
      'zj-loop-cost',
      'zj-loop-sync',
      'zj-loop-mcp-server',
      'goal-audit',
    ],
  );
  assert.equal(TOOL_PACKAGES.at(-1).role, 'companion');
});

test('getToolPackages returns defensive copies', () => {
  const packages = getToolPackages();
  packages[0].id = 'mutated';
  assert.equal(TOOL_PACKAGES[0].id, 'zj-loop-core');
});

test('commandForToolPackage uses npm prefix without shell-specific cd chains', () => {
  assert.deepEqual(commandForToolPackage(TOOL_PACKAGES[0], 'build'), {
    command: 'npm',
    args: ['--prefix', 'tools/zj-loop-core', 'run', 'build'],
  });
});

test('assertValidToolScript only allows root quality gate scripts', () => {
  assert.doesNotThrow(() => assertValidToolScript('build'));
  assert.doesNotThrow(() => assertValidToolScript('test'));
  assert.throws(() => assertValidToolScript('publish'), /Expected one of/);
});
