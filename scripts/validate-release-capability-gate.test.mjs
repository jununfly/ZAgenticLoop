import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { validateReleaseCapabilityGate } from './validate-release-capability-gate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const execFileAsync = promisify(execFile);

test('release capability gate derives a ledger from the Route Table', async () => {
  const result = await validateReleaseCapabilityGate();

  assert.equal(result.ledger.schema, 'zj-loop.release_capability_ledger.v1');
  assert.ok(result.ledger.routes.length >= 10);
  assert.equal(result.errors.length, 0);

  const manualSmoke = result.ledger.routes.find((route) => route.route_id === 'manual-smoke-report');
  assert.equal(manualSmoke.claim_level, 'install-ready');
  assert.equal(manualSmoke.evidence_status, 'pass');
  assert.equal(manualSmoke.enabled_by_default, true);
  assert.equal(manualSmoke.provider_support.github.status, 'dry-run-supported');

  const roadmap = result.ledger.routes.find((route) => route.route_id === 'roadmap-sliced-development');
  assert.equal(roadmap.claim_level, 'install-ready');
  assert.equal(roadmap.enabled_by_default, false);
  assert.equal(roadmap.evidence_status, 'pass');
});

test('release capability gate fails locally resolvable missing evidence refs', async () => {
  const fixture = await makeReleaseCapabilityFixture();
  try {
    const routeTablePath = path.join(fixture, 'templates', 'zj-loop-route-table.yaml.template');
    const routeTable = await readFile(routeTablePath, 'utf8');
    await writeFile(routeTablePath, routeTable.replace('workflow:zj-loop-smoke.yml', 'workflow:missing-smoke.yml'));

    const result = await validateReleaseCapabilityGate(fixture);

    assert.ok(result.errors.some((error) => error.includes('missing workflow template: missing-smoke.yml')));
    const manualSmoke = result.ledger.routes.find((route) => route.route_id === 'manual-smoke-report');
    assert.equal(manualSmoke.evidence_status, 'fail');
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test('release capability gate fails route-specific docs capability claims that outrun Route Table truth', async () => {
  const fixture = await makeReleaseCapabilityFixture();
  try {
    const docPath = path.join(fixture, 'docs', 'designs', 'dogfood-reference-case.md');
    await writeFile(docPath, [
      await readFile(docPath, 'utf8'),
      '',
      '| Route | Capability |',
      '| --- | --- |',
      '| CI Sweeper | `execution-ready` |',
    ].join('\n'));

    const result = await validateReleaseCapabilityGate(fixture);

    assert.ok(result.errors.some((error) =>
      error.includes('docs/designs/dogfood-reference-case.md') &&
      error.includes('ci-sweeper') &&
      error.includes('execution-ready')
    ));
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test('release capability gate fails explicit current truth blocks that drift from Route Table', async () => {
  const fixture = await makeReleaseCapabilityFixture();
  try {
    const docPath = path.join(fixture, 'docs', 'designs', 'dogfood-reference-case.md');
    await writeFile(docPath, [
      await readFile(docPath, 'utf8'),
      '',
      '## Drift Fixture',
      '',
      'CI Sweeper',
      '',
      'Current Route Table truth: `consumer_kind: fix-runner`,',
      '`execution.mode: live`, `side_effect_level: pr`, `maturity.runner:',
      'dogfooded`.',
    ].join('\n'));

    const result = await validateReleaseCapabilityGate(fixture);

    assert.ok(result.errors.some((error) =>
      error.includes('docs/designs/dogfood-reference-case.md') &&
      error.includes('ci-sweeper') &&
      error.includes('execution.mode live') &&
      error.includes('request-only')
    ));
    assert.ok(result.errors.some((error) =>
      error.includes('docs/designs/dogfood-reference-case.md') &&
      error.includes('ci-sweeper') &&
      error.includes('maturity.runner dogfooded') &&
      error.includes('install-ready')
    ));
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test('release capability gate CLI emits JSON ledger for automation', async () => {
  const { stdout } = await execFileAsync('node', ['scripts/validate-release-capability-gate.mjs', '--json'], {
    cwd: ROOT,
  });
  const ledger = JSON.parse(stdout);

  assert.equal(ledger.schema, 'zj-loop.release_capability_ledger.v1');
  assert.ok(ledger.routes.some((route) => route.route_id === 'manual-smoke-report'));
});

async function makeReleaseCapabilityFixture() {
  const fixture = await mkdtemp(path.join(tmpdir(), 'zj-loop-release-capability-'));
  await mkdir(path.join(fixture, 'templates'), { recursive: true });
  await mkdir(path.join(fixture, '.github'), { recursive: true });
  await mkdir(path.join(fixture, 'docs', 'designs'), { recursive: true });
  await mkdir(path.join(fixture, 'scripts'), { recursive: true });
  await cp(path.join(ROOT, 'templates', 'github-actions'), path.join(fixture, 'templates', 'github-actions'), { recursive: true });
  await cp(path.join(ROOT, 'templates', 'gitlab-ci'), path.join(fixture, 'templates', 'gitlab-ci'), { recursive: true });
  await cp(path.join(ROOT, '.github', 'workflows'), path.join(fixture, '.github', 'workflows'), { recursive: true });
  await cp(path.join(ROOT, 'README.md'), path.join(fixture, 'README.md'));
  await cp(path.join(ROOT, 'docs', 'QUICKSTART.md'), path.join(fixture, 'docs', 'QUICKSTART.md'));
  await cp(path.join(ROOT, 'templates', 'zj-loop-route-table.yaml.template'), path.join(fixture, 'templates', 'zj-loop-route-table.yaml.template'));
  await cp(path.join(ROOT, 'docs', 'designs', 'dogfood-reference-case.md'), path.join(fixture, 'docs', 'designs', 'dogfood-reference-case.md'));
  await cp(path.join(ROOT, 'docs', 'designs', 'provider-adapter-parity-architecture.md'), path.join(fixture, 'docs', 'designs', 'provider-adapter-parity-architecture.md'));
  await cp(path.join(ROOT, 'docs', 'designs', 'route-consumer-execution-architecture.md'), path.join(fixture, 'docs', 'designs', 'route-consumer-execution-architecture.md'));
  await cp(path.join(ROOT, 'docs', 'designs', 'user-project-execution-ready-bundle.md'), path.join(fixture, 'docs', 'designs', 'user-project-execution-ready-bundle.md'));
  await cp(path.join(ROOT, 'package.json'), path.join(fixture, 'package.json'));
  await cp(path.join(ROOT, 'scripts', 'ci-validate-gates.sh'), path.join(fixture, 'scripts', 'ci-validate-gates.sh'));
  return fixture;
}
