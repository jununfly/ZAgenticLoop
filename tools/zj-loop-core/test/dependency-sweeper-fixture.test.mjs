import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildDependencySweeperFixtureContract,
  validateDependencySweeperFixtureContract,
} from '../dist/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const FIXTURE = path.join(ROOT, 'zj-loop', 'dogfood', 'dependency-fixture');

test('Dependency Sweeper fixture is the fixed yaml patch baseline', async () => {
  const contract = buildDependencySweeperFixtureContract();
  assert.deepEqual(contract, {
    schema: 'zj-loop.dependency_sweeper_fixture.v1',
    package_name: 'yaml',
    current_version: '2.8.0',
    target_version: '2.8.1',
    update_type: 'patch',
    dependency_section: 'dependencies',
    manifest_files: ['package.json', 'package-lock.json'],
    verification_commands: [
      { command: 'npm', args: ['ci'], cwd: '.' },
      { command: 'npm', args: ['test'], cwd: '.' },
    ],
  });
  const packageJson = JSON.parse(await readFile(path.join(FIXTURE, 'package.json'), 'utf8'));
  assert.equal(packageJson.dependencies.yaml, '2.8.0');
});

test('fixture verifier fails closed on unrelated package, version, section, or file scope', () => {
  const contract = buildDependencySweeperFixtureContract();
  const baseSubject = {
    package_name: 'yaml', current_version: '2.8.0', target_version: '2.8.1',
    update_type: 'patch', dependency_section: 'dependencies',
    manifest_files: ['package.json', 'package-lock.json'],
  };
  const valid = validateDependencySweeperFixtureContract({
    contract,
    request: { subject: baseSubject },
    changedFiles: ['package.json', 'package-lock.json'],
  });
  assert.deepEqual(valid, { ok: true, errors: [] });

  for (const [subject, files, expected] of [
    [{ package_name: 'ajv' }, ['package.json', 'package-lock.json'], 'package-name-mismatch'],
    [{ target_version: '2.9.0' }, ['package.json', 'package-lock.json'], 'target-version-mismatch'],
    [{ dependency_section: 'devDependencies' }, ['package.json', 'package-lock.json'], 'dependency-section-mismatch'],
    [{}, ['package.json', 'README.md'], 'changed-file-scope-mismatch'],
  ]) {
    const result = validateDependencySweeperFixtureContract({
      contract,
      request: { subject: { ...baseSubject, ...subject } },
      changedFiles: files,
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes(expected), `${expected}: ${result.errors.join(', ')}`);
  }
});
