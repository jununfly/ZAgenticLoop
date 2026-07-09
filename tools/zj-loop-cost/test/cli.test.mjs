import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const CLI = fileURLToPath(new URL('../dist/cli.js', import.meta.url));

function runCli(args) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
  });
}

test('zj-loop-cost --list keeps tab-separated output', () => {
  const result = runCli(['--list']);
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.match(result.stdout, /^Registry: /m);
  assert.match(result.stdout, /^daily-triage\tlow\t1d/m);
});

test('zj-loop-cost --help keeps command help', () => {
  const result = runCli(['--help']);
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.match(result.stdout, /zj-loop-cost — estimate daily token spend/);
  assert.match(result.stdout, /--pattern <id>/);
  assert.match(result.stdout, /--registry <path>/);
  assert.match(result.stdout, /--package-registry/);
});

test('zj-loop-cost fails fast on unknown option and missing option value', () => {
  const unknown = runCli(['--unknown']);
  assert.equal(unknown.status, 1);
  assert.equal(unknown.stdout, '');
  assert.match(unknown.stderr, /Unknown option: --unknown/);

  const missing = runCli(['--pattern']);
  assert.equal(missing.status, 1);
  assert.equal(missing.stdout, '');
  assert.match(missing.stderr, /Missing value for option: --pattern/);
});

test('zj-loop-cost keeps business validation for invalid readiness level', () => {
  const result = runCli(['--level', 'garbage']);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /Invalid level/);
});

test('zj-loop-cost accepts roadmap-sliced-development canonical id only', () => {
  const canonical = runCli(['--pattern', 'roadmap-sliced-development']);
  assert.equal(canonical.status, 0);
  assert.equal(canonical.stderr, '');
  assert.match(canonical.stdout, /Loop Cost Estimate — Roadmap-Sliced Development Pattern \(roadmap-sliced-development\)/);

  const legacy = runCli(['--pattern', 'roadmap-sliced-development-pattern']);
  assert.equal(legacy.status, 1);
  assert.match(legacy.stderr, /Unknown pattern/);
});

test('zj-loop-cost prefers project-local registry when project root is provided', () => {
  const project = mkdtempSync(join(tmpdir(), 'zj-loop-cost-local-registry-'));
  mkdirSync(join(project, 'patterns'), { recursive: true });
  writeFileSync(join(project, 'patterns', 'registry.yaml'), `schemaVersion: 1
patterns:
  - id: daily-triage
    name: Daily Triage
    cadence: 1d
    token_cost: low
    cost:
      tokens_noop: 3000
      tokens_report: 25000
      tokens_action: 0
      suggested_daily_cap: 50000
      early_exit_required: true
`);

  const result = runCli([project, '--pattern', 'daily-triage']);
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.match(result.stdout, new RegExp(`Registry: local ${project.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/patterns/registry.yaml`));
  assert.match(result.stdout, /Cadence: 1d\s+→\s+1 runs\/day/);
});

test('zj-loop-cost can use explicit and packaged registries', () => {
  const project = mkdtempSync(join(tmpdir(), 'zj-loop-cost-explicit-registry-'));
  const registryPath = join(project, 'registry.yaml');
  writeFileSync(registryPath, `schemaVersion: 1
patterns:
  - id: custom-loop
    name: Custom Loop
    cadence: 1d
    token_cost: low
    cost:
      tokens_noop: 1
      tokens_report: 2
      tokens_action: 3
      suggested_daily_cap: 10
      early_exit_required: true
`);

  const explicit = runCli(['--registry', registryPath, '--pattern', 'custom-loop']);
  assert.equal(explicit.status, 0);
  assert.equal(explicit.stderr, '');
  assert.match(explicit.stdout, /Registry: explicit /);
  assert.match(explicit.stdout, /Custom Loop \(custom-loop\)/);

  const packaged = runCli(['--package-registry', '--pattern', 'daily-triage', '--json']);
  assert.equal(packaged.status, 0);
  assert.equal(packaged.stderr, '');
  const parsed = JSON.parse(packaged.stdout);
  assert.equal(parsed.registry.label, 'package default');
  assert.equal(parsed.estimate.patternId, 'daily-triage');
});
