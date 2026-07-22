import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertValidGate,
  assertValidToolScript,
  commandForToolPackage,
  getToolPackages,
  parseCliArgs,
  selectToolPackages,
  TOOL_PACKAGES,
} from './run-tool-package-scripts.mjs';

test('TOOL_PACKAGES keeps root tool gate coverage explicit', () => {
  assert.deepEqual(
    TOOL_PACKAGES.map((toolPackage) => toolPackage.id),
    [
      'zj-loop-core',
      'zj-loop-gitlab-infra',
      'zj-loop-github-infra',
      'zj-loop-audit',
      'zj-loop-init',
      'zj-loop-cost',
      'zj-loop-sync',
      'zj-loop-mcp-server',
      'zj-goal-audit',
    ],
  );
  assert.equal(TOOL_PACKAGES.at(-1).role, 'zj-goal');
});

test('selectToolPackages exposes the validate gate subset for CI', () => {
  assert.deepEqual(
    selectToolPackages({ gate: 'validate' }).map((toolPackage) => toolPackage.id),
    ['zj-loop-init', 'zj-loop-sync', 'zj-loop-mcp-server'],
  );
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

test('assertValidGate only allows declared tool gate groups', () => {
  assert.doesNotThrow(() => assertValidGate('root'));
  assert.doesNotThrow(() => assertValidGate('validate'));
  assert.throws(() => assertValidGate('release'), /Expected gate one of/);
});

test('parseCliArgs supports gate selection and per-package install', () => {
  assert.deepEqual(parseCliArgs(['test', '--gate=validate', '--install']), {
    scriptName: 'test',
    options: {
      gate: 'validate',
      install: true,
    },
  });
  assert.throws(() => parseCliArgs(['test', '--unknown']), /Unknown option/);
});
