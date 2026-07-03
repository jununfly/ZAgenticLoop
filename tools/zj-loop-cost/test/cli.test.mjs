import { spawnSync } from 'node:child_process';
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
  assert.match(result.stdout, /^daily-triage\tlow\t1d/m);
});

test('zj-loop-cost --help keeps command help', () => {
  const result = runCli(['--help']);
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.match(result.stdout, /zj-loop-cost — estimate daily token spend/);
  assert.match(result.stdout, /--pattern <id>/);
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
