import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateProviderParityGate } from './validate-provider-parity-gate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('provider parity gate validates GitHub and GitLab generated route surfaces', async () => {
  const result = await validateProviderParityGate();

  assert.equal(result.routeTemplateCount, 9);
  assert.match(result.coreVersion, /^\d+\.\d+\.\d+$/);
  assert.ok(result.routeCount >= 9);
  assert.ok(result.routeFamilyCount >= 10);
  assert.equal(result.routeFamilyEvidenceSchema, 'zj-loop.route_family_provider_parity_evidence.v1');
});

test('provider parity gate requires provider_support inventory for every route', async () => {
  const fixture = await makeProviderParityFixture();
  try {
    const routeTablePath = path.join(fixture, 'templates', 'zj-loop-route-table.yaml.template');
    const routeTable = await readFile(routeTablePath, 'utf8');
    await writeFile(routeTablePath, routeTable.replace(/\n    provider_support:\n(?:      .+\n)+/, '\n'));

    await assert.rejects(
      () => validateProviderParityGate(fixture),
      /missing provider_support/,
    );
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test('provider parity gate rejects invalid provider support status and evidence prefix', async () => {
  const fixture = await makeProviderParityFixture();
  try {
    const routeTablePath = path.join(fixture, 'templates', 'zj-loop-route-table.yaml.template');
    let routeTable = await readFile(routeTablePath, 'utf8');
    routeTable = routeTable
      .replace('status: "dry-run-supported"', 'status: "maybe-later"')
      .replace('evidence: ["template:zj-loop-route-table.yaml.template"', 'evidence: ["note:zj-loop-route-table.yaml.template"');
    await writeFile(routeTablePath, routeTable);

    await assert.rejects(
      () => validateProviderParityGate(fixture),
      /provider_support.github.status invalid: maybe-later[\s\S]+evidence has invalid prefix: note:zj-loop-route-table.yaml.template/,
    );
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test('provider parity gate enforces status-specific provider support fields', async () => {
  const fixture = await makeProviderParityFixture();
  try {
    const routeTablePath = path.join(fixture, 'templates', 'zj-loop-route-table.yaml.template');
    let routeTable = await readFile(routeTablePath, 'utf8');
    routeTable = routeTable
      .replace('status: "dry-run-supported"', 'status: "explicitly-refused-with-reason"')
      .replace('status: "dry-run-supported"', 'status: "blocked-with-follow-up"');
    await writeFile(routeTablePath, routeTable);

    await assert.rejects(
      () => validateProviderParityGate(fixture),
      /explicitly-refused-with-reason requires reason[\s\S]+blocked-with-follow-up requires blocker[\s\S]+blocked-with-follow-up requires follow_up/,
    );
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

async function makeProviderParityFixture() {
  const fixture = await mkdtemp(path.join(tmpdir(), 'zj-loop-provider-parity-'));
  await mkdir(path.join(fixture, 'templates'), { recursive: true });
  await mkdir(path.join(fixture, 'tools', 'zj-loop-core'), { recursive: true });
  await mkdir(path.join(fixture, 'docs', 'designs'), { recursive: true });
  await cp(path.join(ROOT, 'templates', 'github-actions'), path.join(fixture, 'templates', 'github-actions'), { recursive: true });
  await cp(path.join(ROOT, 'templates', 'gitlab-ci'), path.join(fixture, 'templates', 'gitlab-ci'), { recursive: true });
  await cp(path.join(ROOT, 'tools', 'zj-loop-core', 'package.json'), path.join(fixture, 'tools', 'zj-loop-core', 'package.json'));
  await cp(path.join(ROOT, 'templates', 'zj-loop-route-table.yaml.template'), path.join(fixture, 'templates', 'zj-loop-route-table.yaml.template'));
  await cp(
    path.join(ROOT, 'docs', 'designs', 'provider-adapter-parity-architecture.md'),
    path.join(fixture, 'docs', 'designs', 'provider-adapter-parity-architecture.md'),
  );
  await cp(
    path.join(ROOT, 'docs', 'designs', 'dogfood-reference-case.md'),
    path.join(fixture, 'docs', 'designs', 'dogfood-reference-case.md'),
  );
  return fixture;
}
