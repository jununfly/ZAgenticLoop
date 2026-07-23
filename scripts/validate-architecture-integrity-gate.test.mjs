import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateArchitectureIntegrityGate } from './validate-architecture-integrity-gate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('architecture integrity gate passes the repository contract', async () => {
  const result = await validateArchitectureIntegrityGate();

  assert.equal(result.schema, 'zj-loop.architecture_integrity_gate.v1');
  assert.equal(result.status, 'pass');
  assert.equal(result.side_effects_executed, false);
  assert.ok(result.route_count >= 10);
});

test('architecture integrity gate rejects duplicate route ids', async () => {
  const fixture = await makeFixture();
  try {
    const routePath = path.join(fixture, 'templates', 'zj-loop-route-table.yaml.template');
    const routeTable = await readFile(routePath, 'utf8');
    await writeFile(routePath, routeTable.replace('  - route_id: "ignore"', '  - route_id: "human"'));

    const result = await validateArchitectureIntegrityGate(fixture);

    assert.equal(result.status, 'fail');
    assert.ok(result.errors.some((error) => error.includes('duplicate route human')));
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test('architecture integrity gate rejects workspace provider duplication', async () => {
  const fixture = await makeFixture();
  try {
    const routePath = path.join(fixture, 'templates', 'zj-loop-route-table.yaml.template');
    const routeTable = await readFile(routePath, 'utf8');
    await writeFile(routePath, routeTable.replace(
      '      github:\n        status: "dry-run-supported"',
      '      workspace:\n        status: "dry-run-supported"\n      github:\n        status: "dry-run-supported"',
    ));

    const result = await validateArchitectureIntegrityGate(fixture);

    assert.equal(result.status, 'fail');
    assert.ok(result.errors.some((error) => error.includes('workspace under completion_target.adapters')));
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test('architecture integrity gate rejects missing completion target contract', async () => {
  const fixture = await makeFixture();
  try {
    const routePath = path.join(fixture, 'templates', 'zj-loop-route-table.yaml.template');
    const routeTable = await readFile(routePath, 'utf8');
    await writeFile(routePath, routeTable.replace('  completion_target:\n    id: automation-first-product\n    schema_version: 1\n', '  completion_target:\n    id: another-target\n    schema_version: 1\n'));

    const result = await validateArchitectureIntegrityGate(fixture);

    assert.equal(result.status, 'fail');
    assert.ok(result.errors.some((error) => error.includes('automation-first-product')));
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

async function makeFixture() {
  const fixture = await mkdtemp(path.join(tmpdir(), 'zj-loop-architecture-integrity-'));
  await mkdir(path.join(fixture, 'templates'), { recursive: true });
  await mkdir(path.join(fixture, 'tools', 'zj-loop-core', 'src'), { recursive: true });
  await mkdir(path.join(fixture, 'docs', 'designs'), { recursive: true });
  await mkdir(path.join(fixture, 'scripts'), { recursive: true });
  await cp(path.join(ROOT, 'templates', 'zj-loop-route-table.yaml.template'), path.join(fixture, 'templates', 'zj-loop-route-table.yaml.template'));
  await cp(path.join(ROOT, 'docs', 'designs', 'architecture.md'), path.join(fixture, 'docs', 'designs', 'architecture.md'));
  await cp(path.join(ROOT, 'docs', 'designs', 'completion-alignment-architecture.md'), path.join(fixture, 'docs', 'designs', 'completion-alignment-architecture.md'));
  await cp(path.join(ROOT, 'tools', 'zj-loop-core', 'src', 'completion-alignment.ts'), path.join(fixture, 'tools', 'zj-loop-core', 'src', 'completion-alignment.ts'));
  await cp(path.join(ROOT, 'tools', 'zj-loop-core', 'src', 'doctor-cli.ts'), path.join(fixture, 'tools', 'zj-loop-core', 'src', 'doctor-cli.ts'));
  await cp(path.join(ROOT, 'scripts', 'validate-release-capability-gate.mjs'), path.join(fixture, 'scripts', 'validate-release-capability-gate.mjs'));
  return fixture;
}
