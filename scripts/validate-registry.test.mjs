import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRegistryAtRoot, validatePattern } from './validate-registry.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const VALID_PATTERN = {
  id: 'daily-triage',
  name: 'Daily Triage',
  file: 'daily-triage.md',
  goal: 'Review project state and report risks.',
  cadence: '1d',
  risk: 'low',
  tools: ['codex'],
  skills: ['zj-loop-triage'],
  state: 'zj-loop/STATE.md',
  phases: ['scan', 'report'],
  human_gates: ['report-only'],
  starter: 'starters/minimal-loop',
  week_one_mode: 'L1',
  token_cost: 'low',
  cost: {
    tokens_noop: 5000,
    tokens_report: 50000,
    tokens_action: 200000,
    suggested_daily_cap: 100000,
    early_exit_required: false,
  },
};

async function writeFixture(root, registryYaml) {
  await mkdir(path.join(root, 'patterns'), { recursive: true });
  await mkdir(path.join(root, 'starters', 'minimal-loop'), { recursive: true });
  await writeFile(
    path.join(root, 'patterns', 'registry.schema.json'),
    await readFile(path.join(REPO_ROOT, 'patterns', 'registry.schema.json'), 'utf8'),
  );
  await writeFile(path.join(root, 'patterns', 'daily-triage.md'), '# Daily Triage\n');
  await writeFile(path.join(root, 'patterns', 'registry.yaml'), registryYaml);
}

async function withFixture(registryYaml, fn) {
  const root = await mkdtemp(path.join(tmpdir(), 'zj-loop-registry-'));
  try {
    await writeFixture(root, registryYaml);
    return await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const VALID_REGISTRY = `
schemaVersion: 1
patterns:
  - id: daily-triage
    name: Daily Triage
    file: daily-triage.md
    goal: Review project state and report risks.
    cadence: 1d
    risk: low
    tools:
      - codex
    skills:
      - zj-loop-triage
    state: zj-loop/STATE.md
    phases:
      - scan
      - report
    human_gates:
      - report-only
    starter: starters/minimal-loop
    week_one_mode: L1
    token_cost: low
    cost:
      tokens_noop: 5000
      tokens_report: 50000
      tokens_action: 200000
      suggested_daily_cap: 100000
      early_exit_required: false
`;

test('validatePattern rejects unknown tools', () => {
  assert.throws(
    () => validatePattern({ ...VALID_PATTERN, tools: ['unknown-tool'] }, 0),
    /unknown tool/,
  );
});

test('validateRegistryAtRoot accepts an aligned registry fixture', async () => {
  await withFixture(VALID_REGISTRY, async (root) => {
    assert.deepEqual(await validateRegistryAtRoot(root), { patternCount: 1 });
  });
});

test('validateRegistryAtRoot rejects unsupported schema versions', async () => {
  await withFixture(VALID_REGISTRY.replace('schemaVersion: 1', 'schemaVersion: 2'), async (root) => {
    await assert.rejects(() => validateRegistryAtRoot(root), /schemaVersion/);
  });
});

test('validateRegistryAtRoot rejects missing starter paths', async () => {
  await withFixture(VALID_REGISTRY.replace('starter: starters/minimal-loop', 'starter: starters/missing'), async (root) => {
    await assert.rejects(() => validateRegistryAtRoot(root), /references missing starter/);
  });
});

test('validateRegistryAtRoot rejects unregistered pattern markdown files', async () => {
  await withFixture(VALID_REGISTRY, async (root) => {
    await writeFile(path.join(root, 'patterns', 'extra-pattern.md'), '# Extra\n');
    await assert.rejects(() => validateRegistryAtRoot(root), /pattern file not in registry/);
  });
});
