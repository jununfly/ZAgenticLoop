import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runSync, formatReport } from '../dist/sync.js';

const testDir = path.join(process.cwd(), '.test-tmp');
const CLI = fileURLToPath(new URL('../dist/cli.js', import.meta.url));

async function setupTestDir() {
  await mkdir(testDir, { recursive: true });

  await writeFile(
    path.join(testDir, 'STATE.md'),
    `# Loop State

Last run: 2026-06-22

## High Priority
- No items

## Watch List
- No items
`,
  );

  await writeFile(
    path.join(testDir, 'LOOP.md'),
    `# Loop Configuration

## Patterns
- daily-triage

## State Files
- STATE.md

## Schedule
- Cadence: 1d
- Level: L1
`,
  );
}

async function cleanupTestDir() {
  await rm(testDir, { recursive: true, force: true });
}

const baseOpts = { autoFix: false, dryRun: false, verbose: false };

describe('runSync', () => {
  beforeEach(setupTestDir);
  afterEach(cleanupTestDir);

  test('returns a valid DriftReport', async () => {
    const report = await runSync({ targetDir: testDir, ...baseOpts });

    assert.equal(typeof report.score, 'number');
    assert.ok(['healthy', 'warning', 'critical'].includes(report.level));
    assert.ok(Array.isArray(report.issues));
    assert.ok(Array.isArray(report.suggestions));
    assert.ok(report.timestamp);
  });

  test('detects missing AGENTS.md', async () => {
    const report = await runSync({ targetDir: testDir, ...baseOpts });
    const agentsIssue = report.issues.find((i) => i.file === 'AGENTS.md');
    assert.ok(agentsIssue);
    assert.match(agentsIssue.message, /missing/i);
  });

  test('calculates score in range', async () => {
    const report = await runSync({ targetDir: testDir, ...baseOpts });
    assert.ok(report.score >= 0);
    assert.ok(report.score <= 100);
  });

  test('provides suggestions', async () => {
    const report = await runSync({ targetDir: testDir, ...baseOpts });
    assert.ok(report.suggestions.length > 0);
  });
});

describe('formatReport', () => {
  test('formats healthy report', () => {
    const formatted = formatReport({
      score: 85,
      level: 'healthy',
      issues: [],
      suggestions: ['Run zj-loop-init'],
      timestamp: new Date().toISOString(),
    });

    assert.match(formatted, /Loop Sync Report/);
    assert.match(formatted, /85\/100/);
  });

  test('shows issues when present', () => {
    const formatted = formatReport({
      score: 60,
      level: 'warning',
      issues: [
        {
          type: 'missing',
          file: 'AGENTS.md',
          message: 'AGENTS.md is missing',
          severity: 'error',
        },
      ],
      suggestions: [],
      timestamp: new Date().toISOString(),
    });

    assert.match(formatted, /AGENTS\.md/);
    assert.match(formatted, /missing/i);
  });
});

function runCli(args) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
  });
}

describe('cli', () => {
  beforeEach(setupTestDir);
  afterEach(cleanupTestDir);

  test('prints help without running sync', () => {
    const result = runCli(['--help']);
    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    assert.match(result.stdout, /zj-loop-sync — detect and sync drift/);
  });

  test('outputs JSON when --json is provided', () => {
    const result = runCli([testDir, '--json']);
    assert.equal(result.status, 2);
    assert.equal(result.stderr, '');
    const report = JSON.parse(result.stdout);
    assert.equal(typeof report.score, 'number');
    assert.equal(report.level, 'warning');
  });

  test('fails fast on unknown option', () => {
    const result = runCli(['--wat']);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /Unknown option: --wat/);
  });
});
