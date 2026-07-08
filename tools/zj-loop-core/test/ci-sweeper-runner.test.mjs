import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  buildCiSweeperRepairCommands,
  buildCiSweeperRepairPlan,
  formatCommandStep,
  getCiSweeperPackageBuildPlan,
} from '../dist/index.js';

const CI_SWEEPER_CLI = fileURLToPath(new URL('../dist/ci-sweeper-cli.js', import.meta.url));

async function setupPackage() {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-ci-sweeper-'));
  await mkdir(path.join(dir, 'tools', 'example'), { recursive: true });
  await writeFile(path.join(dir, 'tools', 'example', 'package.json'), JSON.stringify({
    name: 'example',
    scripts: { build: 'tsc' },
  }));
  return dir;
}

test('CI Sweeper repair plan is package-list driven', () => {
  assert.deepEqual(getCiSweeperPackageBuildPlan([{ directory: 'tools/example' }]), ['tools/example']);
});

test('buildCiSweeperRepairCommands exposes deterministic command order', async () => {
  const dir = await setupPackage();
  try {
    const commands = await buildCiSweeperRepairCommands({
      root: dir,
      packageDirectories: ['tools/example'],
      rootCommands: [['node', ['scripts/check-zj-loop-init-sync.mjs']]],
    });

    assert.deepEqual(commands, [
      { command: 'npm', args: ['ci'], cwd: 'tools/example' },
      { command: 'npm', args: ['run', 'build'], cwd: 'tools/example' },
      { command: 'npm', args: ['ci', '--ignore-scripts'] },
      { command: 'node', args: ['scripts/check-zj-loop-init-sync.mjs'] },
    ]);
    assert.equal(formatCommandStep(commands[0]), '(cd tools/example && npm ci)');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('buildCiSweeperRepairPlan returns versioned packaged plan', async () => {
  const dir = await setupPackage();
  try {
    const plan = await buildCiSweeperRepairPlan({
      root: dir,
      packageDirectories: ['tools/example'],
      rootInstallCommand: null,
      rootCommands: [],
    });
    assert.equal(plan.schema, 'zj-loop.ci_sweeper_repair_plan.v1');
    assert.deepEqual(plan.package_directories, ['tools/example']);
    assert.deepEqual(plan.commands.map((step) => step.command), ['npm', 'npm']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('zj-loop-ci-sweeper repair-plan CLI prints JSON plan', async () => {
  const dir = await setupPackage();
  try {
    const result = spawnSync(process.execPath, [
      CI_SWEEPER_CLI,
      'repair-plan',
      '--root',
      dir,
      '--packages',
      'tools/example',
      '--json',
    ], { encoding: 'utf8' });
    assert.equal(result.status, 0);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.schema, 'zj-loop.ci_sweeper_repair_plan.v1');
    assert.equal(parsed.commands[0].cwd, 'tools/example');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
